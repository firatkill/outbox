import postgres from 'postgres';
import type { DriverAdapter, SqlExecutor } from '../../src/core/types.js';
import { TEST_DATABASE_URL } from './db.js';

// Temporary runner-only adapter per T-05; replaced by the real adapter in T-08.
export const ADAPTERS = ['postgres-js'] as const;
export function createAdapter() {
  const db = postgres(TEST_DATABASE_URL, { max: 5, onnotice: () => undefined });
  type Tx = postgres.TransactionSql;
  const wrap = (tx: Pick<Tx, 'unsafe'>): SqlExecutor => ({
    query: async (text, params) => Array.from(await tx.unsafe<Record<string, unknown>[]>(text, [...params])),
  });
  const bind = (sql: typeof db): DriverAdapter<typeof db, Tx> => ({
    name: 'postgres-js',
    db: sql,
    query: (text, params) => wrap(sql).query(text, params),
    forTransaction: wrap,
    transaction: async (fn) => {
      const result = await sql.begin(async (tx) => ({ value: await fn(wrap(tx)) }));
      return result.value;
    },
    withDb: bind,
  });
  return { adapter: bind(db), close: () => db.end() };
}
