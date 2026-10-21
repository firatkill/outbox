/** Driver handle and per-outbox defaults. */
export interface OutboxConfig<TDb> {
  /** Driver handle for autocommit statements and migrations. */
  db: TDb;
  /** PostgreSQL schema, 1..30 lowercase identifier characters. @defaultValue 'public' */
  schema?: string;
  /** Object-name prefix, 1..20 lowercase identifier characters. @defaultValue 'outbox_' */
  tablePrefix?: string;
  /** Default claim limit stored on messages, integer 1..1000. @defaultValue 10 */
  maxAttempts?: number;
  /** Send a transaction-scoped notification from enqueue. @defaultValue true */
  notify?: boolean;
  /** Maximum UTF-8 JSON payload bytes, integer 1..67108864. @defaultValue 1048576 */
  maxPayloadBytes?: number;
}

/** Validated configuration without the driver handle. */
export interface ResolvedOutboxConfig {
  /** Validated schema. */
  schema: string;
  /** Validated object-name prefix. */
  tablePrefix: string;
  /** Default maximum attempts. */
  maxAttempts: number;
  /** Whether enqueue sends a notification. */
  notify: boolean;
  /** Maximum encoded payload size. */
  maxPayloadBytes: number;
  /** Qualified, double-quoted SQL names; now includes the function-call parentheses. */
  names: { messages: string; inbox: string; migrations: string; testClock: string; now: string };
  /** Notification channel unique to this schema and prefix. */
  channel: string;
}

/** Driver-neutral parameter values; JSON is passed as an encoded string. */
export type SqlParam = string | number | boolean | null;

/** Statement execution without exposing a driver dependency. */
export interface SqlExecutor {
  /** Empty parameters must support semicolon-separated statements via simple protocol. */
  query(text: string, params: readonly SqlParam[]): Promise<Record<string, unknown>[]>;
}

/** An owned notification subscription. */
export interface ListenHandle {
  /** Stop listening and release the owned connection. */
  close(): Promise<void>;
}

/** Structural adapter contract for custom drivers. */
export interface DriverAdapter<TDb, TTx> {
  /** Diagnostic driver name. */
  readonly name: string;
  /** Original driver handle. */
  readonly db: TDb;
  /** Autocommit executor for single statements. */
  readonly query: SqlExecutor['query'];
  /** Wrap the caller's transaction without starting or completing it. */
  forTransaction(tx: TTx): SqlExecutor;
  /** Run a callback in a new transaction, for migrations and tests only. */
  transaction<T>(fn: (executor: SqlExecutor) => Promise<T>): Promise<T>;
  /** Optional subscription; without it relays poll. */
  listen?(
    channel: string,
    onNotify: () => void,
    onReconnect: () => void,
    onError: (err: unknown) => void,
  ): Promise<ListenHandle>;
  /** Bind the adapter to an alternate driver handle. */
  withDb(db: TDb): DriverAdapter<TDb, TTx>;
}

/** Migration execution or dry-run result. */
export interface MigrateResult {
  /** Versions newly applied, or pending versions in a dry run. */
  applied: { version: number; name: string }[];
  /** Highest stored version. */
  currentVersion: number;
  /** Whether execution was read-only. */
  dryRun: boolean;
  /** DDL executed or proposed. */
  sql: string;
}
