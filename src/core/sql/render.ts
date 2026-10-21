import { OutboxError } from '../errors.js';
import { quoteIdent } from '../identifiers.js';
import type { ResolvedOutboxConfig } from '../types.js';

/** Render only validated identifier tokens; data remains parameterized.
 * @example
 * render('select * from {{messages}}', config);
 */
export function render(template: string, config: ResolvedOutboxConfig): string {
  const tokens: Record<string, string> = {
    schema: quoteIdent(config.schema),
    messages: config.names.messages,
    inbox: config.names.inbox,
    migrations: config.names.migrations,
    test_clock: config.names.testClock,
    now: config.names.now,
    p: config.tablePrefix,
  };
  const result = template.replace(/\{\{([a-z_]+)\}\}/g, (token: string, name: string) => tokens[name] ?? token);
  if (result.includes('{{'))
    throw new OutboxError('OUTBOX_INTERNAL', 'Unresolved SQL template token. Please report.', {
      details: { template },
    });
  return result;
}
