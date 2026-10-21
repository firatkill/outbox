import { parseOutboxConfig } from './config.js';
import { OutboxError } from './errors.js';
import { migrate, schemaVersion } from './migrations/runner.js';
import type { DefaultTopics, DriverAdapter, Outbox, OutboxConfig, TopicMap } from './types.js';

/** Build an outbox from a structural custom driver adapter.
 * @example
 * const outbox = createOutboxCore(adapter, { schema: 'events' });
 * await outbox.migrate();
 */
export function createOutboxCore<TDb, TTx, Topics extends TopicMap = DefaultTopics>(
  adapter: DriverAdapter<TDb, TTx>,
  config: Omit<OutboxConfig<TDb>, 'db'>,
): Outbox<TTx, Topics> {
  const resolved = parseOutboxConfig({ ...config, db: adapter.db });
  const notImplemented = (): never => {
    throw new OutboxError('OUTBOX_INTERNAL', 'not implemented');
  };
  return {
    config: resolved,
    migrate: (options) => migrate(adapter, resolved, options),
    schemaVersion: () => schemaVersion(adapter, resolved),
    enqueue: notImplemented,
    createRelay: notImplemented,
    withInbox: notImplemented,
    purgeInbox: notImplemented,
    retryDead: notImplemented,
    skip: notImplemented,
    purge: notImplemented,
    listDead: notImplemented,
    stats: notImplemented,
  };
}
