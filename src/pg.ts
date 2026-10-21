import { createPgAdapter } from './adapters/pg.js';
import type { PgPool, PgTx } from './adapters/pg.js';
import { parseOutboxConfig } from './core/config.js';
import { createOutboxCore } from './core/outbox.js';
import type { DefaultTopics, Outbox, OutboxConfig, TopicMap } from './core/types.js';

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
