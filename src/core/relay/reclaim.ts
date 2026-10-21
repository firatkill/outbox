import { reclaim } from '../sql/lease.js';
import { OutboxError } from '../errors.js';
import type { RelayEmitter } from '../emitter.js';
import type { ResolvedOutboxConfig, SqlExecutor } from '../types.js';

/** Reclaim complete batches, with one non-overlapping, unreferenced timer chain. */
export function createReclaimer(
  executor: SqlExecutor,
  config: ResolvedOutboxConfig,
  options: { relayId: string; reclaimBatchSize: number; reclaimIntervalMs: number },
  emitter: RelayEmitter,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const { relayId } = options;
  async function pass() {
    for (;;) {
      const rows = await reclaim(executor, config, options.reclaimBatchSize);
      if (rows.length) {
        emitter.emit('reclaimed', {
          relayId,
          count: rows.length,
          ids: rows.map((row) => row.id),
          deadIds: rows.filter((row) => row.status === 'dead').map((row) => row.id),
        });
        for (const row of rows) {
          if (row.status === 'dead')
            emitter.emit('dead', { relayId, message: row, error: new Error('OUTBOX_LEASE_EXPIRED') });
        }
      }
      if (rows.length < options.reclaimBatchSize) return;
    }
  }
  async function safely() {
    try {
      await pass();
    } catch (error) {
      emitter.emit('error', {
        relayId,
        phase: 'reclaim',
        error: new OutboxError('OUTBOX_DRIVER', 'Failed reclaim statement', {
          cause: error,
          details: { statement: 'reclaim' },
        }),
      });
    }
  }
  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      void safely().then(schedule);
    }, options.reclaimIntervalMs);
    timer.unref();
  }
  return {
    pass,
    safely,
    start: schedule,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
