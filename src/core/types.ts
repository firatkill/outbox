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
