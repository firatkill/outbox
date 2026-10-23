import { createInboxCore } from './core/inbox.js';
import { createPostgresJsAdapter } from './adapters/postgres-js.js';
import type { PostgresJsSql, PostgresJsTx } from './adapters/postgres-js.js';
import { parseOutboxConfig } from './core/config.js';
import { createOutboxCore } from './core/outbox.js';
import type { DefaultTopics, Inbox, Outbox, OutboxConfig, TopicMap } from './core/types.js';

export type { PostgresJsSql, PostgresJsTx } from './adapters/postgres-js.js';
/** Create an outbox using a caller-owned postgres.js client.
 * @example
 * const outbox = createOutbox({ db: sql });
 * await outbox.migrate();
 */
export function createOutbox<Topics extends TopicMap = DefaultTopics>(
  config: OutboxConfig<PostgresJsSql>,
): Outbox<PostgresJsTx, Topics> {
  parseOutboxConfig(config);
  const { db, ...options } = config;
  return createOutboxCore(createPostgresJsAdapter(db), options);
}

/** Create a standalone consumer inbox using a caller-owned pool.
 * @param config - Database and naming options. Schema defaults to public; tablePrefix defaults to outbox_.
 * @example
 * const inbox = createInbox({ db, schema: 'consumers' });
 * await inbox.migrate();
 */
export function createInbox(config: {
  /** Caller-owned database pool. */
  db: PostgresJsSql;
  /** Consumer schema. @defaultValue 'public' */
  schema?: string;
  /** Table/function prefix. @defaultValue 'outbox_' */
  tablePrefix?: string;
}): Inbox<PostgresJsTx> {
  parseOutboxConfig(config, true);
  const { db, ...options } = config;
  return createInboxCore(createPostgresJsAdapter(db), options);
}
