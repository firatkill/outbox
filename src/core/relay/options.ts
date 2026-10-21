import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { OutboxError } from '../errors.js';
import type { RelayCommonOptions, RelayOptions } from '../types.js';

type ResolvedCommon = Required<Omit<RelayCommonOptions, 'db' | 'signal' | 'tracer' | 'retry' | 'poll'>> &
  Pick<RelayCommonOptions, 'db' | 'signal' | 'tracer'> & {
    retry: Required<NonNullable<RelayCommonOptions['retry']>>;
    poll: Required<NonNullable<RelayCommonOptions['poll']>>;
  };
export type ResolvedRelayOptions = ResolvedCommon & RelayOptions;

const KEYS = new Set([
  'db',
  'relayId',
  'batchSize',
  'concurrency',
  'leaseMs',
  'handlerTimeoutMs',
  'ordering',
  'retry',
  'poll',
  'listen',
  'reclaimIntervalMs',
  'reclaimBatchSize',
  'drainTimeoutMs',
  'signal',
  'tracer',
  'handlers',
  'publisher',
  'topics',
]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const topicValid = (value: unknown): boolean =>
  typeof value === 'string' && value.length <= 200 && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(value);

/** Resolve the relay option table in TRD 5.4 and aggregate every issue.
 * @example
 * parseRelayOptions({ publisher: async () => {} });
 */
export function parseRelayOptions(input: unknown): ResolvedRelayOptions {
  const issues: string[] = [];
  const object = (value: unknown, name: string): Record<string, unknown> => {
    if (isRecord(value)) return value;
    issues.push(`${name} must be an object`);
    return {};
  };
  const unknownKeys = (value: Record<string, unknown>, keys: ReadonlySet<string>, prefix = '') => {
    for (const key of Object.keys(value)) if (!keys.has(key)) issues.push(`Unknown option: ${prefix}${key}`);
  };
  const source = object(input, 'options');
  unknownKeys(source, KEYS);
  const retry = source['retry'] === undefined ? {} : object(source['retry'], 'retry');
  const poll = source['poll'] === undefined ? {} : object(source['poll'], 'poll');
  unknownKeys(retry, new Set(['baseDelayMs', 'factor', 'maxDelayMs', 'jitter']), 'retry.');
  unknownKeys(poll, new Set(['minIntervalMs', 'maxIntervalMs']), 'poll.');
  const number = (
    from: Record<string, unknown>,
    key: string,
    fallback: number,
    min: number,
    max: number,
    prefix = '',
    integer = true,
  ): number => {
    const value = from[key] === undefined ? fallback : from[key];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (integer && !Number.isInteger(value)) ||
      value < min ||
      value > max
    ) {
      issues.push(
        `${prefix}${key} must be a finite ${integer ? 'integer' : 'number'} in ${String(min)}..${String(max)}`,
      );
      return fallback;
    }
    return value;
  };
  const choice = <T extends string>(value: unknown, fallback: T, allowed: readonly T[], name: string): T => {
    if (value === undefined) return fallback;
    if (typeof value === 'string' && allowed.includes(value as T)) return value as T;
    issues.push(`${name} must be ${allowed.join(' or ')}`);
    return fallback;
  };
  const batchSize = number(source, 'batchSize', 10, 1, 1000);
  const concurrency = number(source, 'concurrency', 10, 1, 1000);
  const leaseMs = number(source, 'leaseMs', 60000, 1000, 86400000);
  const handlerTimeoutMs = number(source, 'handlerTimeoutMs', 30000, 100, 3600000);
  const baseDelayMs = number(retry, 'baseDelayMs', 1000, 0, 3600000, 'retry.');
  const factor = number(retry, 'factor', 2, 1, 10, 'retry.', false);
  const maxDelayMs = number(retry, 'maxDelayMs', 300000, 0, 86400000, 'retry.');
  const minIntervalMs = number(poll, 'minIntervalMs', 100, 10, 60000, 'poll.');
  const maxIntervalMs = number(poll, 'maxIntervalMs', 2000, 10, 300000, 'poll.');
  const reclaimIntervalMs = number(source, 'reclaimIntervalMs', 10000, 500, 3600000);
  const reclaimBatchSize = number(source, 'reclaimBatchSize', 1000, 1, 10000);
  const drainTimeoutMs = number(source, 'drainTimeoutMs', 30000, 0, 3600000);
  const ordering = choice(source['ordering'], 'none', ['none', 'key'], 'ordering');
  const jitter = choice(retry['jitter'], 'full', ['full', 'none'], 'retry.jitter');
  if (batchSize > concurrency) issues.push('batchSize must be <= concurrency');
  if (leaseMs < handlerTimeoutMs + 1000) issues.push('leaseMs must be >= handlerTimeoutMs + 1000');
  if (maxDelayMs < baseDelayMs) issues.push('retry.maxDelayMs must be >= retry.baseDelayMs');
  if (maxIntervalMs < minIntervalMs) issues.push('poll.maxIntervalMs must be >= poll.minIntervalMs');
  const relayId =
    source['relayId'] === undefined
      ? `${hostname()}:${String(process.pid)}:${randomBytes(4).toString('hex')}`
      : source['relayId'];
  if (typeof relayId !== 'string' || Array.from(relayId).length < 1 || Array.from(relayId).length > 200)
    issues.push('relayId must contain 1..200 characters');
  const handlers = source['handlers'];
  const publisher = source['publisher'];
  if ((handlers !== undefined) === (publisher !== undefined))
    issues.push('exactly one of handlers or publisher is required');
  if (handlers !== undefined) {
    const entries = Object.entries(object(handlers, 'handlers'));
    if (entries.length === 0) issues.push('handlers must not be empty');
    for (const [topic, handler] of entries) {
      if (!topicValid(topic)) issues.push(`handlers topic ${topic} must be a valid topic name`);
      if (typeof handler !== 'function') issues.push(`handlers.${topic} must be a function`);
    }
    if (source['topics'] !== undefined) issues.push('topics is allowed only in publisher mode');
  }
  if (publisher !== undefined && typeof publisher !== 'function') issues.push('publisher must be a function');
  const topics = source['topics'];
  if (
    topics !== undefined &&
    (!Array.isArray(topics) || topics.length < 1 || topics.length > 1000 || !Array.from(topics).every(topicValid))
  )
    issues.push('topics must contain 1..1000 valid topic names');
  const listen = source['listen'] === undefined ? true : source['listen'];
  if (typeof listen !== 'boolean') {
    const config = object(listen, 'listen');
    unknownKeys(config, new Set(['db']), 'listen.');
    if (config['db'] === undefined || config['db'] === null) issues.push('listen.db is required');
  }
  if (source['db'] === null) issues.push('db must be a driver handle');
  if (source['signal'] !== undefined && !(source['signal'] instanceof AbortSignal))
    issues.push('signal must be an AbortSignal');
  if (
    source['tracer'] !== undefined &&
    (!isRecord(source['tracer']) || typeof source['tracer']['startSpan'] !== 'function')
  )
    issues.push('tracer.startSpan must be a function');
  if (issues.length > 0) throw new OutboxError('OUTBOX_CONFIG', issues.join('; '), { details: { issues } });
  // All values are validated before this aggregate narrowing.
  return {
    ...source,
    relayId,
    batchSize,
    concurrency,
    leaseMs,
    handlerTimeoutMs,
    ordering,
    retry: { baseDelayMs, factor, maxDelayMs, jitter },
    poll: { minIntervalMs, maxIntervalMs },
    listen,
    reclaimIntervalMs,
    reclaimBatchSize,
    drainTimeoutMs,
  } as ResolvedRelayOptions;
}
