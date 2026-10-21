import { afterEach, expect, it, vi } from 'vitest';
import { deferred, waitFor, waitForEvent } from '../helpers/wait.js';

afterEach(() => vi.useRealTimers());

it('UT-17 TC-024 waits for a condition without exceeding the default three-second bound', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  let ready = false;
  const done = waitFor(() => ready);
  ready = true;
  await vi.advanceTimersByTimeAsync(20);
  await done;
  const timeout = expect(waitFor(() => false)).rejects.toThrow('3000 ms');
  await vi.advanceTimersByTimeAsync(3000);
  await timeout;
});

it('UT-17 TC-024 waits for a matching event and unsubscribes on resolution or timeout', async () => {
  vi.useFakeTimers();
  const listeners = new Set<(payload: number) => void>();
  const relay = {
    on(_event: string, listener: (payload: number) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const done = waitForEvent(relay, 'ready', (n) => n === 2);
  for (const listener of listeners) listener(1);
  expect(listeners.size).toBe(1);
  for (const listener of listeners) listener(2);
  await expect(done).resolves.toBe(2);
  expect(listeners.size).toBe(0);
  const timeout = expect(waitForEvent(relay, 'ready')).rejects.toThrow('3000 ms');
  await vi.advanceTimersByTimeAsync(3000);
  await timeout;
  expect(listeners.size).toBe(0);
});

it('UT-17 TC-024 exposes a deferred promise that can resolve or reject', async () => {
  const value = deferred<number>();
  value.resolve(42);
  await expect(value.promise).resolves.toBe(42);
  const error = deferred<undefined>();
  error.reject(new Error('expected'));
  await expect(error.promise).rejects.toThrow('expected');
});
