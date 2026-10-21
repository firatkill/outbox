import { createOutboxCore } from '../../src/core/outbox.js';
import { render } from '../../src/core/sql/render.js';
import type { OutboxMessage } from '../../src/core/types.js';
import { concurrentScenario } from '../helpers/concurrency.js';
import { waitForEvent } from '../helpers/wait.js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPgAdapter } from '../../src/adapters/pg.js';
import type { PgPool } from '../../src/adapters/pg.js';
import { mapMessageRow } from '../../src/core/row.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema, TEST_DATABASE_URL } from '../helpers/db.js';

describe('pg transaction ownership', () => {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  const adapter = createPgAdapter(pool);
  let owned: Awaited<ReturnType<typeof createTestSchema>>;
  beforeAll(async () => {
    owned = await createTestSchema();
    await pool.query('create table "' + owned.schema + '".effects (id int4)');
  });
  afterAll(async () => {
    await pool.end();
    await owned.drop();
  });
  it('INT-80 TC-048 releases clients after 50 successful and failed transactions', async () => {
    const baseline = { total: pool.totalCount, idle: pool.idleCount };
    for (let i = 0; i < 50; i++) {
      const transaction = adapter.transaction(async (tx) => {
        await tx.query('insert into "' + owned.schema + '".effects values ($1::int4)', [i]);
        if (i % 2 === 0) throw new Error('rollback fixture');
        return i;
      });
      if (i % 2 === 0) await expect(transaction).rejects.toThrow('rollback fixture');
      else expect(await transaction).toBe(i);
      expect({ total: pool.totalCount, idle: pool.idleCount }).toEqual(baseline);
    }
    expect(await adapter.query('select count(*)::int4 as count from "' + owned.schema + '".effects', [])).toEqual([
      { count: 25 },
    ]);
  });
  it('INT-80 TC-048 destroys the connection if rollback fails and preserves the original error', async () => {
    const rollbackError = new Error('rollback failure fixture');
    const original = new Error('callback failure fixture');
    let released: boolean | Error | undefined;
    const injected: PgPool = {
      query: (text, params) => pool.query(text, params),
      connect: async () => {
        const client = await pool.connect();
        return {
          query: (text, params) => (text === 'rollback' ? Promise.reject(rollbackError) : client.query(text, params)),
          on: client.on.bind(client),
          release: (destroy) => {
            released = destroy;
            client.release(destroy);
          },
        };
      },
    };
    await expect(createPgAdapter(injected).transaction(() => Promise.reject(original))).rejects.toBe(original);
    expect(released).toBe(rollbackError);
    expect(pool.totalCount).toBe(0);
    expect(pool.waitingCount).toBe(0);
  });
  it('INT-80 TC-048 binds withDb queries and transactions to the alternate pool', async () => {
    const other = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    try {
      const rebound = adapter.withDb(other);
      expect(rebound.db).toBe(other);
      const pid = await rebound.query('select pg_backend_pid()::int4 as pid', []);
      expect(await rebound.transaction((tx) => tx.query('select pg_backend_pid()::int4 as pid', []))).toEqual(pid);
      expect(other.idleCount).toBe(1);
    } finally {
      await other.end();
    }
  });
});

describe.each(ADAPTERS)('%s driver-neutral rows', (name) => {
  let owned: Awaited<ReturnType<typeof createTestSchema>>;
  const driver = createAdapter(name);
  beforeAll(async () => {
    owned = await createTestSchema();
  });
  afterAll(async () => {
    await driver.close();
    await owned.drop();
  });
  it('INT-82 TC-047 casts text, JSON, floats and integers identically (statement-level skeleton)', async () => {
    const rows = await driver.adapter.query(
      `select
      '019a39b9-0000-7000-8000-000000000000'::text as id,
      9007199254740993::int8::text as seq, 'order.created'::text as topic,
      null::text as key, $1::text::jsonb::text as payload, '{}'::jsonb::text as headers,
      null::text as dedupe_key, 'pending'::text as status,
      0::int4 as attempts, 10::int4 as max_attempts,
      1700000000000::float8 as created_at_ms, 1700000001000::float8 as available_at_ms,
      null::text as last_error`,
      ['{"id":1}'],
    );
    const row = rows[0];
    if (!row) throw new Error('Missing typed row');
    expect(mapMessageRow(row)).toMatchObject({
      seq: '9007199254740993',
      payload: { id: 1 },
      attempts: 0,
      maxAttempts: 10,
      createdAt: new Date(1700000000000),
      availableAt: new Date(1700000001000),
    });
  });
});

describe.each(ADAPTERS)('%s relay adapter integration', (name) => {
  it('INT-82 TC-096 maps actual claim rows to driver-neutral JavaScript values', async () => {
    const owned = await createTestSchema();
    const driver = createAdapter(name);
    const outbox = createOutboxCore(driver.adapter, { schema: owned.schema });
    const captured: OutboxMessage[] = [];
    const relay = outbox.createRelay({
      listen: false,
      publisher: (message) => {
        captured.push(message);
        return Promise.resolve();
      },
    });
    try {
      await outbox.migrate();
      await driver.adapter.query(
        render('alter table {{messages}} alter column seq restart with 9007199254740993', outbox.config),
        [],
      );
      const inserted = await driver.adapter.transaction((tx) =>
        outbox.enqueue(tx, {
          topic: 'mapped',
          payload: { nested: [1, true, null, 'text'] },
          headers: { trace: 'fixture' },
          key: 'key',
          dedupeKey: 'dedupe',
          maxAttempts: 7,
        }),
      );
      await relay.runOnce();
      const message = captured[0];
      expect(message).toMatchObject({
        id: inserted.id,
        seq: '9007199254740993',
        topic: 'mapped',
        payload: { nested: [1, true, null, 'text'] },
        headers: { trace: 'fixture' },
        key: 'key',
        dedupeKey: 'dedupe',
        attempts: 1,
        maxAttempts: 7,
        status: 'in_flight',
        lastError: null,
      });
      expect(message?.createdAt).toBeInstanceOf(Date);
      expect(message?.availableAt).toBeInstanceOf(Date);
      const [stored] = await driver.adapter.query(
        render(
          'select floor(extract(epoch from created_at) * 1000)::float8 as created, floor(extract(epoch from available_at) * 1000)::float8 as available from {{messages}}',
          outbox.config,
        ),
        [],
      );
      expect(message?.createdAt.getTime()).toBe(stored?.['created']);
      expect(message?.availableAt.getTime()).toBe(stored?.['available']);
      expect(typeof message?.attempts).toBe('number');
      expect(typeof message?.seq).toBe('string');
    } finally {
      await relay.stop();
      await driver.close();
      await owned.drop();
    }
  });
  it('INT-83 TC-097 executes every relay statement on the override pool', async () => {
    const owned = await createTestSchema();
    const a = createAdapter(name, { max: 1, applicationName: owned.schema + '_a' });
    const b = createAdapter(name, { max: 1, applicationName: owned.schema + '_b' });
    const applications: unknown[] = [];
    const outbox = createOutboxCore(
      {
        ...a.adapter,
        withDb(db: unknown) {
          const rebound = a.adapter.withDb(db);
          return {
            ...rebound,
            query: async (text, params) => {
              applications.push(
                (await rebound.query("select current_setting('application_name') as app", []))[0]?.['app'],
              );
              return rebound.query(text, params);
            },
          };
        },
      },
      { schema: owned.schema },
    );
    const relay = outbox.createRelay({ db: b.adapter.db, listen: false, publisher: () => Promise.resolve() });
    try {
      await outbox.migrate();
      await a.adapter.transaction((tx) => outbox.enqueue(tx, { topic: 't', payload: null }));
      expect(await relay.runOnce()).toMatchObject({ claimed: 1, delivered: 1 });
      expect(applications.length).toBeGreaterThanOrEqual(5);
      expect(new Set(applications)).toEqual(new Set([owned.schema + '_b']));
      expect(await a.adapter.query("select current_setting('application_name') as app", [])).toEqual([
        { app: owned.schema + '_a' },
      ]);
    } finally {
      await relay.stop();
      await a.close();
      await b.close();
      await owned.drop();
    }
  });
});

describe('postgres-js prepare:false relay', () => {
  it('INT-81 TC-095 delivers the INT-20 message and context without prepared statements', async () => {
    const owned = await createTestSchema();
    const driver = createAdapter('postgres-js', { prepare: false });
    const outbox = createOutboxCore(driver.adapter, { schema: owned.schema });
    const target = vi.fn(() => Promise.resolve());
    const relay = outbox.createRelay({ listen: false, handlers: { t: target } });
    try {
      await outbox.migrate();
      const inserted = await driver.adapter.transaction((tx) =>
        outbox.enqueue(tx, { topic: 't', payload: { value: 1 } }),
      );
      const delivered = waitForEvent(relay, 'delivered');
      await relay.start();
      const event = await delivered;
      await relay.stop();
      expect(event.message).toMatchObject({ id: inserted.id, topic: 't', payload: { value: 1 }, attempts: 1 });
      expect(target).toHaveBeenCalledExactlyOnceWith(
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
            'select status, attempts, completed_at is not null as completed, locked_by, locked_until from {{messages}}',
            outbox.config,
          ),
          [],
        ),
      ).toEqual([{ status: 'done', attempts: 1, completed: true, locked_by: null, locked_until: null }]);
    } finally {
      await relay.stop();
      await driver.close();
      await owned.drop();
    }
  });
  // 1,000 real deliveries across the same four-pool INT-22 workload, without prepared statements.
  it('INT-81 TC-095 runs the reduced 1000-message concurrency workload without prepared statements', async () => {
    const result = await concurrentScenario('postgres-js', 1000, false);
    expect(result.seen.size).toBe(1000);
    expect([...result.seen.values()].every((count) => count === 1)).toBe(true);
    expect(result.rows).toEqual([{ status: 'done', attempts: 1, count: 1000 }]);
    expect(result.delivered.every((count) => count >= 100)).toBe(true);
    expect(result.leaseLost).toBe(0);
    expect(result.reclaimed).toBe(0);
    expect(result.durationMs).toBeLessThan(60000);
  }, 120000);
});
