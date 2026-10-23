import { startTrace } from './tracing.js';
import { OutboxError } from '../errors.js';
import { createEmitter } from '../emitter.js';
import { schemaVersion } from '../migrations/runner.js';
import { claim, claimSql } from '../sql/claim.js';
import { release } from '../sql/lease.js';
import { createListener } from './listen.js';
import { createReclaimer } from './reclaim.js';
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

/** Construct the relay engine with single-use lifecycle and fenced shutdown. */
export function createRelay<TDb, TTx>(
  original: DriverAdapter<TDb, TTx>,
  config: ResolvedOutboxConfig,
  input: unknown,
): Relay {
  const options = parseRelayOptions(input);
  const adapter = options.db === undefined ? original : original.withDb(options.db as TDb);
  const { relayId } = options;
  const emitter = createEmitter(relayId);
  const flusher = createFlusher(adapter, config, options, emitter);
  const reclaimer = createReclaimer(adapter, config, options, emitter);
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
  const listenAdapter = typeof options.listen === 'object' ? original.withDb(options.listen.db as TDb) : adapter;
  const listener =
    options.listen && listenAdapter.listen
      ? createListener(
          listenAdapter,
          config.channel,
          () => {
            if (scheduler.stopping) return;
            scheduler.intervalMs = options.poll.minIntervalMs;
            scheduler.wakePending = true;
            wake.emit();
          },
          (error) => {
            emitter.emit('error', { relayId, phase: 'listen', error });
          },
        )
      : undefined;
  let state: Relay['state'] = 'idle';
  let loop: Promise<void> | undefined;
  let starting: Promise<void> | undefined;
  let stopPromise: Promise<StopResult> | undefined;
  let schemaChecked = false;
  let onceQueue: Promise<unknown> = Promise.resolve();
  const active = new Map<Promise<void>, { message: OutboxMessage; controller: AbortController; forced: boolean }>();
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
  const selectedClaim = claimSql(options.ordering, topics !== undefined);
  async function claimBatch(limit: number) {
    const span = startTrace(options.tracer, emitter, relayId, 'outbox claim', {
      'outbox.relay_id': relayId,
      'outbox.requested': limit,
    });
    try {
      const rows = await claim(adapter, config, {
        relayId,
        limit,
        leaseMs: options.leaseMs,
        sql: selectedClaim,
        ...(topics === undefined ? {} : { topics }),
      });
      span.set('outbox.claimed', rows.length);
      return rows;
    } catch (error) {
      span.error(error);
      throw error;
    } finally {
      span.end();
    }
  }
  function startDeliveries(rows: OutboxMessage[], claimedAt: number) {
    if (!rows.length) return;
    rows.sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : BigInt(a.seq) > BigInt(b.seq) ? 1 : 0));
    for (const message of rows) {
      const target: Publisher | undefined = options.publisher ?? options.handlers[message.topic];
      if (!target) throw new OutboxError('OUTBOX_INTERNAL', 'Claimed topic has no target. Please report.');
      scheduler.active++;
      const delivery = { message, controller: new AbortController(), forced: false };
      const span = startTrace(options.tracer, emitter, relayId, 'outbox deliver', {
        'messaging.system': 'outbox',
        'messaging.operation.type': 'process',
        'messaging.destination.name': message.topic,
        'messaging.message.id': message.id,
        'outbox.attempt': message.attempts,
        ...(message.key === null ? {} : { 'outbox.key': message.key }),
      });
      const pending = deliver(message, target, delivery.controller, options, claimedAt)
        .then((outcome) => {
          if (outcome.kind === 'failed') span.error(outcome.error);
          span.end();
          if (delivery.forced) return;
          if (outcome.kind === 'done') flusher.complete(outcome);
          else flusher.fail(outcome);
        })
        .finally(() => {
          scheduler.active--;
          active.delete(pending);
          slot.emit();
        });
      active.set(pending, delivery);
    }
    // Register every claimed delivery before listeners can synchronously request stop.
    emitter.emit('claimed', {
      relayId,
      count: rows.length,
      ids: rows.map((row) => row.id),
      durationMs: performance.now() - claimedAt,
    });
  }
  const wrongState = () => new OutboxError('OUTBOX_RELAY_STATE', 'Relay is ' + state);
  async function runOnce(): Promise<RunOnceResult> {
    if (state !== 'idle') throw wrongState();
    const previous = { ...counts };
    if (!schemaChecked) {
      await schemaVersion(adapter, config);
      schemaChecked = true;
    }
    await reclaimer.pass();
    const started = performance.now();
    startDeliveries(await claimBatch(Math.min(options.batchSize, options.concurrency)), started);
    await Promise.all(active.keys());
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
  const stopping = () => scheduler.stopping;
  const onAbort = () => {
    void stop();
  };
  function stop(overrides: { drainTimeoutMs?: number } = {}): Promise<StopResult> {
    if (stopPromise) return stopPromise;
    if (state === 'idle' || state === 'stopped') {
      state = 'stopped';
      stopPromise = Promise.resolve({ drained: true, released: 0, durationMs: 0 });
      return stopPromise;
    }
    const started = performance.now();
    state = 'stopping';
    scheduler.stopping = true;
    stopSignal.emit();
    reclaimer.stop();
    const closingListener = listener?.close();
    options.signal?.removeEventListener('abort', onAbort);
    stopPromise = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<false>((resolve) => {
        timer = setTimeout(() => {
          resolve(false);
        }, overrides.drainTimeoutMs ?? options.drainTimeoutMs);
      });
      const drain = (async () => {
        await closingListener;
        await starting?.catch(() => undefined);
        await loop;
        await Promise.all(active.keys());
        await flusher.drain();
        return true;
      })();
      const drained = await Promise.race([drain, timeout]);
      clearTimeout(timer);
      // A claim already in progress must register its deliveries before we fence their release.
      await starting?.catch(() => undefined);
      await loop;
      const remaining = [...active.values()];
      for (const delivery of remaining) {
        delivery.forced = true;
        delivery.controller.abort(new OutboxError('OUTBOX_SHUTDOWN', 'Relay stopped before delivery finished'));
      }
      let released = 0;
      if (remaining.length) {
        try {
          released = (
            await release(
              adapter,
              config,
              relayId,
              remaining.map(({ message }) => ({ id: message.id, attempt: message.attempts })),
            )
          ).length;
        } catch (error) {
          emitter.emit('error', {
            relayId,
            phase: 'release',
            error: new OutboxError('OUTBOX_DRIVER', 'Failed release statement', {
              cause: error,
              details: { statement: 'release' },
            }),
          });
        }
      }
      await Promise.all(active.keys());
      await flusher.finish();
      state = 'stopped';
      return { drained, released, durationMs: performance.now() - started };
    })();
    return stopPromise;
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
      state = 'starting';
      starting = (async () => {
        try {
          await schemaVersion(adapter, config);
          schemaChecked = true;
        } catch (error) {
          state = 'stopped';
          throw error;
        }
        if (stopping()) return;
        await reclaimer.safely();
        if (stopping()) return;
        await listener?.start();
        if (stopping()) return;
        reclaimer.start();
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
        options.signal?.addEventListener('abort', onAbort, { once: true });
        if (options.signal?.aborted) onAbort();
      })();
      return starting;
    },
    stop,
    runOnce() {
      // Serialize batch calls to preserve the per-relay concurrency limit.
      const next = onceQueue.then(runOnce);
      onceQueue = next.catch(() => undefined);
      return next;
    },
  };
}
