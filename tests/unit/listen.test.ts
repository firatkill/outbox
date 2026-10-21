import { afterEach, describe, expect, it, vi } from 'vitest';
import { createListener } from '../../src/core/relay/listen.js';
import type { DriverAdapter, SqlExecutor } from '../../src/core/types.js';

describe('listener opening retry', () => {
  afterEach(() => vi.useRealTimers());
  it('UT-21 TC-128 backs off failed openings from one to thirty seconds and cancels on close', async () => {
    vi.useFakeTimers();
    const executor: SqlExecutor = { query: () => Promise.resolve([]) };
    const listen = vi.fn<NonNullable<DriverAdapter<undefined, SqlExecutor>['listen']>>();
    listen.mockRejectedValue(new Error('opening fixture'));
    const adapter: DriverAdapter<undefined, SqlExecutor> = {
      name: 'fixture',
      db: undefined,
      query: (text, params) => executor.query(text, params),
      forTransaction: (tx) => tx,
      transaction: (fn) => fn(executor),
      withDb: () => adapter,
      listen,
    };
    const errors = vi.fn(),
      wake = vi.fn();
    const listener = createListener(adapter, 'test.outbox_messages', wake, errors);
    await listener.start();
    expect(listen).toHaveBeenCalledTimes(1);
    let calls = 1;
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(listen).toHaveBeenCalledTimes(calls);
      await vi.advanceTimersByTimeAsync(1);
      expect(listen).toHaveBeenCalledTimes(++calls);
    }
    expect(errors).toHaveBeenCalledTimes(calls);
    expect(wake).not.toHaveBeenCalled();
    await listener.close();
    await vi.advanceTimersByTimeAsync(30000);
    expect(listen).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
  });
});
