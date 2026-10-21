import { createPostgresJsAdapter } from './adapters/postgres-js.js';
import type { PostgresJsSql, PostgresJsTx } from './adapters/postgres-js.js';
import { parseOutboxConfig } from './core/config.js';
import { createOutboxCore } from './core/outbox.js';
import type { DefaultTopics, Outbox, OutboxConfig, TopicMap } from './core/types.js';

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
