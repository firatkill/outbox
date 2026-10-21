import pg from 'pg';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseOutboxConfig } from '../../src/core/config.js';
import { render } from '../../src/core/sql/render.js';
import { createTestSchema, TEST_DATABASE_URL } from '../helpers/db.js';

const ADAPTERS = ['postgres-js', 'pg'] as const;
describe.each(ADAPTERS)('%s rendered identifiers', (driver) => {
  let owned: Awaited<ReturnType<typeof createTestSchema>>;
  beforeAll(async () => {
    owned = await createTestSchema();
  });
  afterAll(async () => {
    await owned.drop();
  });
  it('INT-09 TC-063 executes quoted custom names and preserves parameter data', async () => {
    const sql = postgres(TEST_DATABASE_URL, { max: 1 });
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    const config = parseOutboxConfig({ db: {}, schema: owned.schema, tablePrefix: 'ob_' });
    const query = async (text: string, params: string[] = []) =>
      driver === 'pg'
        ? (await pool.query<Record<string, unknown>>(text, params)).rows
        : Array.from(await sql.unsafe(text, params));
    try {
      await query(render('create table {{messages}} (value text not null)', config));
      const value = "'); drop table ignored; --";
      await query(render('insert into {{messages}} values ($1::text)', config), [value]);
      expect(await query(render('select value::text as value from {{messages}}', config))).toEqual([{ value }]);
    } finally {
      await pool.end();
      await sql.end();
    }
  });
});
