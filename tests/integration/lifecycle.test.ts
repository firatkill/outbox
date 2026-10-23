import { recordingTracer } from '../helpers/tracing.js';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createOutboxCore } from '../../src/core/outbox.js';
import { render } from '../../src/core/sql/render.js';
import { testClock } from '../../src/testing.js';
import type { Relay, RelayOptions } from '../../src/core/types.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema } from '../helpers/db.js';
import { deferred, waitFor, waitForEvent } from '../helpers/wait.js';

describe.each(ADAPTERS)('%s relay lifecycle', (name) => {
  const driver = createAdapter(name);
  const schemas: Awaited<ReturnType<typeof createTestSchema>>[] = [];
  const relays: Relay[] = [];
  afterAll(async () => {
    for (const relay of relays) await relay.stop();
    await driver.close();
    for (const owned of schemas) await owned.drop();
  });
  async function setup(count = 0, failComplete = false) {
    const owned = await createTestSchema();
    schemas.push(owned);
    let completeCalls = 0;
    const adapter = {
      ...driver.adapter,
      query: (text: string, params: Parameters<typeof driver.adapter.query>[1]) => {
        if (failComplete && /set status\s*=\s*'done'/.test(text)) {
          completeCalls++;
          return Promise.reject(new Error('fixture complete unavailable'));
        }
        return driver.adapter.query(text, params);
      },
    };
    const outbox = createOutboxCore(adapter, { schema: owned.schema });
    await outbox.migrate();
    if (count)
      await adapter.transaction((tx) =>
        outbox.enqueue(
          tx,
          Array.from({ length: count }, () => ({ topic: 't', payload: null })),
        ),
      );
    function relay(options: RelayOptions) {
      const result = outbox.createRelay({ listen: false, poll: { minIntervalMs: 10, maxIntervalMs: 50 }, ...options });
      relays.push(result);
      return result;
    }
    const inspect = () =>
      driver.adapter.query(
        render('select status, attempts, locked_by, locked_until from {{messages}} order by seq', outbox.config),
        [],
      );
    return { outbox, relay, inspect, completeCalls: () => completeCalls };
  }
  it('INT-70 TC-089 drains claimed work without claiming newly enqueued messages', async () => {
    const { outbox, relay: make, inspect } = await setup(20);
    const durations: number[] = [];
    const stopRequested = deferred<undefined>();
    const relay = make({
      concurrency: 20,
      batchSize: 20,
      publisher: async () => {
        const start = performance.now();
        // The specified 300ms handler workload is real work duration, not a relay/clock wait.
        await new Promise((resolve) => setTimeout(resolve, 300));
        durations.push(performance.now() - start);
        // Keep the first batch in flight until stop: enqueue latency must not race the 300 ms workload.
        await stopRequested.promise;
      },
    });
    const claimed = waitForEvent(relay, 'claimed');
    await relay.start();
    await claimed;
    await driver.adapter.transaction((tx) =>
      outbox.enqueue(
        tx,
        Array.from({ length: 10 }, () => ({ topic: 't', payload: null })),
      ),
    );
    const stopping = relay.stop({ drainTimeoutMs: 5000 });
    stopRequested.resolve(undefined);
    expect(await stopping).toMatchObject({ drained: true, released: 0 });
    const rows = await inspect();
    expect(rows.filter((row) => row['status'] === 'done')).toHaveLength(20);
    expect(rows.filter((row) => row['status'] === 'pending')).toHaveLength(10);
    expect(rows.every((row) => row['locked_by'] === null && row['locked_until'] === null)).toBe(true);
    expect(durations).toHaveLength(20);
    expect(Math.min(...durations)).toBeGreaterThanOrEqual(290);
  });
  it('INT-71 TC-090 aborts and releases five unfinished attempts without writing late outcomes', async () => {
    const { relay: make, inspect } = await setup(5);
    const reasons: unknown[] = [];
    const late = deferred<undefined>();
    let started = 0,
      finished = 0,
      outcomes = 0;
    const relay = make({
      publisher: async (_message, ctx) => {
        started++;
        await new Promise<void>((resolve) => {
          ctx.signal.addEventListener(
            'abort',
            () => {
              reasons.push(ctx.signal.reason as unknown);
              resolve();
            },
            { once: true },
          );
        });
        await late.promise;
        finished++;
      },
    });
    relay.on('delivered', () => {
      outcomes++;
    });
    relay.on('failed', () => {
      outcomes++;
    });
    try {
      await relay.start();
      await waitFor(() => started === 5);
      const stopped = await relay.stop({ drainTimeoutMs: 200 });
      expect(stopped).toMatchObject({ drained: false, released: 5 });
      expect(stopped.durationMs).toBeLessThan(1000);
      expect(reasons).toHaveLength(5);
      for (const reason of reasons) expect(reason).toMatchObject({ code: 'OUTBOX_SHUTDOWN' });
      const expected = Array.from({ length: 5 }, () => ({
        status: 'pending',
        attempts: 0,
        locked_by: null,
        locked_until: null,
      }));
      expect(await inspect()).toEqual(expected);
      late.resolve(undefined);
      await waitFor(() => finished === 5);
      expect(outcomes).toBe(0);
      expect(await inspect()).toEqual(expected);
    } finally {
      late.resolve(undefined);
    }
  });
  it('INT-72 TC-091 is single-use and returns the first stop promise and result', async () => {
    const { relay: make } = await setup();
    const relay = make({ publisher: () => Promise.resolve() });
    const starting = relay.start();
    expect(relay.state).toBe('starting');
    await expect(relay.start()).rejects.toMatchObject({ code: 'OUTBOX_RELAY_STATE' });
    await starting;
    expect(relay.state).toBe('running');
    const first = relay.stop();
    expect(relay.stop()).toBe(first);
    const result = await first;
    expect(await relay.stop()).toBe(result);
    expect(relay.state).toBe('stopped');
    await expect(relay.start()).rejects.toMatchObject({ code: 'OUTBOX_RELAY_STATE' });
    const idle = make({ publisher: () => Promise.resolve() });
    expect(await idle.stop()).toEqual({ drained: true, released: 0, durationMs: 0 });
    await expect(idle.start()).rejects.toMatchObject({ code: 'OUTBOX_RELAY_STATE' });
  });
  it('INT-73 TC-092 drains in-flight work when an external signal aborts', async () => {
    const { relay: make, inspect } = await setup(1);
    const gate = deferred<undefined>();
    const controller = new AbortController();
    const relay = make({ signal: controller.signal, publisher: () => gate.promise });
    const claimed = waitForEvent(relay, 'claimed');
    try {
      await relay.start();
      await claimed;
      controller.abort();
      expect(relay.state).toBe('stopping');
      gate.resolve(undefined);
      await waitFor(() => relay.state === 'stopped');
      expect((await inspect())[0]).toMatchObject({ status: 'done', attempts: 1 });
      expect(await relay.stop()).toMatchObject({ drained: true, released: 0 });
    } finally {
      gate.resolve(undefined);
    }
    const already = make({ signal: controller.signal, publisher: () => Promise.resolve() });
    await already.start();
    await waitFor(() => already.state === 'stopped');
  });
  it('INT-101 TC-102 bounds shutdown flush retries and leaves unconfirmed leases recoverable', async () => {
    const { outbox, relay: make, inspect, completeCalls } = await setup(1, true);
    const clock = testClock(outbox);
    await clock.install();
    const relay = make({ publisher: () => Promise.resolve() });
    const failure = waitForEvent(relay, 'error', (event) => event.phase === 'flush');
    await relay.start();
    await failure;
    // Shutdown's specified three one-second database retries are genuine reconnect backoff.
    expect(await relay.stop({ drainTimeoutMs: 0 })).toMatchObject({ drained: false, released: 0 });
    expect(completeCalls()).toBeLessThanOrEqual(5);
    expect(completeCalls()).toBeGreaterThanOrEqual(4);
    expect((await inspect())[0]).toMatchObject({ status: 'in_flight', attempts: 1 });
    await clock.advance(60001);
    const recovery = createOutboxCore(driver.adapter, {
      schema: outbox.config.schema,
      tablePrefix: outbox.config.tablePrefix,
    }).createRelay({
      listen: false,
      publisher: () => Promise.resolve(),
    });
    relays.push(recovery);
    expect(await recovery.runOnce()).toMatchObject({ reclaimed: 1, delivered: 1 });
    expect((await inspect())[0]).toMatchObject({ status: 'done', attempts: 2 });
  });
  it('INT-74 TC-135 records spans and isolates delivered listeners across retries', async () => {
    const { outbox, relay: make, inspect } = await setup();
    const clock = testClock(outbox);
    await clock.install();
    const messages = await driver.adapter.transaction((tx) =>
      outbox.enqueue(tx, [
        { topic: 't', key: 'key', payload: 1, headers: { traceparent: 'trace-fixture' } },
        { topic: 't', payload: 2 },
        { topic: 't', payload: 3 },
      ]),
    );
    const { tracer, spans } = recordingTracer();
    const failure = new Error('retry once');
    const headers: unknown[] = [];
    const relay = make({
      tracer,
      retry: { baseDelayMs: 100, jitter: 'none' },
      publisher: (message) => {
        headers.push(message.headers);
        return message.id === messages[0]?.id && message.attempts === 1 ? Promise.reject(failure) : Promise.resolve();
      },
    });
    const events: Record<string, unknown[]> = {};
    for (const event of ['claimed', 'delivered', 'failed', 'dead', 'reclaimed', 'leaseLost', 'error'] as const)
      relay.on(event, (payload) => {
        (events[event] ??= []).push(payload);
      });
    relay.on('delivered', () => {
      throw new Error('delivered listener');
    });
    expect(await relay.runOnce()).toMatchObject({ claimed: 3, delivered: 2, failed: 1 });
    await clock.advance(101);
    expect(await relay.runOnce()).toMatchObject({ claimed: 1, delivered: 1 });
    expect((await inspect()).every((row) => row['status'] === 'done')).toBe(true);
    expect(events['delivered']).toHaveLength(3);
    expect(events['failed']).toHaveLength(1);
    expect(events['error']).toHaveLength(3);
    expect(events['error']?.every((event) => (event as { phase: string }).phase === 'listener')).toBe(true);
    expect(
      headers.filter((value) => (value as Record<string, string>)['traceparent'] === 'trace-fixture'),
    ).toHaveLength(2);
    const claims = spans.filter((span) => span.name === 'outbox claim');
    expect(claims).toHaveLength(2);
    expect(claims.map((span) => span.attributes)).toEqual([
      { 'outbox.relay_id': relay.id, 'outbox.requested': 10, 'outbox.claimed': 3 },
      { 'outbox.relay_id': relay.id, 'outbox.requested': 10, 'outbox.claimed': 1 },
    ]);
    const deliveries = spans.filter((span) => span.name === 'outbox deliver');
    expect(deliveries).toHaveLength(4);
    for (const span of deliveries) {
      expect(span.attributes).toMatchObject({
        'messaging.system': 'outbox',
        'messaging.operation.type': 'process',
        'messaging.destination.name': 't',
        'messaging.message.id': expect.any(String) as unknown,
        'outbox.attempt': expect.any(Number) as unknown,
      });
      if (span.attributes['messaging.message.id'] === messages[0]?.id)
        expect(span.attributes['outbox.key']).toBe('key');
      else expect(span.attributes).not.toHaveProperty('outbox.key');
    }
    expect(deliveries.filter((span) => span.status === 'error')).toEqual([
      expect.objectContaining({
        exceptions: [failure],
        attributes: expect.objectContaining({ 'outbox.attempt': 1 }) as unknown,
      }),
    ]);
    const flushes = spans.filter((span) => span.name === 'outbox flush');
    expect(flushes.length).toBeGreaterThan(0);
    for (const [key, expected] of [
      ['outbox.completed', 3],
      ['outbox.failed', 1],
      ['outbox.lease_lost', 0],
    ] as const)
      expect(flushes.reduce((sum, span) => sum + Number(span.attributes[key]), 0)).toBe(expected);
    expect(spans.every((span) => span.status !== undefined)).toBe(true);
    expect([...claims, ...flushes].every((span) => span.status === 'ok' && span.exceptions.length === 0)).toBe(true);
  });
  it('INT-106 TC-144 delivers and retries while tracer callbacks throw', async () => {
    const { outbox, relay: make, inspect } = await setup(1);
    const clock = testClock(outbox);
    await clock.install();
    const tracerError = new Error('tracer unavailable');
    const fail = () => {
      throw tracerError;
    };
    const relay = make({
      tracer: {
        startSpan(name) {
          if (name === 'outbox claim') throw tracerError;
          return { setAttribute: fail, recordException: fail, end: fail };
        },
      },
      retry: { baseDelayMs: 100, jitter: 'none' },
      publisher: (message) => (message.attempts === 1 ? Promise.reject(new Error('retry')) : Promise.resolve()),
    });
    const errors = vi.fn();
    relay.on('error', errors);
    expect(await relay.runOnce()).toMatchObject({ failed: 1 });
    await clock.advance(101);
    expect(await relay.runOnce()).toMatchObject({ delivered: 1 });
    expect((await inspect())[0]).toMatchObject({ status: 'done' });
    expect(errors.mock.calls.length).toBeGreaterThan(0);
    for (const [event] of errors.mock.calls) expect(event).toMatchObject({ phase: 'listener', error: tracerError });
  });
  if (name === 'pg')
    it('INT-75 TC-136 rate limits console errors during three seconds of connection loss', async () => {
      const owned = await createTestSchema();
      const app = owned.schema + '_fallback';
      const worker = createAdapter(name, { applicationName: app });
      let claimFailures = 0;
      const outbox = createOutboxCore(
        {
          ...worker.adapter,
          async query(text, params) {
            try {
              return await worker.adapter.query(text, params);
            } catch (error) {
              if (/set status\s*=\s*'in_flight'/.test(text)) claimFailures++;
              throw error;
            }
          },
        },
        { schema: owned.schema },
      );
      const relay = outbox.createRelay({ listen: false, publisher: () => Promise.resolve() });
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      let timer: ReturnType<typeof setInterval> | undefined;
      let ending: ReturnType<typeof setTimeout> | undefined;
      const kills: Promise<unknown>[] = [];
      try {
        await outbox.migrate();
        // Hold a test-owned UPDATE across each termination tick so the fault reaches active SQL.
        await owned.admin`create function ${owned.admin(owned.schema)}.fault_window() returns trigger language plpgsql as
        'begin perform pg_sleep(0.3); return null; end'`;
        await owned.admin`create trigger fault_window before update on ${owned.admin(owned.schema)}.outbox_messages
        for each statement execute function ${owned.admin(owned.schema)}.fault_window()`;
        await relay.start();
        // INT-75 requires a real three-second connection-loss window, not a delivery/time wait.
        await new Promise<void>((resolve) => {
          timer = setInterval(() => {
            kills.push(
              Promise.resolve(owned.admin`select pg_terminate_backend(pid) from pg_stat_activity
            where datname = current_database() and application_name = ${app}`),
            );
          }, 100);
          ending = setTimeout(resolve, 3000);
        });
        clearInterval(timer);
        await Promise.all(kills);
        await owned.admin`drop trigger fault_window on ${owned.admin(owned.schema)}.outbox_messages`;
        await relay.stop();
        expect(claimFailures).toBeGreaterThanOrEqual(2);
        const lines = logged.mock.calls
          .map(([line]) => String(line))
          .filter((line) => line.startsWith('[outbox] ' + relay.id));
        expect(lines.filter((line) => line.includes(' claim: '))).toEqual([
          '[outbox] ' + relay.id + ' claim: OUTBOX_DRIVER: Failed claim statement',
        ]);
        const phases = lines.map((line) => line.split(' ')[2]);
        expect(new Set(phases).size).toBe(phases.length);
      } finally {
        clearInterval(timer);
        clearTimeout(ending);
        await Promise.allSettled(kills);
        await relay.stop();
        await worker.close();
        await owned.drop();
        logged.mockRestore();
      }
    });
});
