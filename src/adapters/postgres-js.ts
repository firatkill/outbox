import type { DriverAdapter, SqlExecutor } from '../core/types.js';

/** Structural transaction handle; does not require driver types. */
export interface PostgresJsTx {
  /** Execute a statement with explicitly cast parameters. */
  unsafe(query: string, params?: readonly unknown[]): PromiseLike<readonly Record<string, unknown>[]>;
}
/** Structural postgres.js client accepted by createOutbox. */
export interface PostgresJsSql extends PostgresJsTx {
  /** Run a callback on a transaction connection. */
  begin<T>(fn: (tx: PostgresJsTx) => Promise<T>): Promise<T>;
  /** Subscribe on a dedicated connection. */
  listen(
    channel: string,
    onNotify: (payload: string) => void,
    onListen?: () => void,
  ): Promise<{ unlisten(): Promise<void> }>;
}
/** Adapt a postgres.js handle without importing the driver. */
export function createPostgresJsAdapter(db: PostgresJsSql): DriverAdapter<PostgresJsSql, PostgresJsTx> {
  const wrap = (tx: PostgresJsTx): SqlExecutor => ({
    query: async (text, params) => Array.from(await tx.unsafe(text, params)),
  });
  return {
    name: 'postgres-js',
    db,
    query: (text, params) => wrap(db).query(text, params),
    forTransaction: wrap,
    transaction: (fn) => db.begin((tx) => fn(wrap(tx))),
    withDb: createPostgresJsAdapter,
  };
}
