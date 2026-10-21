import { OutboxError } from './errors.js';

/** UUID syntax accepted by the admin API, independent of UUID version. */
export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) &&
    !value.endsWith('\n')
  );
}
export type AdminOperation = 'retryDead' | 'purge' | 'purgeInbox' | 'listDead' | 'stats';
export interface ParsedAdminOptions {
  ids?: readonly string[];
  topic?: string;
  key?: string;
  limit?: number;
  olderThanMs?: number;
  batchSize?: number;
  includeDead?: boolean;
  includeTerminal?: boolean;
}
/** Validate admin input before issuing a statement (D-71). */
export function parseAdminOptions(operation: AdminOperation, input: unknown = {}): ParsedAdminOptions {
  const allowed: Record<AdminOperation, readonly string[]> = {
    retryDead: ['ids', 'topic', 'key', 'limit'],
    purge: ['olderThanMs', 'batchSize', 'includeDead'],
    purgeInbox: ['olderThanMs', 'batchSize'],
    listDead: ['topic', 'limit'],
    stats: ['includeTerminal'],
  };
  const issues: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new OutboxError('OUTBOX_CONFIG', 'Expected admin options object', {
      details: { issues: ['Expected admin options object'] },
    });
  const options = input as Record<string, unknown>;
  for (const key of Object.keys(options)) if (!allowed[operation].includes(key)) issues.push('Unknown option: ' + key);
  const ids = options['ids'];
  if (
    operation === 'retryDead' &&
    ids !== undefined &&
    (!Array.isArray(ids) || ids.length < 1 || ids.length > 1000 || !Array.from(ids).every(isUuid))
  )
    throw new OutboxError('OUTBOX_INVALID_MESSAGE', 'ids must contain 1..1000 UUIDs', {
      details: { field: 'ids', reason: 'Expected 1..1000 UUIDs' },
    });
  const result = { ...options };
  for (const [key, min, max, fallback] of [
    ['limit', 1, operation === 'retryDead' ? 10000 : 1000, operation === 'retryDead' ? 1000 : 100],
    ['olderThanMs', 0, Number.MAX_SAFE_INTEGER, undefined],
    ['batchSize', 1, 50000, 5000],
  ] as const) {
    if (!allowed[operation].includes(key)) continue;
    const value = options[key] === undefined ? fallback : options[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
      issues.push(key + ' must be an integer in ' + String(min) + '..' + String(max));
    result[key] = value;
  }
  for (const key of ['includeDead', 'includeTerminal']) {
    if (!allowed[operation].includes(key)) continue;
    if (options[key] !== undefined && typeof options[key] !== 'boolean') issues.push(key + ' must be boolean');
    result[key] = options[key] ?? false;
  }
  const topic = options['topic'];
  if (
    allowed[operation].includes('topic') &&
    topic !== undefined &&
    (typeof topic !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(topic) || topic.endsWith('\n'))
  )
    issues.push('Invalid topic');
  const key = options['key'];
  if (
    operation === 'retryDead' &&
    key !== undefined &&
    (typeof key !== 'string' || Array.from(key).length < 1 || Array.from(key).length > 200)
  )
    issues.push('key must contain 1..200 characters');
  if (issues.length > 0) throw new OutboxError('OUTBOX_CONFIG', issues.join('; '), { details: { issues } });
  return result;
}
