import { quoteIdent } from '../core/identifiers.js';
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
    listen: async (channel, onNotify, onReconnect, onError) => {
      let closed = false,
        attempted = false,
        backoff = 1000;
      let client: PgPoolClientLike | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let pending: Promise<void> | undefined;
      function retry() {
        if (closed || timer !== undefined) return;
        timer = setTimeout(() => {
          timer = undefined;
          pending = connect();
        }, backoff);
        backoff = Math.min(30000, backoff * 2);
        timer.unref();
      }
      async function connect() {
        const reconnect = attempted;
        attempted = true;
        let next: PgPoolClientLike;
        try {
          next = await db.connect();
        } catch (error) {
          onError(error);
          retry();
          return;
        }
        if (closed) {
          next.release();
          return;
        }
        client = next;
        let failed = false;
        const unavailable = () => failed || closed;
        const fail = (error: unknown) => {
          if (unavailable()) return;
          failed = true;
          client = undefined;
          next.removeAllListeners?.('notification');
          next.release(error instanceof Error ? error : true);
          onError(error);
          retry();
        };
        next.on('notification', (message) => {
          if (!closed && !failed && message.channel === channel) onNotify();
        });
        next.on('error', fail);
        try {
          await next.query('listen ' + quoteIdent(channel));
        } catch (error) {
          fail(error);
          return;
        }
        if (unavailable()) return;
        backoff = 1000;
        if (reconnect) onReconnect();
      }
      pending = connect();
      await pending;
      return {
        close: async () => {
          closed = true;
          clearTimeout(timer);
          await pending;
          const current = client;
          client = undefined;
          if (!current) return;
          let destroy = false;
          try {
            await current.query('unlisten *');
          } catch (error) {
            destroy = true;
            onError(error);
          } finally {
            current.removeAllListeners?.('notification');
            current.removeAllListeners?.('error');
            current.release(destroy);
          }
        },
      };
    },
    withDb: createPgAdapter,
  };
}
