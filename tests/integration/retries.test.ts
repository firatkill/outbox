import { afterAll, describe, expect, it, vi } from 'vitest';
import { NonRetryableError, RetryableError } from '../../src/core/errors.js';
import { createOutboxCore } from '../../src/core/outbox.js';
import { claim } from '../../src/core/sql/claim.js';
import { render } from '../../src/core/sql/render.js';
import type { Relay, RelayOptions } from '../../src/core/types.js';
import { testClock } from '../../src/testing.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema } from '../helpers/db.js';

describe.each(ADAPTERS)('%s retry transitions', (name) => {
  const driver = createAdapter(name);
  const schemas: Awaited<ReturnType<typeof createTestSchema>>[] = [];
  const relays: Relay[] = [];
  afterAll(async () => {
    for (const relay of relays) await relay.stop();
    await driver.close();
    for (const schema of schemas) await schema.drop();
  });
  async function setup(maxAttempts = 10) {
    const owned = await createTestSchema();
    schemas.push(owned);
    const outbox = createOutboxCore(driver.adapter, { schema: owned.schema });
    await outbox.migrate();
    const clock = testClock(outbox);
    await clock.install();
    const inserted = await driver.adapter.transaction((tx) =>
      outbox.enqueue(tx, { topic: 't', payload: null, maxAttempts }),
    );
    // Capture database-time delay at UPDATE, independent of test-runner scheduling.
    const audit = `"${owned.schema}".retry_audit`;
    const capture = `"${owned.schema}".capture_retry`;
    await driver.adapter.query(`create table ${audit} (attempt int, delay float8)`, []);
    await driver.adapter.query(
      render(
        `create function ${capture}() returns trigger language plpgsql as $$
      begin
        if old.status = 'in_flight' and new.status = 'pending' then
          insert into ${audit} values (new.attempts, extract(epoch from (new.available_at - {{now}})) * 1000);
        end if;
        return new;
      end $$`,
        outbox.config,
      ),
      [],
    );
    await driver.adapter.query(
      render(
        `create trigger capture_retry after update on {{messages}}
      for each row execute function ${capture}()`,
        outbox.config,
      ),
      [],
    );
    const inspect = async () =>
      (
        await driver.adapter.query(
          render('select status, attempts, last_error, dead_at is not null as dead from {{messages}}', outbox.config),
          [],
        )
      )[0];
    const delays = async () =>
      (await driver.adapter.query(`select delay from ${audit} order by attempt`, [])).map((r) => r['delay']);
    function relay(options: RelayOptions) {
      const result = outbox.createRelay({
        listen: false,
        retry: { baseDelayMs: 1000, factor: 2, jitter: 'none' },
        ...options,
      });
      relays.push(result);
      return result;
    }
    return { outbox, clock, inserted, inspect, delays, relay };
  }
  it('INT-30 TC-103 applies exponential delay and retains error after success', async () => {
    const s = await setup();
    let calls = 0;
    const relay = s.relay({
      publisher: () => {
        if (++calls < 3) throw new Error('transient');
        return Promise.resolve();
      },
    });
    const failed = vi.fn();
    relay.on('failed', failed);
    for (const delay of [1000, 2000]) {
      expect(await relay.runOnce()).toMatchObject({ claimed: 1, failed: 1 });
      expect(failed).toHaveBeenLastCalledWith(expect.objectContaining({ willRetry: true, retryInMs: delay }));
      await s.clock.advance(delay + 1);
    }
    expect(await relay.runOnce()).toMatchObject({ delivered: 1 });
    expect(failed).toHaveBeenCalledTimes(2);
    expect(await s.inspect()).toEqual({ status: 'done', attempts: 3, last_error: 'Error: transient', dead: false });
    for (const [i, delay] of (await s.delays()).entries()) {
      expect(delay).toBeGreaterThanOrEqual((i + 1) * 1000 - 150);
      expect(delay).toBeLessThanOrEqual((i + 1) * 1000 + 150);
    }
    expect(await s.delays()).toHaveLength(2);
  });
  it('INT-31 TC-104 stops at the attempt budget and emits failed before dead', async () => {
    const s = await setup(3);
    const relay = s.relay({
      publisher: () => {
        throw new Error('boom');
      },
    });
    const events: string[] = [];
    const failed = vi.fn();
    relay.on('failed', (e) => {
      failed(e);
      events.push('failed');
    });
    relay.on('dead', () => {
      events.push('dead');
    });
    for (let i = 0; i < 3; i++) {
      expect((await relay.runOnce()).claimed).toBe(1);
      await s.clock.advance(5000);
    }
    expect(await s.inspect()).toEqual({ status: 'dead', attempts: 3, last_error: 'Error: boom', dead: true });
    expect(events).toEqual(['failed', 'failed', 'failed', 'dead']);
    expect(failed).toHaveBeenLastCalledWith(expect.objectContaining({ willRetry: false }));
    expect((await relay.runOnce()).claimed).toBe(0);
  });
  it('INT-32 TC-105 makes non-retryable errors terminal immediately', async () => {
    const s = await setup();
    const relay = s.relay({
      publisher: () => {
        throw new NonRetryableError('bad payload');
      },
    });
    expect(await relay.runOnce()).toMatchObject({ failed: 1, dead: 1 });
    expect(await s.inspect()).toMatchObject({
      status: 'dead',
      attempts: 1,
      last_error: 'OUTBOX_NON_RETRYABLE: bad payload',
      dead: true,
    });
  });
  it('INT-33 TC-106 honors explicit retry delay and clamps its maximum', async () => {
    const s = await setup();
    let calls = 0;
    const relay = s.relay({
      publisher: () => {
        throw new RetryableError('later', { retryAfterMs: ++calls === 1 ? 5000 : 10000000 });
      },
    });
    const failed = vi.fn();
    relay.on('failed', failed);
    for (const delay of [5000, 300000]) {
      expect((await relay.runOnce()).failed).toBe(1);
      expect(failed).toHaveBeenLastCalledWith(expect.objectContaining({ retryInMs: delay, willRetry: true }));
      await s.clock.advance(delay + 1);
    }
    const delays = await s.delays();
    expect(delays).toHaveLength(2);
    for (const [i, expected] of [5000, 300000].entries()) {
      expect(delays[i]).toBeGreaterThanOrEqual(expected - 150);
      expect(delays[i]).toBeLessThanOrEqual(expected + 150);
    }
  });
  it('INT-34 TC-107 makes an exhausted ghost lease dead on reclaim', async () => {
    const s = await setup(1);
    await claim(driver.adapter, s.outbox.config, { relayId: 'ghost', limit: 1, leaseMs: 5000 });
    await s.clock.advance(5001);
    const publisher = vi.fn(() => Promise.resolve());
    const relay = s.relay({ publisher });
    const reclaimed = vi.fn(),
      dead = vi.fn();
    relay.on('reclaimed', reclaimed);
    relay.on('dead', dead);
    expect(await relay.runOnce()).toMatchObject({ reclaimed: 1, claimed: 0, dead: 1 });
    expect(reclaimed).toHaveBeenCalledWith(expect.objectContaining({ deadIds: [s.inserted.id] }));
    expect(dead).toHaveBeenCalledTimes(1);
    expect(dead).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.objectContaining({ id: s.inserted.id }) as unknown }),
    );
    expect(publisher).not.toHaveBeenCalled();
    expect(await s.inspect()).toMatchObject({ status: 'dead', attempts: 1, dead: true });
  });
});
