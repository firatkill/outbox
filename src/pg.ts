import { createInboxCore } from './core/inbox.js';
import { createPgAdapter } from './adapters/pg.js';
import type { PgPool, PgTx } from './adapters/pg.js';
import { parseOutboxConfig } from './core/config.js';
import { createOutboxCore } from './core/outbox.js';
import type { DefaultTopics, Inbox, Outbox, OutboxConfig, TopicMap } from './core/types.js';

export type { PgClientLike, PgPoolClientLike, PgPool, PgTx, PgQueryResultLike } from './adapters/pg.js';
/** Create an outbox using a caller-owned node-postgres pool.
 * @example
 * const outbox = createOutbox({ db: pool });
 * await outbox.migrate();
 */
export function createOutbox<Topics extends TopicMap = DefaultTopics>(
  config: OutboxConfig<PgPool>,
): Outbox<PgTx, Topics> {
  parseOutboxConfig(config);
  const { db, ...options } = config;
  return createOutboxCore(createPgAdapter(db), options);
}

/** Create a standalone consumer inbox using a caller-owned pool.
 * @param config - Database and naming options. Schema defaults to public; tablePrefix defaults to outbox_.
 * @example
 * const inbox = createInbox({ db, schema: 'consumers' });
 * await inbox.migrate();
 */
export function createInbox(config: {
  /** Caller-owned database pool. */
  db: PgPool;
  /** Consumer schema. @defaultValue 'public' */
  schema?: string;
  /** Table/function prefix. @defaultValue 'outbox_' */
  tablePrefix?: string;
}): Inbox<PgTx> {
  parseOutboxConfig(config, true);
  const { db, ...options } = config;
  return createInboxCore(createPgAdapter(db), options);
}
