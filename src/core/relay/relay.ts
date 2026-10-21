import { OutboxError } from '../errors.js';
import { createEmitter } from '../emitter.js';
import { schemaVersion } from '../migrations/runner.js';
import { claim } from '../sql/claim.js';
import { reclaim } from '../sql/lease.js';
import type {
  DriverAdapter,
  OutboxMessage,
  Publisher,
  Relay,
  ResolvedOutboxConfig,
  RunOnceResult,
  StopResult,
} from '../types.js';
import { parseRelayOptions } from './options.js';
import { deliver } from './deliver.js';
import { createFlusher } from './flush.js';
import { createSignal, runLoop } from './loop.js';
import type { SchedulerState } from './scheduler.js';

/** Construct the unordered relay engine. Full lifecycle is completed in T-17. */
export function createRelay<TDb, TTx>(
  original: DriverAdapter<TDb, TTx>,
  config: ResolvedOutboxConfig,
  input: unknown,
): Relay {
  const options = parseRelayOptions(input);
  if (options.ordering === 'key') throw new OutboxError('OUTBOX_INTERNAL', 'Ordering is not implemented yet (T-22).');
  const adapter = options.db === undefined ? original : original.withDb(options.db as TDb);
  const { relayId } = options;
  const emitter = createEmitter(relayId);
  const flusher = createFlusher(adapter, config, options, emitter);
  const slot = createSignal(),
    wake = createSignal(),
    stopSignal = createSignal();
  const scheduler: SchedulerState = {
    active: 0,
    concurrency: options.concurrency,
    batchSize: options.batchSize,
    last: null,
    intervalMs: options.poll.minIntervalMs,
    wakePending: false,
    stopping: false,
  };
  let state: Relay['state'] = 'idle';
  let loop: Promise<void> | undefined;
  let stopPromise: Promise<StopResult> | undefined;
  let schemaChecked = false;
  let onceQueue: Promise<unknown> = Promise.resolve();
  const active = new Set<Promise<void>>();
  const counts: RunOnceResult = { claimed: 0, delivered: 0, failed: 0, dead: 0, leaseLost: 0, reclaimed: 0 };
  emitter.on('claimed', (event) => {
    counts.claimed += event.count;
  });
  emitter.on('delivered', () => {
    counts.delivered++;
  });
  emitter.on('failed', () => {
    counts.failed++;
  });
  emitter.on('dead', () => {
    counts.dead++;
  });
  emitter.on('leaseLost', () => {
    counts.leaseLost++;
  });
  emitter.on('reclaimed', (event) => {
    counts.reclaimed += event.count;
  });
  const topics =
    options.handlers === undefined ? ('topics' in options ? options.topics : undefined) : Object.keys(options.handlers);
  function claimBatch(limit: number) {
    return claim(adapter, config, {
      relayId,
      limit,
      leaseMs: options.leaseMs,
      ...(topics === undefined ? {} : { topics }),
    });
  }
  function startDeliveries(rows: OutboxMessage[], claimedAt: number) {
    if (!rows.length) return;
    rows.sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : BigInt(a.seq) > BigInt(b.seq) ? 1 : 0));
    for (const message of rows) {
      const target: Publisher | undefined = options.publisher ?? options.handlers[message.topic];
      if (!target) throw new OutboxError('OUTBOX_INTERNAL', 'Claimed topic has no target. Please report.');
      scheduler.active++;
      const pending = deliver(message, target, new AbortController(), options, claimedAt)
        .then((outcome) => {
          if (outcome.kind === 'done') flusher.complete(outcome);
          else flusher.fail(outcome);
        })
        .finally(() => {
          scheduler.active--;
          active.delete(pending);
          slot.emit();
        });
      active.add(pending);
    }
    // Register every claimed delivery before listeners can synchronously request stop.
    emitter.emit('claimed', {
      relayId,
      count: rows.length,
      ids: rows.map((row) => row.id),
      durationMs: performance.now() - claimedAt,
    });
  }
  async function reclaimPass() {
    for (;;) {
      const rows = await reclaim(adapter, config, options.reclaimBatchSize);
      if (rows.length) {
        emitter.emit('reclaimed', {
          relayId,
          count: rows.length,
          ids: rows.map((row) => row.id),
          deadIds: rows.filter((row) => row.status === 'dead').map((row) => row.id),
        });
        for (const row of rows)
          if (row.status === 'dead')
            emitter.emit('dead', { relayId, message: row, error: new Error('OUTBOX_LEASE_EXPIRED') });
      }
      if (rows.length < options.reclaimBatchSize) return;
    }
  }
  const wrongState = () => new OutboxError('OUTBOX_RELAY_STATE', 'Relay is ' + state);
  async function runOnce(): Promise<RunOnceResult> {
    if (state !== 'idle') throw wrongState();
    const previous = { ...counts };
    if (!schemaChecked) {
      await schemaVersion(adapter, config);
      schemaChecked = true;
    }
    await reclaimPass();
    const started = performance.now();
    startDeliveries(await claimBatch(Math.min(options.batchSize, options.concurrency)), started);
    await Promise.all(active);
    await flusher.drain();
    return {
      claimed: counts.claimed - previous.claimed,
      delivered: counts.delivered - previous.delivered,
      failed: counts.failed - previous.failed,
      dead: counts.dead - previous.dead,
      leaseLost: counts.leaseLost - previous.leaseLost,
      reclaimed: counts.reclaimed - previous.reclaimed,
    };
  }
  return {
    id: relayId,
    get state() {
      return state;
    },
    on: emitter.on,
    off: emitter.off,
    start() {
      if (state !== 'idle') return Promise.reject(wrongState());
      state = 'running';
      loop = runLoop({
        state: scheduler,
        poll: options.poll,
        relayId,
        emitter,
        slot,
        wake,
        stop: stopSignal,
        claim: claimBatch,
        deliver: startDeliveries,
      });
      return Promise.resolve();
    },
    stop() {
      if (stopPromise) return stopPromise;
      if (state === 'idle') {
        state = 'stopped';
        stopPromise = Promise.resolve({ drained: true, released: 0, durationMs: 0 });
        return stopPromise;
      }
      const started = performance.now();
      state = 'stopping';
      scheduler.stopping = true;
      stopSignal.emit();
      stopPromise = (async () => {
        await loop;
        await Promise.all(active);
        await flusher.drain();
        state = 'stopped';
        return { drained: true, released: 0, durationMs: performance.now() - started };
      })();
      return stopPromise;
    },
    runOnce() {
      // Serialize batch calls to preserve the per-relay concurrency limit.
      const next = onceQueue.then(runOnce);
      onceQueue = next.catch(() => undefined);
      return next;
    },
  };
}
