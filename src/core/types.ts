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

/** Topic-to-payload mapping. */
export type TopicMap = Record<string, unknown>;
/** Unrestricted topics with unknown payloads. */
export type DefaultTopics = Record<string, unknown>;

/** Input to enqueue. Discriminated by topic when Topics is a concrete map. */
export type MessageInput<Topics extends TopicMap = DefaultTopics> = {
  [K in keyof Topics & string]: {
    topic: K;
    payload: Topics[K];
    /** Partition key for ordering mode. 1..200 chars. null/undefined = unordered. */
    key?: string | null;
    /** String headers, e.g. traceparent. ≤ 50 entries, names 1..100 chars, values ≤ 2000 chars. */
    headers?: Readonly<Record<string, string>>;
    /** Unique per topic until the earlier message is purged. 1..200 chars. */
    dedupeKey?: string;
    /** Delay relative to database time. Integer 0..31_536_000_000 (365 days). Exclusive with availableAt. */
    delayMs?: number;
    /** Absolute earliest delivery instant. Exclusive with delayMs. */
    availableAt?: Date;
    /** Override the outbox default. Integer 1..1000. */
    maxAttempts?: number;
  };
}[keyof Topics & string];

/** Enqueue Result. */
export interface EnqueueResult {
  /** UUIDv7 of the stored message (the existing one when deduped). */
  id: string;
  topic: string;
  /** True when (topic, dedupeKey) already existed and nothing was inserted. */
  deduped: boolean;
}

/** A message as seen by handlers, publishers and admin helpers. */
export interface OutboxMessage<P = unknown> {
  id: string;
  /** Database sequence number, decimal string (int8 can exceed 2^53). */
  seq: string;
  topic: string;
  key: string | null;
  payload: P;
  headers: Readonly<Record<string, string>>;
  dedupeKey: string | null;
  status: MessageStatus;
  /** Number of claims so far, including the current one inside a handler. */
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  availableAt: Date;
  lastError: string | null;
}

/** Message Status. */
export type MessageStatus = 'pending' | 'in_flight' | 'done' | 'dead' | 'skipped';

/** Outbox. */
export interface Outbox<TTx, Topics extends TopicMap = DefaultTopics> {
  readonly config: ResolvedOutboxConfig;

  /** Insert one message using the caller's transaction. One statement. */
  enqueue(tx: TTx, message: MessageInput<Topics>): Promise<EnqueueResult>;
  /** Insert up to 1000 messages using the caller's transaction. One statement. Results in input order. */
  enqueue(tx: TTx, messages: readonly MessageInput<Topics>[]): Promise<EnqueueResult[]>;

  createRelay(options: RelayOptions<Topics>): Relay;

  /** Run fn at most once per (consumer, messageId), inside the caller's transaction. */
  withInbox<T>(tx: TTx, consumer: string, messageId: string, fn: (tx: TTx) => Promise<T>): Promise<InboxResult<T>>;
  purgeInbox(options: { olderThanMs: number; batchSize?: number }): Promise<{ deleted: number }>;

  retryDead(filter?: RetryDeadFilter): Promise<{ ids: string[] }>;
  skip(id: string): Promise<{ id: string; previousStatus: 'pending' | 'dead' }>;
  purge(options: PurgeOptions): Promise<{ deleted: number }>;
  listDead(options?: { topic?: string; limit?: number }): Promise<OutboxMessage[]>;
  stats(options?: { includeTerminal?: boolean }): Promise<OutboxStats>;

  migrate(options?: { dryRun?: boolean }): Promise<MigrateResult>;
  schemaVersion(): Promise<{ current: number; required: number }>;
}

/** Retry Dead Filter. */
export interface RetryDeadFilter {
  ids?: readonly string[]; // 1..1000 UUIDs
  topic?: string;
  key?: string;
  /** limit, 1..10000. @defaultValue 1000 */
  limit?: number;
}

/** Purge Options. */
export interface PurgeOptions {
  /** Delete terminal messages finished more than this many ms ago (database time). ≥ 0. */
  olderThanMs: number;
  /** Also delete dead messages (by dead_at). @defaultValue false */
  includeDead?: boolean;
  /** Rows per DELETE statement. Integer 1..50000. @defaultValue 5000 */
  batchSize?: number;
}

/** Outbox Stats. */
export interface OutboxStats {
  /** pending and available_at <= now */
  ready: number;
  /** pending and available_at > now */
  scheduled: number;
  inFlight: number;
  /** in_flight with locked_until < now (a relay died or is late) */
  expiredLeases: number;
  dead: number;
  /** Present only with includeTerminal: true. */
  done?: number;
  skipped?: number;
  /** now - min(available_at) over ready messages, in ms; 0 when none. */
  oldestReadyAgeMs: number;
  /** Database time when the stats were read. */
  measuredAt: Date;
}

/** Inbox Result. */
export type InboxResult<T> = { status: 'processed'; result: T } | { status: 'duplicate' };

/** Relay Options. */
export type RelayOptions<Topics extends TopicMap = DefaultTopics> =
  | (RelayCommonOptions & { handlers: Handlers<Topics>; publisher?: never })
  | (RelayCommonOptions & { publisher: Publisher; handlers?: never; topics?: readonly string[] });

/** Handlers. */
export type Handlers<Topics extends TopicMap> = {
  [K in keyof Topics & string]?: Handler<Topics[K]>;
};
/** Handler. */
export type Handler<P = unknown> = (message: OutboxMessage<P>, ctx: DeliveryContext) => Promise<void>;
/** Publisher. */
export type Publisher = (message: OutboxMessage, ctx: DeliveryContext) => Promise<void>;

/** Delivery Context. */
export interface DeliveryContext {
  /** Aborted on handler timeout (reason: OutboxError OUTBOX_HANDLER_TIMEOUT) or forced shutdown (reason: OutboxError OUTBOX_SHUTDOWN). */
  signal: AbortSignal;
  /** 1-based attempt number (equals message.attempts). */
  attempt: number;
  relayId: string;
}

/** Relay Common Options. */
/** Relay settings. Counts and millisecond values must be finite integers; retry.factor may be fractional. */
export interface RelayCommonOptions {
  /** Override the outbox db for this relay (e.g. a dedicated pool). Same driver type as the outbox. */
  db?: unknown; // typed per adapter as TDb
  /** Default `${os.hostname()}:${process.pid}:${4 random hex bytes}`. 1..200 chars. */
  relayId?: string;
  /** batchSize, 1..1000, must be <= concurrency. @defaultValue 10 */
  batchSize?: number;
  /** concurrency, 1..1000. @defaultValue 10 */
  concurrency?: number;
  /** leaseMs, 1_000..86_400_000, >= handlerTimeoutMs + 1000. @defaultValue 60_000 */
  leaseMs?: number;
  /** handlerTimeoutMs, 100..3_600_000. @defaultValue 30_000 */
  handlerTimeoutMs?: number;
  /** ordering. @defaultValue 'none' */
  ordering?: 'none' | 'key';
  retry?: {
    /** baseDelayMs, 0..3_600_000. @defaultValue 1000 */
    baseDelayMs?: number;
    /** factor, 1..10 (finite). @defaultValue 2 */
    factor?: number;
    /** maxDelayMs, >= baseDelayMs, <= 86_400_000. @defaultValue 300_000 */
    maxDelayMs?: number;
    /** jitter. @defaultValue 'full' */
    jitter?: 'full' | 'none';
  };
  poll?: {
    /** minIntervalMs, 10..60_000. @defaultValue 100 */
    minIntervalMs?: number;
    /** maxIntervalMs, >= minIntervalMs, <= 300_000. @defaultValue 2000 */
    maxIntervalMs?: number;
  };
  /** LISTEN wake-up. true = use the relay db; { db } = separate direct connection; false = poll only. @defaultValue true */
  listen?: boolean | { db: unknown };
  /** reclaimIntervalMs, 500..3_600_000. @defaultValue 10_000 */
  reclaimIntervalMs?: number;
  /** reclaimBatchSize, 1..10_000. @defaultValue 1000 */
  reclaimBatchSize?: number;
  /** Default drain timeout used by stop() and by signal abort. Integer 0..3600000. @defaultValue 30000 */
  drainTimeoutMs?: number;
  /** Stop the relay when this signal aborts (uses drainTimeoutMs). */
  signal?: AbortSignal;
  tracer?: Tracer;
}

/** Relay. */
export interface Relay {
  readonly id: string;
  readonly state: 'idle' | 'starting' | 'running' | 'stopping' | 'stopped';
  /** Check schema version, reclaim once, open LISTEN, start the loop. Rejects with OUTBOX_NOT_MIGRATED or OUTBOX_RELAY_STATE. */
  start(): Promise<void>;
  /** Graceful stop. Idempotent: later calls return the first call's promise. */
  stop(options?: { drainTimeoutMs?: number }): Promise<StopResult>;
  /** Claim and deliver at most one batch, flush outcomes, resolve. Only in state 'idle' (not started). */
  runOnce(): Promise<RunOnceResult>;
  on<E extends keyof RelayEvents>(event: E, listener: (payload: RelayEvents[E]) => void): () => void;
  off<E extends keyof RelayEvents>(event: E, listener: (payload: RelayEvents[E]) => void): void;
}

/** Stop Result. */
export interface StopResult {
  /** True when every in-flight delivery finished before the drain timeout. */
  drained: boolean;
  /** Leases released back to pending after the timeout. */
  released: number;
  durationMs: number;
}

/** Run Once Result. */
export interface RunOnceResult {
  claimed: number;
  delivered: number;
  failed: number;
  dead: number;
  leaseLost: number;
  reclaimed: number;
}

/** Relay Events. */
export interface RelayEvents {
  claimed: { relayId: string; count: number; ids: string[]; durationMs: number };
  delivered: { relayId: string; message: OutboxMessage; durationMs: number };
  failed: { relayId: string; message: OutboxMessage; error: unknown; willRetry: boolean; retryInMs: number | null };
  dead: { relayId: string; message: OutboxMessage | { id: string; topic: string; attempts: number }; error: unknown };
  reclaimed: { relayId: string; count: number; ids: string[]; deadIds: string[] };
  leaseLost: { relayId: string; id: string; attempt: number; outcome: 'done' | 'failed' };
  error: {
    relayId: string;
    phase: 'start' | 'claim' | 'flush' | 'reclaim' | 'listen' | 'release' | 'listener';
    error: unknown;
  };
}

/** Tracer. */
export interface Tracer {
  startSpan(name: string, attributes: Readonly<Record<string, string | number | boolean>>): Span;
}
/** Span. */
export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  recordException(error: unknown): void;
  /** status 'ok' | 'error' */
  end(status: 'ok' | 'error'): void;
}

/** Consumer inbox bound to a caller-owned transaction type. */
export interface Inbox<TTx> {
  /** Apply effects at most once for this consumer/message pair.
   * Let callback errors roll back the caller's transaction. External effects are not covered.
   * @example
   * await inbox.withInbox(tx, 'mailer', message.id, tx => saveEffect(tx, message));
   */
  withInbox<T>(tx: TTx, consumer: string, messageId: string, fn: (tx: TTx) => Promise<T>): Promise<InboxResult<T>>;
  /** Remove expired dedupe entries; retain records beyond the longest redelivery window.
   * @example
   * await inbox.purgeInbox({ olderThanMs: 7 * 86400000 });
   */
  purgeInbox(options: { olderThanMs: number; batchSize?: number }): Promise<{ deleted: number }>;
  /** Install the consumer schema using the shared migrations.
   * @example
   * await inbox.migrate();
   */
  migrate(options?: { dryRun?: boolean }): Promise<MigrateResult>;
}
