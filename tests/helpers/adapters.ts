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
export function createAdapter(
  name: AdapterName = 'postgres-js',
  options: { max?: number; applicationName?: string; prepare?: boolean } = {},
) {
  const db =
    name === 'postgres-js'
      ? postgres(TEST_DATABASE_URL, {
          max: options.max ?? 5,
          prepare: options.prepare ?? true,
          connection: { application_name: options.applicationName ?? 'outbox-tests' },
          onnotice: () => undefined,
        })
      : new pg.Pool({
          connectionString: TEST_DATABASE_URL,
          max: options.max ?? 5,
          application_name: options.applicationName ?? 'outbox-tests',
        });
  const poolErrors: Error[] = [];
  // Caller-owned pg pools report terminated idle connections here, outside query promises.
  if (db instanceof pg.Pool)
    db.on('error', (error) => {
      poolErrors.push(error);
    });
  function erase<TDb, TTx>(real: DriverAdapter<TDb, TTx>): DriverAdapter<unknown, SqlExecutor> {
    return {
      name: real.name,
      db: real.db,
      query: (text, params) => real.query(text, params),
      forTransaction: (tx) => tx,
      transaction: (fn) => real.transaction(fn),
      withDb: (other) => erase(real.withDb(other as TDb)),
    };
  }
  const adapter = db instanceof pg.Pool ? erase(createPgAdapter(db)) : erase(createPostgresJsAdapter(db));
  return {
    adapter,
    poolErrors,
    outbox: (options: { schema: string; tablePrefix?: string }) =>
      db instanceof pg.Pool ? createPgOutbox({ db, ...options }) : createPostgresOutbox({ db, ...options }),
    // Tests await relay/transaction work first; terminated sockets must not stall pool cleanup.
    close: () => (db instanceof pg.Pool ? db.end() : db.end({ timeout: 0 })),
  };
}
