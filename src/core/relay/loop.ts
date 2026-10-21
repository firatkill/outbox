import { OutboxError } from '../errors.js';
import { decide, nextInterval } from './scheduler.js';
import type { SchedulerState } from './scheduler.js';
import type { OutboxMessage } from '../types.js';
import type { RelayEmitter } from '../emitter.js';

export function createSignal() {
  const listeners = new Set<() => void>();
  return {
    emit() {
      for (const listener of Array.from(listeners)) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type Signal = ReturnType<typeof createSignal>;
/** Wait for a condition change, disposing every other subscription when it wins. */
export function waitForSignals(signals: readonly Signal[], ms?: number): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe: (() => unknown)[] = [];
    const finish = () => {
      clearTimeout(timer);
      for (const off of unsubscribe) off();
      resolve();
    };
    for (const signal of signals) unsubscribe.push(signal.subscribe(finish));
    if (ms !== undefined) timer = setTimeout(finish, ms);
  });
}
/** Poll without transactions; failures back off and remain inside the loop. */
export async function runLoop(args: {
  state: SchedulerState;
  poll: { minIntervalMs: number; maxIntervalMs: number };
  relayId: string;
  emitter: RelayEmitter;
  slot: Signal;
  wake: Signal;
  stop: Signal;
  claim(size: number): Promise<OutboxMessage[]>;
  deliver(rows: OutboxMessage[], claimedAt: number): void;
}): Promise<void> {
  const { state } = args;
  let errorBackoff = 1000;
  const woke = () => state.wakePending;
  const stopping = () => state.stopping;
  for (;;) {
    const decision = decide(state);
    if (decision.kind === 'exit') return;
    if (decision.kind === 'wait-slot') {
      await waitForSignals([args.slot, args.wake, args.stop]);
      continue;
    }
    if (decision.kind === 'sleep') await waitForSignals([args.wake, args.stop], decision.ms);
    if (stopping()) return;
    const size = Math.min(state.batchSize, state.concurrency - state.active);
    const previousEmpty = !state.wakePending && state.last?.claimed === 0;
    state.wakePending = false;
    const started = performance.now();
    try {
      const rows = await args.claim(size);
      errorBackoff = 1000;
      state.intervalMs = woke()
        ? args.poll.minIntervalMs
        : nextInterval(previousEmpty ? state.intervalMs : 0, size, rows.length, args.poll);
      state.last = { requested: size, claimed: rows.length };
      args.deliver(rows, started);
    } catch (error) {
      args.emitter.emit('error', {
        relayId: args.relayId,
        phase: 'claim',
        error: new OutboxError('OUTBOX_DRIVER', 'Failed claim statement', {
          cause: error,
          details: { statement: 'claim' },
        }),
      });
      if (!stopping()) await waitForSignals([args.stop], errorBackoff);
      errorBackoff = Math.min(30000, errorBackoff * 2);
    }
  }
}
