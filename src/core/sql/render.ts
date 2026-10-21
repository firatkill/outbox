import { OutboxError } from '../errors.js';
import { quoteIdent } from '../identifiers.js';
import type { ResolvedOutboxConfig } from '../types.js';

const cache = new WeakMap<ResolvedOutboxConfig, Map<string, string>>();

/** Render only validated identifier tokens; data remains parameterized.
 * @example
 * render('select * from {{messages}}', config);
 */
export function render(template: string, config: ResolvedOutboxConfig): string {
  const statements = cache.get(config) ?? new Map<string, string>();
  const cached = statements.get(template);
  if (cached !== undefined) return cached;
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
  statements.set(template, result);
  cache.set(config, statements);
  return result;
}
