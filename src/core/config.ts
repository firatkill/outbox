import { OutboxError } from './errors.js';
import { quoteIdent, validateIdentifier } from './identifiers.js';
import type { ResolvedOutboxConfig } from './types.js';

const KEYS = new Set(['db', 'schema', 'tablePrefix', 'maxAttempts', 'notify', 'maxPayloadBytes']);

/** Resolve defaults and report every invalid or unknown option synchronously.
 * @example
 * parseOutboxConfig({ db: driver, schema: 'app_events' });
 */
export function parseOutboxConfig(input: unknown): ResolvedOutboxConfig {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new OutboxError('OUTBOX_CONFIG', 'config must be an object', {
      details: { issues: ['config must be an object'] },
    });
  }
  const config = input as Record<string, unknown>;
  const issues: string[] = [];
  for (const key of Object.keys(config)) if (!KEYS.has(key)) issues.push(`Unknown option: ${key}`);
  if (config['db'] === undefined || config['db'] === null) issues.push('db is required');
  const schema = config['schema'] === undefined ? 'public' : config['schema'];
  const tablePrefix = config['tablePrefix'] === undefined ? 'outbox_' : config['tablePrefix'];
  const maxAttempts = config['maxAttempts'] === undefined ? 10 : config['maxAttempts'];
  const maxPayloadBytes = config['maxPayloadBytes'] === undefined ? 1_048_576 : config['maxPayloadBytes'];
  const notify = config['notify'] === undefined ? true : config['notify'];
  if (!validateIdentifier(schema, 30)) issues.push('schema must match ^[a-z_][a-z0-9_]*$ and contain 1..30 characters');
  if (!validateIdentifier(tablePrefix, 20))
    issues.push('tablePrefix must match ^[a-z_][a-z0-9_]*$ and contain 1..20 characters');
  if (typeof maxAttempts !== 'number' || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 1000) {
    issues.push('maxAttempts must be an integer in 1..1000');
  }
  if (
    typeof maxPayloadBytes !== 'number' ||
    !Number.isInteger(maxPayloadBytes) ||
    maxPayloadBytes < 1 ||
    maxPayloadBytes > 67_108_864
  ) {
    issues.push('maxPayloadBytes must be an integer in 1..67108864');
  }
  if (typeof notify !== 'boolean') issues.push('notify must be a boolean');
  if (issues.length > 0) throw new OutboxError('OUTBOX_CONFIG', issues.join('; '), { details: { issues } });
  // All unknown values were validated above; keep the aggregate issue reporting before narrowing.
  const resolved = { schema, tablePrefix, maxAttempts, maxPayloadBytes, notify } as Omit<
    ResolvedOutboxConfig,
    'names' | 'channel'
  >;
  const qualify = (suffix: string) => quoteIdent(resolved.schema) + '.' + quoteIdent(resolved.tablePrefix + suffix);
  return {
    ...resolved,
    names: {
      messages: qualify('messages'),
      inbox: qualify('inbox'),
      migrations: qualify('schema_migrations'),
      testClock: qualify('test_clock'),
      now: qualify('now') + '()',
    },
    channel: resolved.schema + '.' + resolved.tablePrefix + 'messages',
  };
}
