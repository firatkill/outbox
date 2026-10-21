import pg from 'pg';
import postgres from 'postgres';
import { createPostgresJsAdapter } from '../../src/adapters/postgres-js.js';
import { createPgAdapter } from '../../src/adapters/pg.js';
import { createOutbox as createPgOutbox } from '../../src/pg.js';
import { createOutbox as createPostgresOutbox } from '../../src/postgres-js.js';
import type { DriverAdapter, SqlExecutor } from '../../src/core/types.js';
import { TEST_DATABASE_URL } from './db.js';

export const ADAPTERS = ['postgres-js', 'pg'] as const;
export type AdapterName = (typeof ADAPTERS)[number];
// Tests share a transaction executor shape while exercising the actual adapter wrappers.
export function createAdapter(name: AdapterName = 'postgres-js') {
  const db =
    name === 'postgres-js'
      ? postgres(TEST_DATABASE_URL, { max: 5, onnotice: () => undefined })
      : new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
  function erase<TDb, TTx>(real: DriverAdapter<TDb, TTx>): DriverAdapter<unknown, SqlExecutor> {
    return {
      name: real.name,
      db: real.db,
      query: (text, params) => real.query(text, params),
      forTransaction: (tx) => tx,
      transaction: (fn) => real.transaction(fn),
      withDb: () => {
        throw new Error('Use real adapters for withDb tests');
      },
    };
  }
  const adapter = db instanceof pg.Pool ? erase(createPgAdapter(db)) : erase(createPostgresJsAdapter(db));
  return {
    adapter,
    outbox: (options: { schema: string; tablePrefix?: string }) =>
      db instanceof pg.Pool ? createPgOutbox({ db, ...options }) : createPostgresOutbox({ db, ...options }),
    close: () => db.end(),
  };
}
