const BRAND = Symbol.for('@firatkill/outbox/error');

/** Stable machine-readable error codes. */
export type OutboxErrorCode =
  | 'OUTBOX_CONFIG'
  | 'OUTBOX_INVALID_MESSAGE'
  | 'OUTBOX_PAYLOAD_TOO_LARGE'
  | 'OUTBOX_NOT_MIGRATED'
  | 'OUTBOX_MIGRATION_CHECKSUM'
  | 'OUTBOX_MIGRATION_FAILED'
  | 'OUTBOX_RELAY_STATE'
  | 'OUTBOX_HANDLER_TIMEOUT'
  | 'OUTBOX_SHUTDOWN'
  | 'OUTBOX_RETRYABLE'
  | 'OUTBOX_NON_RETRYABLE'
  | 'OUTBOX_NOT_FOUND'
  | 'OUTBOX_NOT_SKIPPABLE'
  | 'OUTBOX_LEASE_LOST'
  | 'OUTBOX_WEBHOOK_STATUS'
  | 'OUTBOX_WEBHOOK_TIMEOUT'
  | 'OUTBOX_WEBHOOK_NETWORK'
  | 'OUTBOX_LEASE_EXPIRED'
  | 'OUTBOX_DRIVER'
  | 'OUTBOX_INTERNAL';

/** Branded error recognized across independently loaded ESM and CJS copies.
 * @example
 * throw new OutboxError('OUTBOX_CONFIG', 'Invalid schema');
 */
export class OutboxError extends Error {
  /** Shared error identity, independent of constructor identity. */
  readonly [BRAND] = true;
  /** Stable classification. */
  readonly code: OutboxErrorCode;
  /** Structured error context. */
  readonly details: Readonly<Record<string, unknown>>;
  constructor(
    code: OutboxErrorCode,
    message: string,
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(message, options);
    this.name = 'OutboxError';
    this.code = code;
    this.details = options?.details ?? {};
  }
}

/** Request a retry, optionally overriding the backoff delay.
 * @example
 * throw new RetryableError('Service busy', { retryAfterMs: 1000 });
 */
export class RetryableError extends OutboxError {
  /** Requested delay; the relay clamps it to its configured range. @defaultValue undefined */
  readonly retryAfterMs: number | undefined;
  constructor(
    message: string,
    options?: { retryAfterMs?: number; cause?: unknown; details?: Record<string, unknown> },
  ) {
    super('OUTBOX_RETRYABLE', message, options);
    this.name = 'RetryableError';
    this.retryAfterMs = options?.retryAfterMs;
  }
}

/** Request an immediate dead-letter transition.
 * @example
 * throw new NonRetryableError('Recipient does not exist');
 */
export class NonRetryableError extends OutboxError {
  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super('OUTBOX_NON_RETRYABLE', message, options);
    this.name = 'NonRetryableError';
  }
}

/** Recognize a branded error, optionally checking its code.
 * @example
 * if (isOutboxError(error, 'OUTBOX_CONFIG')) return error.details;
 */
export function isOutboxError(err: unknown, code?: OutboxErrorCode): err is OutboxError {
  return (
    typeof err === 'object' &&
    err !== null &&
    BRAND in err &&
    err[BRAND] === true &&
    (code === undefined || ('code' in err && err.code === code))
  );
}

/** Recognize a retry request across module copies.
 * @example
 * if (isRetryableError(error)) return error.retryAfterMs;
 */
export function isRetryableError(err: unknown): err is RetryableError {
  return isOutboxError(err, 'OUTBOX_RETRYABLE');
}

/** Recognize a terminal error across module copies.
 * @example
 * if (isNonRetryableError(error)) return 'dead';
 */
export function isNonRetryableError(err: unknown): err is NonRetryableError {
  return isOutboxError(err, 'OUTBOX_NON_RETRYABLE');
}

/** Format stored error text, capped at 2000 UTF-16 code units.
 * @example
 * formatLastError(new Error('Unavailable')); // 'Error: Unavailable'
 */
export function formatLastError(error: unknown): string {
  const prefix = isOutboxError(error) ? error.code : error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  const text = `${prefix}: ${message}`;
  return text.length > 2000 ? text.slice(0, 1999) + '…' : text;
}
