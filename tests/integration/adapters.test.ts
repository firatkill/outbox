import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
