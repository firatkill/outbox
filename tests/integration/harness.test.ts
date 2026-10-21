import pg from 'pg';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSchema, TEST_DATABASE_URL } from '../helpers/db.js';

const ADAPTERS = ['postgres-js', 'pg'] as const;

describe.each(ADAPTERS)('%s harness', (driver) => {
  let first: Awaited<ReturnType<typeof createTestSchema>>;
  let second: Awaited<ReturnType<typeof createTestSchema>>;

  beforeAll(async () => {
    first = await createTestSchema();
    second = await createTestSchema();
  });
  afterAll(async () => {
    await first.drop();
    await second.drop();
  });

  it('INT-08 TC-009 isolates test-owned tables and data between schemas', async () => {
    const sql = postgres(TEST_DATABASE_URL, { max: 1 });
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    const query = async (text: string, params: number[] = []) =>
      driver === 'pg' ? (await pool.query<Record<string, unknown>>(text, params)).rows : await sql.unsafe(text, params);
    try {
      // Names come only from createTestSchema(), never from test input.
      await query(`create table "${first.schema}".sample (value integer not null)`);
      await query(`insert into "${first.schema}".sample values ($1::int4)`, [42]);
      expect(await query(`select value from "${first.schema}".sample`)).toEqual([{ value: 42 }]);
      const absent = await second.admin`select to_regclass(${`${second.schema}.sample`})::text as name`;
      expect(absent[0]?.['name']).toBeNull();
    } finally {
      await pool.end();
      await sql.end();
    }
  });

  it('INT-08 TC-009 cleanup removes only the schema owned by the helper', async () => {
    const temporary = await createTestSchema();
    await temporary.drop();
    const rows = await second.admin<
      { name: string }[]
    >`select nspname::text as name from pg_namespace where nspname in (${temporary.schema}, ${second.schema})`;
    expect(rows.map((row) => row.name)).toEqual([second.schema]);
  });
});
