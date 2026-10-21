import { complete, fail } from '../sql/outcome.js';
import { formatLastError, OutboxError } from '../errors.js';
import type { RelayEmitter } from '../emitter.js';
import type { ResolvedOutboxConfig, SqlExecutor } from '../types.js';
import type { DeliveryOutcome } from './deliver.js';
import { createSignal, waitForSignals } from './loop.js';

type Completed = Extract<DeliveryOutcome, { kind: 'done' }>;
type Failed = Extract<DeliveryOutcome, { kind: 'failed' }>;
/** Buffer outcomes, flush whole batches, and retry only statements that failed. */
export function createFlusher(
  executor: SqlExecutor,
  config: ResolvedOutboxConfig,
  options: { relayId: string; leaseMs: number },
  emitter: RelayEmitter,
) {
  let completes: Completed[] = [];
  let fails: Failed[] = [];
  let running: Promise<void> | undefined;
  let errorDelay = 1000;
  let shutdownRetries: number | undefined;
  let abandoned = false;
  const changed = createSignal();
  const { relayId } = options;
  function live<T extends DeliveryOutcome>(items: T[]): T[] {
    return items.filter((item) => performance.now() < item.claimedAtMonotonic + options.leaseMs);
  }
  async function retry(error: unknown, statement: string) {
    emitter.emit('error', {
      relayId,
      phase: 'flush',
      error: new OutboxError('OUTBOX_DRIVER', 'Failed ' + statement + ' statement', {
        cause: error,
        details: { statement },
      }),
    });
    if (shutdownRetries === 0) {
      abandoned = true;
      completes = [];
      fails = [];
      return;
    }
    const delay = shutdownRetries === undefined ? errorDelay : 1000;
    if (shutdownRetries !== undefined) shutdownRetries--;
    await waitForSignals([changed], delay);
    errorDelay = Math.min(30000, errorDelay * 2);
  }
  async function flushLoop(): Promise<void> {
    while (!abandoned && (completes.length || fails.length)) {
      const expired = [...completes, ...fails].filter(
        (item) => performance.now() >= item.claimedAtMonotonic + options.leaseMs,
      );
      if (expired.length)
        emitter.emit('error', {
          relayId,
          phase: 'flush',
          error: new OutboxError('OUTBOX_DRIVER', 'Outcome lease estimates expired; leases will be reclaimed.', {
            details: { statement: 'flush', ids: expired.map((item) => item.message.id) },
          }),
        });

      const done = live(completes);
      const failed = live(fails);
      completes = [];
      fails = [];
      if (done.length) {
        try {
          const ids = new Set(
            await complete(
              executor,
              config,
              relayId,
              done.map((item) => ({ id: item.message.id, attempt: item.message.attempts })),
            ),
          );
          errorDelay = 1000;
          for (const item of done) {
            if (ids.has(item.message.id))
              emitter.emit('delivered', { relayId, message: item.message, durationMs: item.durationMs });
            else
              emitter.emit('leaseLost', {
                relayId,
                id: item.message.id,
                attempt: item.message.attempts,
                outcome: 'done',
              });
          }
        } catch (error) {
          completes = [...done, ...completes];
          // The failed batch has not been sent; retain it for the next cycle.
          fails = [...failed, ...fails];
          await retry(error, 'complete');
          continue;
        }
      }
      if (failed.length) {
        try {
          const rows = await fail(
            executor,
            config,
            relayId,
            failed.map((item) => ({
              id: item.message.id,
              attempt: item.message.attempts,
              delayMs: item.delayMs,
              error: formatLastError(item.error),
              terminal: item.terminal,
            })),
          );
          errorDelay = 1000;
          const byId = new Map(rows.map((row) => [row.id, row]));
          for (const item of failed) {
            const row = byId.get(item.message.id);
            if (!row) {
              emitter.emit('leaseLost', {
                relayId,
                id: item.message.id,
                attempt: item.message.attempts,
                outcome: 'failed',
              });
              continue;
            }
            emitter.emit('failed', {
              relayId,
              message: item.message,
              error: item.error,
              willRetry: row.status === 'pending',
              retryInMs: row.status === 'pending' ? item.delayMs : null,
            });
            if (row.status === 'dead') emitter.emit('dead', { relayId, message: item.message, error: item.error });
          }
        } catch (error) {
          fails = [...failed, ...fails];
          await retry(error, 'fail');
        }
      }
    }
  }
  function kick() {
    if (running) return;
    running = flushLoop().finally(() => {
      running = undefined;
      if (!abandoned && (completes.length || fails.length)) kick();
    });
  }
  return {
    complete(item: Completed) {
      completes.push(item);
      kick();
    },
    fail(item: Failed) {
      fails.push(item);
      kick();
    },
    async finish() {
      shutdownRetries = 3;
      changed.emit();
      while (running) await running;
    },
    async drain() {
      while (running) await running;
    },
  };
}
