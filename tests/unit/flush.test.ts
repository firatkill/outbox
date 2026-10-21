import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFlusher } from '../../src/core/relay/flush.js';
import { createEmitter } from '../../src/core/emitter.js';
import { parseOutboxConfig } from '../../src/core/config.js';
import type { DeliveryOutcome } from '../../src/core/relay/deliver.js';
import type { SqlExecutor, SqlParam } from '../../src/core/types.js';
import { deferred } from '../helpers/wait.js';
import { message } from '../helpers/message.js';
const config = parseOutboxConfig({ db: {} });
const done = (i: number): Extract<DeliveryOutcome, { kind: 'done' }> => ({
  kind: 'done',
  message: message(i),
  durationMs: 1,
  claimedAtMonotonic: performance.now(),
});
const failed = (i: number, terminal = false): Extract<DeliveryOutcome, { kind: 'failed' }> => ({
  ...done(i),
  kind: 'failed',
  error: new Error('fixture'),
  delayMs: 1000,
  terminal,
});
function rows(params: readonly SqlParam[]) {
  const batch = JSON.parse(String(params[1])) as { id: string; terminal?: boolean }[];
  return batch.map((item) => ({
    id: item.id,
    status: item.terminal ? 'dead' : 'pending',
    attempts: 1,
    max_attempts: 10,
  }));
}
function setup(query: SqlExecutor['query'], leaseMs = 60000) {
  const emitter = createEmitter('relay');
  const events: { name: string; payload: unknown }[] = [];
  for (const name of ['delivered', 'failed', 'dead', 'leaseLost', 'error'] as const)
    emitter.on(name, (payload) => events.push({ name, payload }));
  return { flusher: createFlusher({ query }, config, { relayId: 'relay', leaseMs }, emitter), events };
}
afterEach(() => vi.useRealTimers());
describe('UT-09 TC-077/078 flusher; TRD 9.5.4', () => {
  it('UT-09 batches 50 completions during one slow flush in exactly one follow-up statement', async () => {
    const gate = deferred<Record<string, unknown>[]>();
    const query = vi
      .fn<SqlExecutor['query']>()
      .mockImplementationOnce(() => gate.promise)
      .mockImplementation((_text, params) => Promise.resolve(rows(params)));
    const { flusher, events } = setup(query);
    flusher.complete(done(1));
    for (let i = 2; i <= 51; i++) flusher.complete(done(i));
    let drained = false;
    const drain = flusher.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    gate.resolve([{ id: message(1).id }]);
    await drain;
    expect(query).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(query.mock.calls[1]?.[1][1])) as unknown[]).toHaveLength(50);
    expect(events.filter((event) => event.name === 'delivered')).toHaveLength(51);
  });
  it('UT-09 processes complete and fail buffers and emits only confirmed outcome events', async () => {
    const gate = deferred<Record<string, unknown>[]>();
    const query = vi
      .fn<SqlExecutor['query']>()
      .mockImplementationOnce(() => gate.promise)
      .mockImplementation((_text, params) => Promise.resolve(rows(params)));
    const { flusher, events } = setup(query);
    flusher.complete(done(1));
    flusher.complete(done(2));
    flusher.fail(failed(3));
    flusher.fail(failed(4, true));
    expect(events).toEqual([]);
    gate.resolve([{ id: message(1).id }]);
    await flusher.drain();
    expect(query).toHaveBeenCalledTimes(3);
    expect(events.map((event) => event.name)).toEqual(['delivered', 'delivered', 'failed', 'failed', 'dead']);
    expect(events[2]?.payload).toMatchObject({ willRetry: true, retryInMs: 1000 });
    expect(events[3]?.payload).toMatchObject({ willRetry: false, retryInMs: null });
  });
  it('UT-09 retries failed statements at the front with 1s then 2s backoff and does not replay confirmed completions', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const query = vi
      .fn<SqlExecutor['query']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation((_text, params) => Promise.resolve(rows(params)));
    const { flusher, events } = setup(query);
    flusher.complete(done(1));
    flusher.complete(done(2));
    flusher.fail(failed(3));
    await vi.advanceTimersByTimeAsync(999);
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(query).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(query).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await flusher.drain();
    expect(query).toHaveBeenCalledTimes(4);
    expect(events.filter((event) => event.name === 'error')).toHaveLength(2);
    expect(events.filter((event) => event.name === 'delivered')).toHaveLength(2);
    const gate = deferred<Record<string, unknown>[]>();
    const nextQuery = vi
      .fn<SqlExecutor['query']>()
      .mockImplementationOnce(() => gate.promise)
      .mockRejectedValueOnce(new Error('fail statement offline'))
      .mockImplementation((_text, params) => Promise.resolve(rows(params)));
    const next = setup(nextQuery);
    next.flusher.complete(done(4));
    next.flusher.fail(failed(5));
    gate.resolve([{ id: message(4).id }]);
    await vi.advanceTimersByTimeAsync(1000);
    await next.flusher.drain();
    expect(nextQuery).toHaveBeenCalledTimes(3);
    expect(next.events.filter((event) => event.name === 'delivered')).toHaveLength(1);
  });
  it('UT-09 drops expired local lease estimates with one error listing the affected ids', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const query = vi.fn<SqlExecutor['query']>().mockRejectedValue(new Error('offline'));
    const { flusher, events } = setup(query, 500);
    flusher.complete(done(1));
    flusher.fail(failed(2));
    await vi.advanceTimersByTimeAsync(1000);
    await flusher.drain();
    expect(query).toHaveBeenCalledTimes(1);
    const listed = events.filter(
      (event) =>
        event.name === 'error' &&
        typeof event.payload === 'object' &&
        event.payload !== null &&
        'error' in event.payload &&
        typeof event.payload.error === 'object' &&
        event.payload.error !== null &&
        'details' in event.payload.error &&
        (event.payload.error.details as Record<string, unknown>)['ids'] !== undefined,
    );
    expect(listed).toHaveLength(1);
    expect(events.filter((event) => event.name === 'delivered' || event.name === 'failed')).toEqual([]);
  });
  it('UT-09 emits leaseLost for ids absent from complete or fail results', async () => {
    const { flusher, events } = setup(() => Promise.resolve([]));
    flusher.complete(done(1));
    flusher.fail(failed(2));
    await flusher.drain();
    expect(events).toEqual([
      { name: 'leaseLost', payload: { relayId: 'relay', id: message(1).id, attempt: 1, outcome: 'done' } },
      { name: 'leaseLost', payload: { relayId: 'relay', id: message(2).id, attempt: 1, outcome: 'failed' } },
    ]);
  });
});

it('UT-19 TC-102 bounds final flush retries to three one-second retries', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const query = vi.fn<SqlExecutor['query']>().mockRejectedValue(new Error('offline'));
  const { flusher, events } = setup(query);
  flusher.complete(done(1));
  await vi.advanceTimersByTimeAsync(0);
  expect(query).toHaveBeenCalledTimes(1);
  const finish = flusher.finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(query).toHaveBeenCalledTimes(2);
  for (let attempt = 3; attempt <= 5; attempt++) {
    await vi.advanceTimersByTimeAsync(999);
    expect(query).toHaveBeenCalledTimes(attempt - 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(query).toHaveBeenCalledTimes(attempt);
  }
  await finish;
  expect(vi.getTimerCount()).toBe(0);
  expect(events.filter((event) => event.name === 'delivered')).toEqual([]);
});
