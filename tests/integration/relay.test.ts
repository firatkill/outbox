import { afterAll, describe, expect, it, vi } from 'vitest';
import { createOutboxCore } from '../../src/core/outbox.js';
import { render } from '../../src/core/sql/render.js';
import type { MessageInput, Relay, RelayOptions } from '../../src/core/types.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema } from '../helpers/db.js';
import { NonRetryableError } from '../../src/core/errors.js';
import { deferred, waitFor, waitForEvent } from '../helpers/wait.js';

describe.each(ADAPTERS)('%s relay', (name) => {
  const driver = createAdapter(name);
  const schemas: Awaited<ReturnType<typeof createTestSchema>>[] = [];
  const relays: Relay[] = [];
  afterAll(async () => {
    for (const relay of relays) await relay.stop();
    await driver.close();
    for (const owned of schemas) await owned.drop();
  });
  async function setup(messages: MessageInput[]) {
    const owned = await createTestSchema();
    schemas.push(owned);
    const outbox = createOutboxCore(driver.adapter, { schema: owned.schema });
    await outbox.migrate();
    const inserted = await driver.adapter.transaction((tx) => outbox.enqueue(tx, messages));
    const relay = (options: RelayOptions) => {
      const result = outbox.createRelay({
        listen: false,
        poll: { minIntervalMs: 10, maxIntervalMs: 50 },
        reclaimIntervalMs: 500,
        retry: { jitter: 'none' },
        ...options,
      });
      relays.push(result);
      return result;
    };
    return { outbox, inserted, relay };
  }
  it('INT-20 TC-080 delivers matching fields and context outside a transaction', async () => {
    const {
      outbox,
      inserted,
      relay: make,
    } = await setup([
      { topic: 't', payload: { order: 1 }, key: 'key', headers: { trace: 'fixture' }, dedupeKey: 'd', maxAttempts: 5 },
    ]);
    const target = vi.fn(() => Promise.resolve());
    const relay = make({ handlers: { t: target } });
    const delivered = waitForEvent(relay, 'delivered');
    await relay.start();
    const event = await delivered;
    await relay.stop();
    expect(target).toHaveBeenCalledTimes(1);
    expect(event.message).toMatchObject({
      id: inserted[0]?.id,
      topic: 't',
      payload: { order: 1 },
      key: 'key',
      headers: { trace: 'fixture' },
      dedupeKey: 'd',
      maxAttempts: 5,
      attempts: 1,
    });
    expect(target).toHaveBeenCalledWith(
      event.message,
      expect.objectContaining({
        attempt: 1,
        relayId: relay.id,
        signal: expect.objectContaining({ aborted: false }) as unknown,
      }),
    );
    expect(
      await driver.adapter.query(
        render(
          `select status, attempts, completed_at is not null as completed,
      locked_by, locked_until from {{messages}}`,
          outbox.config,
        ),
        [],
      ),
    ).toEqual([{ status: 'done', attempts: 1, completed: true, locked_by: null, locked_until: null }]);
  });
  it('INT-26 TC-084 aborts timed-out handlers, persists retry errors, and frees the slot', async () => {
    const { outbox, relay: make } = await setup([{ topic: 't', payload: null }]);
    const reasons: unknown[] = [];
    let calls = 0;
    const relay = make({
      concurrency: 1,
      batchSize: 1,
      handlerTimeoutMs: 200,
      leaseMs: 1200,
      retry: { baseDelayMs: 1000, jitter: 'none' },
      handlers: {
        t: async (_message, ctx) => {
          calls++;
          if (calls > 1) return;
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
        },
      },
    });
    const failed = waitForEvent(relay, 'failed');
    expect(await relay.runOnce()).toMatchObject({ claimed: 1, failed: 1, delivered: 0, dead: 0 });
    expect(reasons).toEqual([expect.objectContaining({ code: 'OUTBOX_HANDLER_TIMEOUT' })]);
    expect(await failed).toMatchObject({ willRetry: true, retryInMs: 1000 });
    const [row] = await driver.adapter.query(
      render(
        `select status, (extract(epoch from (available_at - {{now}})) * 1000)::float8 as delay,
        last_error from {{messages}}`,
        outbox.config,
      ),
      [],
    );
    expect(row?.['status']).toBe('pending');
    expect(row?.['last_error']).toMatch(/^OUTBOX_HANDLER_TIMEOUT:/);
    expect(row?.['delay']).toBeGreaterThanOrEqual(850);
    expect(row?.['delay']).toBeLessThanOrEqual(1150);
    // A separate ready message must use the sole slot released by the timeout.
    await driver.adapter.transaction((tx) => outbox.enqueue(tx, { topic: 't', payload: null }));
    expect(await relay.runOnce()).toMatchObject({ claimed: 1, delivered: 1, failed: 0 });
    expect(calls).toBe(2);
  });
  it('INT-27 TC-081 filters handler and publisher topics without touching other outboxes', async () => {
    const one = await setup(['a', 'b', 'c'].map((topic) => ({ topic, payload: null })));
    const other = await setup([{ topic: 'a', payload: null }]);
    const handler = one.relay({ handlers: { a: () => Promise.resolve() } });
    expect((await handler.runOnce()).claimed).toBe(1);
    expect((await handler.runOnce()).claimed).toBe(0);
    const publisher = one.relay({ publisher: () => Promise.resolve(), topics: ['b'] });
    expect((await publisher.runOnce()).claimed).toBe(1);
    expect(
      await driver.adapter.query(
        render('select topic, status from {{messages}} order by topic', one.outbox.config),
        [],
      ),
    ).toEqual([
      { topic: 'a', status: 'done' },
      { topic: 'b', status: 'done' },
      { topic: 'c', status: 'pending' },
    ]);
    expect(await driver.adapter.query(render('select status from {{messages}}', other.outbox.config), [])).toEqual([
      { status: 'pending' },
    ]);
  });
  it('INT-28 TC-082 runs exactly one batch, flushes it, and rejects runOnce after start', async () => {
    const { relay: make } = await setup(Array.from({ length: 25 }, () => ({ topic: 't', payload: null })));
    const relay = make({ publisher: () => Promise.resolve(), batchSize: 10, concurrency: 10 });
    for (const count of [10, 10, 5]) {
      expect(await relay.runOnce()).toEqual({
        claimed: count,
        delivered: count,
        failed: 0,
        dead: 0,
        leaseLost: 0,
        reclaimed: 0,
      });
      expect(relay.state).toBe('idle');
    }
    await relay.start();
    await expect(relay.runOnce()).rejects.toMatchObject({ code: 'OUTBOX_RELAY_STATE' });
    await relay.stop();
  });
  it('INT-98 TC-099 limits active handlers and holds no claim lock during delivery', async () => {
    const { outbox, relay: make } = await setup(Array.from({ length: 5 }, () => ({ topic: 't', payload: null })));
    const gate = deferred<undefined>();
    let active = 0,
      maximum = 0,
      delivered = 0;
    const starts: string[] = [];
    const relay = make({
      concurrency: 2,
      batchSize: 2,
      publisher: async (message) => {
        active++;
        maximum = Math.max(maximum, active);
        starts.push(message.seq);
        try {
          await driver.adapter.query(
            render('select id from {{messages}} where id = $1::uuid for update nowait', outbox.config),
            [message.id],
          );
          await gate.promise;
        } finally {
          active--;
        }
      },
    });
    relay.on('delivered', () => {
      delivered++;
    });
    try {
      await relay.start();
      await waitFor(() => active === 2);
      expect(
        await driver.adapter.query(
          render(
            'select status, count(*)::int4 as count from {{messages}} group by status order by status',
            outbox.config,
          ),
          [],
        ),
      ).toEqual([
        { status: 'in_flight', count: 2 },
        { status: 'pending', count: 3 },
      ]);
      gate.resolve(undefined);
      await waitFor(() => delivered === 5);
      expect(maximum).toBe(2);
      expect(starts).toEqual([...starts].sort((a, b) => Number(BigInt(a) - BigInt(b))));
    } finally {
      gate.resolve(undefined);
      await relay.stop();
    }
  });
  it('INT-99 TC-100 reports only confirmed retry and dead transitions', async () => {
    const { outbox, relay: make } = await setup([
      { topic: 'retry', payload: null },
      { topic: 'terminal', payload: null },
      { topic: 'exhausted', payload: null, maxAttempts: 1 },
    ]);
    const relay = make({
      publisher: (message) =>
        Promise.reject(message.topic === 'terminal' ? new NonRetryableError('bad') : new Error('retry')),
    });
    expect(await relay.runOnce()).toEqual({ claimed: 3, delivered: 0, failed: 3, dead: 2, leaseLost: 0, reclaimed: 0 });
    expect(
      await driver.adapter.query(render('select topic, status from {{messages}} order by topic', outbox.config), []),
    ).toEqual([
      { topic: 'exhausted', status: 'dead' },
      { topic: 'retry', status: 'pending' },
      { topic: 'terminal', status: 'dead' },
    ]);
  });
});
