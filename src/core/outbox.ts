import { enqueueValidated } from './sql/enqueue.js';
import { validateMessages } from './validate.js';
import type { MessageInput, EnqueueResult } from './types.js';
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
  function enqueue(tx: TTx, message: MessageInput<Topics>): Promise<EnqueueResult>;
  function enqueue(tx: TTx, messages: readonly MessageInput<Topics>[]): Promise<EnqueueResult[]>;
  async function enqueue(
    tx: TTx,
    input: MessageInput<Topics> | readonly MessageInput<Topics>[],
  ): Promise<EnqueueResult | EnqueueResult[]> {
    const multiple = Array.isArray(input);
    const messages = validateMessages(multiple ? input : [input], resolved);
    if (messages.length === 0) return [];
    const results = await enqueueValidated(adapter.forTransaction(tx), resolved, messages);
    if (multiple) return results;
    const result = results[0];
    if (result === undefined) throw new OutboxError('OUTBOX_INTERNAL', 'Missing enqueue result. Please report.');
    return result;
  }
  const outbox: Outbox<TTx, Topics> = {
    config: resolved,
    migrate: (options) => migrate(adapter, resolved, options),
    schemaVersion: () => schemaVersion(adapter, resolved),
    enqueue,
    createRelay: notImplemented,
    withInbox: notImplemented,
    purgeInbox: notImplemented,
    retryDead: notImplemented,
    skip: notImplemented,
    purge: notImplemented,
    listDead: notImplemented,
    stats: notImplemented,
  };
  Object.defineProperty(outbox, Symbol.for('@firatkill/outbox/internal'), { value: { adapter, config: resolved } });
  return outbox;
}
