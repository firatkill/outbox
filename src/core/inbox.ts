import { stringLength, validTopic } from './validate.js';
import { createAdmin } from './admin.js';
import { parseOutboxConfig } from './config.js';
import { OutboxError } from './errors.js';
import { migrate } from './migrations/runner.js';
import { I1 } from './sql/inbox.js';
import { render } from './sql/render.js';
import type { DriverAdapter, Inbox, ResolvedOutboxConfig } from './types.js';

/** Bind inbox operations without opening or committing the caller's transaction. */
export function createWithInbox<TDb, TTx>(
  adapter: DriverAdapter<TDb, TTx>,
  config: ResolvedOutboxConfig,
): Inbox<TTx>['withInbox'] {
  return async (tx, consumer, messageId, fn) => {
    for (const [field, value] of [
      ['consumer', consumer],
      ['messageId', messageId],
    ] as const) {
      if (!(field === 'consumer' ? validTopic(value) : stringLength(value, 1, 200))) {
        throw new OutboxError('OUTBOX_INVALID_MESSAGE', 'Invalid ' + field, {
          details: { field, reason: 'Expected 1..200 characters' },
        });
      }
    }
    const rows = await adapter.forTransaction(tx).query(render(I1, config), [consumer, messageId]);
    return rows.length === 0 ? { status: 'duplicate' } : { status: 'processed', result: await fn(tx) };
  };
}

/** Build the standalone consumer API with the shared migration runner. */
export function createInboxCore<TDb, TTx>(
  adapter: DriverAdapter<TDb, TTx>,
  options: { schema?: string; tablePrefix?: string },
): Inbox<TTx> {
  const config = parseOutboxConfig({ ...options, db: adapter.db }, true);
  const inbox: Inbox<TTx> = {
    withInbox: createWithInbox(adapter, config),
    purgeInbox: createAdmin(adapter, config).purgeInbox,
    migrate: (options) => migrate(adapter, config, options),
  };
  Object.defineProperty(inbox, Symbol.for('@firatkill/outbox/internal'), { value: { adapter, config } });
  return inbox;
}
