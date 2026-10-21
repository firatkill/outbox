import { afterAll, describe, expect, it } from 'vitest';
import { createOutboxCore } from '../../src/core/outbox.js';
import { claim } from '../../src/core/sql/claim.js';
import { complete, fail } from '../../src/core/sql/outcome.js';
import { reclaim, release } from '../../src/core/sql/lease.js';
import { render } from '../../src/core/sql/render.js';
import { testClock } from '../../src/testing.js';
import type { MessageInput, OutboxMessage } from '../../src/core/types.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema } from '../helpers/db.js';
import { deferred } from '../helpers/wait.js';
import { createSpyExecutor } from '../helpers/spy.js';

const fence = (message: OutboxMessage) => ({ id: message.id, attempt: message.attempts });
function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('Expected a row');
  return item;
}

describe.each(ADAPTERS)('%s relay statements', (name) => {
  const driver = createAdapter(name);
  const schemas: Awaited<ReturnType<typeof createTestSchema>>[] = [];
  afterAll(async () => {
    await driver.close();
    for (const owned of schemas) await owned.drop();
  });
  async function setup(messages: MessageInput[] = [{ topic: 't', payload: { value: 1 } }]) {
    const owned = await createTestSchema();
    schemas.push(owned);
    const outbox = createOutboxCore(driver.adapter, { schema: owned.schema, tablePrefix: 'relay_' });
    await outbox.migrate();
    const clock = testClock(outbox);
    await clock.install();
    const inserted = await driver.adapter.transaction((tx) => outbox.enqueue(tx, messages));
    const inspect = (id: string) =>
      driver.adapter.query(
        render(
          `select id::text, status, attempts, last_error, locked_by,
      locked_until is null as lease_null, completed_at is not null as completed, dead_at is not null as dead,
      (extract(epoch from (locked_until - last_attempt_at)) * 1000)::float8 as lease_ms,
      (extract(epoch from (available_at - {{now}})) * 1000)::float8 as delay_ms,
      (extract(epoch from available_at) * 1000)::float8 as available_ms
      from {{messages}} where id = $1::uuid`,
          outbox.config,
        ),
        [id],
      );
    return { outbox, clock, inserted, inspect, config: outbox.config };
  }
  const options = { relayId: 'relay-a', limit: 10, leaseMs: 60000 };

  it('INT-21 TC-072 skips a separately locked row and claims it after release', async () => {
    const { config, inserted, inspect } = await setup(Array.from({ length: 5 }, () => ({ topic: 't', payload: null })));
    const id = first(inserted).id;
    const locked = deferred<undefined>();
    const unlock = deferred<undefined>();
    const holding = driver.adapter.transaction(async (tx) => {
      await tx.query(render('select id from {{messages}} where id = $1::uuid for update', config), [id]);
      locked.resolve(undefined);
      await unlock.promise;
    });
    try {
      await locked.promise;
      const rows = await claim(driver.adapter, config, options);
      expect(rows).toHaveLength(4);
      expect(rows.map((row) => row.id)).not.toContain(id);
      expect(first(await inspect(id))['status']).toBe('pending');
    } finally {
      unlock.resolve(undefined);
      await holding;
    }
    expect((await claim(driver.adapter, config, options)).map((row) => row.id)).toEqual([id]);
  });
  it('INT-94 TC-073 claims one ready batch with neutral fields and DB-time lease', async () => {
    const payload = { nested: [1, true, null, 'text'] };
    const { config, inserted, inspect } = await setup([
      { topic: 'a', payload, key: 'key', headers: { trace: 'fixture' }, dedupeKey: 'd', maxAttempts: 7 },
      { topic: 'b', payload: null },
      { topic: 'a', payload: null, delayMs: 60000 },
    ]);
    const spy = createSpyExecutor(driver.adapter);
    const rows = await claim(spy.executor, config, { ...options, limit: 1, topics: ['a'] });
    expect(spy.statements).toHaveLength(1);
    expect(spy.statements[0]?.params).toEqual(['relay-a', 1, 60000, '["a"]']);
    expect(rows).toHaveLength(1);
    const message = first(rows);
    expect(message).toMatchObject({
      id: first(inserted).id,
      topic: 'a',
      payload,
      key: 'key',
      headers: { trace: 'fixture' },
      dedupeKey: 'd',
      maxAttempts: 7,
      attempts: 1,
      status: 'in_flight',
      lastError: null,
    });
    expect(typeof message.seq).toBe('string');
    expect(message.createdAt).toBeInstanceOf(Date);
    expect(message.availableAt).toBeInstanceOf(Date);
    expect(first(await inspect(message.id))).toMatchObject({
      locked_by: 'relay-a',
      lease_ms: 60000,
      lease_null: false,
    });
    expect(await claim(driver.adapter, config, { ...options, topics: ['a'] })).toEqual([]);
    expect((await claim(driver.adapter, config, options)).map((row) => row.topic)).toEqual(['b']);
  });
  it('INT-94 TC-073 completes only the matching holder, status and attempt, even after expiry before reclaim', async () => {
    const { config, clock, inspect } = await setup();
    const message = first(await claim(driver.adapter, config, options));
    expect(await complete(driver.adapter, config, 'wrong', [fence(message)])).toEqual([]);
    expect(await complete(driver.adapter, config, options.relayId, [{ id: message.id, attempt: 2 }])).toEqual([]);
    expect(first(await inspect(message.id))['status']).toBe('in_flight');
    await clock.advance(60001);
    const spy = createSpyExecutor(driver.adapter);
    expect(await complete(spy.executor, config, options.relayId, [fence(message)])).toEqual([message.id]);
    expect(spy.statements).toHaveLength(1);
    expect(first(await inspect(message.id))).toMatchObject({
      status: 'done',
      attempts: 1,
      locked_by: null,
      lease_null: true,
      completed: true,
    });
    expect(await complete(driver.adapter, config, options.relayId, [fence(message)])).toEqual([]);
    expect(await release(driver.adapter, config, options.relayId, [fence(message)])).toEqual([]);
  });
  it('INT-95 TC-074 batches retry, terminal and exhausted failures with fences', async () => {
    const { config, inspect } = await setup([
      { topic: 'retry', payload: null },
      { topic: 'terminal', payload: null },
      { topic: 'exhausted', payload: null, maxAttempts: 1 },
    ]);
    const rows = await claim(driver.adapter, config, options);
    const attempts = rows.map((row) => ({
      ...fence(row),
      delayMs: 30000,
      error: 'Error: fixture',
      terminal: row.topic === 'terminal',
    }));
    expect(await fail(driver.adapter, config, 'wrong', attempts)).toEqual([]);
    expect(
      await fail(
        driver.adapter,
        config,
        options.relayId,
        attempts.map((item) => ({ ...item, attempt: 2 })),
      ),
    ).toEqual([]);
    const previous = new Map(
      await Promise.all(rows.map(async (row) => [row.id, first(await inspect(row.id))['available_ms']] as const)),
    );
    const spy = createSpyExecutor(driver.adapter);
    const failed = await fail(spy.executor, config, options.relayId, attempts);
    expect(spy.statements).toHaveLength(1);
    expect(failed).toHaveLength(3);
    for (const row of rows) {
      const retry = row.topic === 'retry';
      expect(failed.find((item) => item.id === row.id)).toEqual({
        id: row.id,
        status: retry ? 'pending' : 'dead',
        attempts: 1,
        maxAttempts: row.maxAttempts,
      });
      const actual = first(await inspect(row.id));
      expect(actual).toMatchObject({
        status: retry ? 'pending' : 'dead',
        attempts: 1,
        last_error: 'Error: fixture',
        locked_by: null,
        lease_null: true,
        dead: !retry,
      });
      if (retry) {
        expect(actual['delay_ms']).toBeGreaterThan(29000);
        expect(actual['delay_ms']).toBeLessThanOrEqual(30000);
      } else expect(actual['available_ms']).toBe(previous.get(row.id));
    }
    expect(await fail(driver.adapter, config, options.relayId, attempts)).toEqual([]);
    expect(await claim(driver.adapter, config, options)).toEqual([]);
  });
  it('INT-96 TC-075 reclaims expired leases, respects batch limits and rejects the old attempt', async () => {
    const { config, clock, inspect } = await setup([
      { topic: 'retry', payload: null },
      { topic: 'dead', payload: null, maxAttempts: 1 },
    ]);
    const rows = await claim(driver.adapter, config, options);
    expect(await reclaim(driver.adapter, config, 10)).toEqual([]);
    await clock.advance(60001);
    const spy = createSpyExecutor(driver.adapter);
    const reclaimed = [...(await reclaim(spy.executor, config, 1)), ...(await reclaim(spy.executor, config, 1))];
    expect(spy.statements).toHaveLength(2);
    expect(reclaimed).toHaveLength(2);
    expect(await reclaim(driver.adapter, config, 1)).toEqual([]);
    for (const row of reclaimed) {
      expect(row).toMatchObject({ status: row.topic === 'dead' ? 'dead' : 'pending', attempts: 1 });
      const actual = first(await inspect(row.id));
      expect(actual).toMatchObject({ locked_by: null, lease_null: true, dead: row.topic === 'dead' });
      expect(actual['last_error']).toMatch(/^OUTBOX_LEASE_EXPIRED: lease held by relay-a expired at \d{4}-.*Z$/);
    }
    // Reuse the same relay id: only the attempt number can distinguish the stale outcome.
    const reclaimedAgain = first(await claim(driver.adapter, config, options));
    expect(reclaimedAgain.attempts).toBe(2);
    expect(await complete(driver.adapter, config, options.relayId, rows.map(fence))).toEqual([]);
    expect(
      await fail(
        driver.adapter,
        config,
        options.relayId,
        rows.map((row) => ({ ...fence(row), delayMs: 0, error: 'stale', terminal: true })),
      ),
    ).toEqual([]);
    expect(await release(driver.adapter, config, options.relayId, rows.map(fence))).toEqual([]);
    expect(first(await inspect(reclaimedAgain.id))).toMatchObject({
      status: 'in_flight',
      attempts: 2,
      locked_by: 'relay-a',
    });
  });
  it('INT-97 TC-075 releases exact attempts without consuming the attempt budget', async () => {
    const { config, inspect } = await setup();
    const message = first(await claim(driver.adapter, config, options));
    expect(await release(driver.adapter, config, 'wrong', [fence(message)])).toEqual([]);
    expect(await release(driver.adapter, config, options.relayId, [{ id: message.id, attempt: 2 }])).toEqual([]);
    const spy = createSpyExecutor(driver.adapter);
    expect(await release(spy.executor, config, options.relayId, [fence(message)])).toEqual([message.id]);
    expect(spy.statements).toHaveLength(1);
    expect(first(await inspect(message.id))).toMatchObject({
      status: 'pending',
      attempts: 0,
      locked_by: null,
      lease_null: true,
      completed: false,
      dead: false,
    });
    expect(await release(driver.adapter, config, options.relayId, [fence(message)])).toEqual([]);
    expect(first(await claim(driver.adapter, config, options)).attempts).toBe(1);
  });
});
