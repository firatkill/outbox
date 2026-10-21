import type { DriverAdapter, SqlExecutor } from '../core/types.js';

/** Driver-neutral node-postgres result. */
export interface PgQueryResultLike {
  rows: Record<string, unknown>[];
}
/** Caller-owned node-postgres connection. */
export interface PgClientLike {
  /** Execute SQL on this connection. */
  query(text: string, params?: unknown[]): Promise<PgQueryResultLike>;
  /** Subscribe to server notifications. */
  on(event: 'notification', listener: (msg: { channel: string; payload?: string | undefined }) => void): unknown;
  /** Subscribe to connection errors. */
  on(event: 'error', listener: (err: Error) => void): unknown;
  /** Remove owned event listeners. */
  removeAllListeners?(event?: string): unknown;
}
/** Checked-out pool connection. */
export interface PgPoolClientLike extends PgClientLike {
  /** Return or destroy a connection. */
  release(destroy?: boolean | Error): void;
}
/** Structural node-postgres pool; requires no installed driver types. */
export interface PgPool {
  /** Execute an autocommit statement. */
  query(text: string, params?: unknown[]): Promise<PgQueryResultLike>;
  /** Check out a connection for a transaction. */
  connect(): Promise<PgPoolClientLike>;
}
/** A Client or PoolClient inside the caller's BEGIN. */
export type PgTx = PgClientLike;

/** Adapt a caller-owned node-postgres pool. */
export function createPgAdapter(db: PgPool): DriverAdapter<PgPool, PgTx> {
  const wrap = (client: Pick<PgClientLike, 'query'>): SqlExecutor => ({
    query: async (text, params) => (await client.query(text, [...params])).rows,
  });
  return {
    name: 'pg',
    db,
    query: (text, params) => wrap(db).query(text, params),
    forTransaction: wrap,
    transaction: async (fn) => {
      const client = await db.connect();
      let destroy: boolean | Error = false;
      try {
        await client.query('begin');
        const result = await fn(wrap(client));
        await client.query('commit');
        return result;
      } catch (error) {
        try {
          await client.query('rollback');
        } catch (rollbackError) {
          destroy = rollbackError instanceof Error ? rollbackError : true;
        }
        throw error;
      } finally {
        client.release(destroy);
      }
    },
    withDb: createPgAdapter,
  };
}
