import { describe, expect, it } from 'vitest';
import {
  OutboxError,
  RetryableError,
  NonRetryableError,
  isOutboxError,
  isRetryableError,
  isNonRetryableError,
  formatLastError,
} from '../../src/core/errors.js';

describe('error identity and storage', () => {
  it('UT-07 TC-029 recognizes a separate module copy by the shared brand', () => {
    const error = { [Symbol.for('@firatkill/outbox/error')]: true, code: 'OUTBOX_RETRYABLE' };
    expect(isOutboxError(error)).toBe(true);
    expect(isOutboxError(error, 'OUTBOX_RETRYABLE')).toBe(true);
    expect(isOutboxError(error, 'OUTBOX_CONFIG')).toBe(false);
    expect(isRetryableError(error)).toBe(true);
    expect(isNonRetryableError(error)).toBe(false);
    expect(isNonRetryableError({ ...error, code: 'OUTBOX_NON_RETRYABLE' })).toBe(true);
    for (const value of [
      null,
      undefined,
      'error',
      1,
      new Error(),
      { code: 'OUTBOX_CONFIG' },
      { [Symbol.for('@firatkill/outbox/error')]: false },
    ])
      expect(isOutboxError(value)).toBe(false);
  });
  it('UT-07 TC-029 preserves cause, details and optional retry delay', () => {
    const cause = new Error('driver');
    const details = { statement: 'claim' };
    const error = new OutboxError('OUTBOX_DRIVER', 'Failed', { cause, details });
    expect(error.cause).toBe(cause);
    expect(error.details).toEqual(details);
    expect(isOutboxError(error, 'OUTBOX_DRIVER')).toBe(true);
    expect(new OutboxError('OUTBOX_INTERNAL', 'Bug').details).toEqual({});
    expect(new RetryableError('Busy', { cause, details, retryAfterMs: 12 })).toMatchObject({
      cause,
      details,
      retryAfterMs: 12,
      code: 'OUTBOX_RETRYABLE',
    });
    expect(new RetryableError('Busy').retryAfterMs).toBeUndefined();
    expect(new NonRetryableError('Invalid', { cause, details })).toMatchObject({
      cause,
      details,
      code: 'OUTBOX_NON_RETRYABLE',
    });
  });
  it('UT-07 TC-029 classifies handler errors by brand and code', () => {
    for (const error of [new Error('network'), new OutboxError('OUTBOX_HANDLER_TIMEOUT', 'timeout'), 'failure']) {
      expect(isNonRetryableError(error)).toBe(false);
      expect(isRetryableError(error)).toBe(false);
    }
    expect(isRetryableError(new RetryableError('retry'))).toBe(true);
    expect(isNonRetryableError(new NonRetryableError('dead'))).toBe(true);
  });
  it('UT-07 TC-030 formats errors and primitive throws', () => {
    expect(formatLastError(new RetryableError('Busy'))).toBe('OUTBOX_RETRYABLE: Busy');
    expect(formatLastError(new TypeError('Bad'))).toBe('TypeError: Bad');
    expect(formatLastError('oops')).toBe('Error: oops');
    expect(formatLastError(null)).toBe('Error: null');
  });
  it('UT-07 TC-030 caps stored text including the ellipsis at 2000 UTF-16 units', () => {
    expect(formatLastError('a'.repeat(1993))).toHaveLength(2000);
    expect(formatLastError('a'.repeat(1993))).not.toMatch(/…$/);
    const result = formatLastError('😀'.repeat(2000));
    expect(result).toHaveLength(2000);
    expect(result).toBe(('Error: ' + '😀'.repeat(2000)).slice(0, 1999) + '…');
  });
});
