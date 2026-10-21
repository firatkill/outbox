import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliver } from '../../src/core/relay/deliver.js';
import { NonRetryableError, RetryableError } from '../../src/core/errors.js';
import { deferred } from '../helpers/wait.js';
import { message } from '../helpers/message.js';
const options = {
  relayId: 'relay',
  handlerTimeoutMs: 200,
  retry: { baseDelayMs: 1000, factor: 2, maxDelayMs: 300000, jitter: 'none' as const },
};
afterEach(() => vi.useRealTimers());
describe('UT-10 TC-079 delivery; TRD 9.5.3', () => {
  it('UT-10 times out, aborts with the specified reason, and settles without the orphan', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const orphan = deferred<undefined>();
    const controller = new AbortController();
    const result = deliver(message(), () => orphan.promise, controller, options, performance.now());
    await vi.advanceTimersByTimeAsync(200);
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toMatchObject({ code: 'OUTBOX_HANDLER_TIMEOUT' });
    expect(await result).toMatchObject({
      kind: 'failed',
      terminal: false,
      delayMs: 1000,
      error: { code: 'OUTBOX_HANDLER_TIMEOUT' },
    });
    // A rejection after the slot can be freed must be observed, not become unhandled.
    orphan.reject(new Error('late rejection'));
    await vi.runAllTimersAsync();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('UT-10 ignores late resolution and captures synchronous throws', async () => {
    vi.useFakeTimers();
    const orphan = deferred<undefined>();
    const result = deliver(message(), () => orphan.promise, new AbortController(), options, performance.now());
    await vi.advanceTimersByTimeAsync(200);
    const failure = await result;
    orphan.resolve(undefined);
    expect(await result).toBe(failure);
    expect(
      await deliver(
        message(),
        () => {
          throw new Error('sync');
        },
        new AbortController(),
        options,
        performance.now(),
      ),
    ).toMatchObject({ kind: 'failed', error: { message: 'sync' } });
  });
  it('UT-10 passes delivery context and clears the timeout on success', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const target = vi.fn(() => Promise.resolve());
    const item = message();
    expect(await deliver(item, target, controller, options, performance.now())).toMatchObject({
      kind: 'done',
      message: item,
    });
    expect(target).toHaveBeenCalledWith(item, { signal: controller.signal, attempt: 1, relayId: 'relay' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('UT-10 classifies terminal errors and clamps explicit retry delays', async () => {
    for (const [error, terminal, delayMs] of [
      [new NonRetryableError('bad'), true, 1000],
      [new RetryableError('later', { retryAfterMs: -1 }), false, 0],
      [new RetryableError('later', { retryAfterMs: 5000 }), false, 5000],
      [new RetryableError('later', { retryAfterMs: 10000000 }), false, 300000],
      [new RetryableError('default'), false, 1000],
    ] as const) {
      expect(
        await deliver(message(), () => Promise.reject(error), new AbortController(), options, performance.now()),
      ).toMatchObject({ kind: 'failed', error, terminal, delayMs });
    }
  });
});
