import { afterAll, describe, expect, it } from 'vitest';
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
    const relay = make({
      concurrency: 20,
      batchSize: 20,
      publisher: async () => {
        const start = performance.now();
        // The specified 300ms handler workload is real work duration, not a relay/clock wait.
        await new Promise((resolve) => setTimeout(resolve, 300));
        durations.push(performance.now() - start);
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
    expect(await relay.stop({ drainTimeoutMs: 5000 })).toMatchObject({ drained: true, released: 0 });
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
});
