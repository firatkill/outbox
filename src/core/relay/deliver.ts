import { computeBackoffMs } from '../backoff.js';
import { isNonRetryableError, isRetryableError, OutboxError } from '../errors.js';
import type { OutboxMessage, Publisher } from '../types.js';
import type { ResolvedRelayOptions } from './options.js';

interface OutcomeBase {
  message: OutboxMessage;
  durationMs: number;
  claimedAtMonotonic: number;
}
export type DeliveryOutcome = OutcomeBase &
  ({ kind: 'done' } | { kind: 'failed'; error: unknown; delayMs: number; terminal: boolean });

/** Run outside a transaction, racing the target against its abort signal. */
export async function deliver(
  message: OutboxMessage,
  target: Publisher,
  controller: AbortController,
  options: Pick<ResolvedRelayOptions, 'relayId' | 'handlerTimeoutMs' | 'retry'>,
  claimedAtMonotonic: number,
): Promise<DeliveryOutcome> {
  const t0 = performance.now();
  const timer = setTimeout(() => {
    controller.abort(
      new OutboxError('OUTBOX_HANDLER_TIMEOUT', 'Handler exceeded ' + String(options.handlerTimeoutMs) + 'ms'),
    );
  }, options.handlerTimeoutMs);
  let detach: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    const abort = () => {
      reject(controller.signal.reason as Error);
    };
    controller.signal.addEventListener('abort', abort, { once: true });
    detach = () => {
      controller.signal.removeEventListener('abort', abort);
    };
    if (controller.signal.aborted) abort();
  });
  const handler = Promise.resolve().then(() =>
    target(message, { signal: controller.signal, attempt: message.attempts, relayId: options.relayId }),
  );
  // Observe orphaned targets even when timeout/shutdown wins the race.
  void handler.catch(() => undefined);
  try {
    await Promise.race([handler, aborted]);
    return { kind: 'done', message, claimedAtMonotonic, durationMs: performance.now() - t0 };
  } catch (error) {
    const delayMs =
      isRetryableError(error) && error.retryAfterMs !== undefined
        ? Math.min(options.retry.maxDelayMs, Math.max(0, error.retryAfterMs))
        : computeBackoffMs(message.attempts, options.retry);
    return {
      kind: 'failed',
      message,
      claimedAtMonotonic,
      durationMs: performance.now() - t0,
      error,
      delayMs,
      terminal: isNonRetryableError(error),
    };
  } finally {
    clearTimeout(timer);
    detach();
  }
}
