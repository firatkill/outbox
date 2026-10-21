import { hostname } from 'node:os';
import { describe, expect, it } from 'vitest';
import { isOutboxError } from '../../src/core/errors.js';
import { parseRelayOptions } from '../../src/core/relay/options.js';

const publisher = () => Promise.resolve(undefined);
function issues(input: unknown): readonly string[] {
  try {
    parseRelayOptions(input);
  } catch (error) {
    if (!isOutboxError(error, 'OUTBOX_CONFIG')) throw error;
    const list = error.details['issues'];
    expect(Array.isArray(list)).toBe(true);
    expect(error.message).toBe((list as string[]).join('; '));
    return list as string[];
  }
  throw new Error('Expected OUTBOX_CONFIG');
}
// Bounds and cross-field companion values come from TRD 5.4, not the parser.
const ranges: [string, number, number, Record<string, unknown>][] = [
  ['batchSize', 1, 1000, { concurrency: 1000 }],
  ['concurrency', 1, 1000, { batchSize: 1 }],
  ['leaseMs', 1100, 86400000, { handlerTimeoutMs: 100 }],
  ['handlerTimeoutMs', 100, 3600000, { leaseMs: 86400000 }],
  ['retry.baseDelayMs', 0, 3600000, { retry: { maxDelayMs: 86400000 } }],
  ['retry.factor', 1, 10, {}],
  ['retry.maxDelayMs', 0, 86400000, { retry: { baseDelayMs: 0 } }],
  ['poll.minIntervalMs', 10, 60000, { poll: { maxIntervalMs: 300000 } }],
  ['poll.maxIntervalMs', 10, 300000, { poll: { minIntervalMs: 10 } }],
  ['reclaimIntervalMs', 500, 3600000, {}],
  ['reclaimBatchSize', 1, 10000, {}],
  ['drainTimeoutMs', 0, 3600000, {}],
];
function inputAt(path: string, value: unknown, companion: Record<string, unknown> = {}) {
  const [key = '', field] = path.split('.');
  return {
    publisher,
    ...companion,
    [key]: field === undefined ? value : { ...(companion[key] as object | undefined), [field]: value },
  };
}

describe('UT-02 relay options — TC-070/TC-071; PRD FR-30/34/35/40, D-67', () => {
  it('UT-02 resolves every default exactly', () => {
    const { relayId, ...result } = parseRelayOptions({ publisher });
    expect(relayId).toMatch(
      new RegExp(`^${hostname().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:${String(process.pid)}:[a-f0-9]{8}$`),
    );
    expect(parseRelayOptions({ publisher }).relayId).not.toBe(relayId);
    expect(result).toEqual({
      publisher,
      batchSize: 10,
      concurrency: 10,
      leaseMs: 60000,
      handlerTimeoutMs: 30000,
      ordering: 'none',
      retry: { baseDelayMs: 1000, factor: 2, maxDelayMs: 300000, jitter: 'full' },
      poll: { minIntervalMs: 100, maxIntervalMs: 2000 },
      listen: true,
      reclaimIntervalMs: 10000,
      reclaimBatchSize: 1000,
      drainTimeoutMs: 30000,
    });
  });
  it.each(ranges)('UT-02 validates %s endpoints and outside values', (path, min, max, companion) => {
    for (const value of [min, max]) expect(() => parseRelayOptions(inputAt(path, value, companion))).not.toThrow();
    for (const value of [min - 1, max + 1, NaN, Infinity, -Infinity, '10', null, false])
      expect(issues(inputAt(path, value, companion)).some((issue) => issue.includes(path))).toBe(true);
    if (path !== 'retry.factor')
      expect(issues(inputAt(path, min + 0.5, companion)).some((issue) => issue.includes(path))).toBe(true);
  });
  it('UT-02 applies lease range and the stronger timeout margin together', () => {
    for (const leaseMs of [999, 1000, 1099])
      expect(issues({ publisher, leaseMs, handlerTimeoutMs: 100 }).join(';')).toContain('leaseMs');
    expect(() => parseRelayOptions({ publisher, leaseMs: 1100, handlerTimeoutMs: 100 })).not.toThrow();
    expect(
      issues({
        publisher,
        batchSize: 11,
        concurrency: 10,
        leaseMs: 30999,
        handlerTimeoutMs: 30000,
        retry: { baseDelayMs: 1001, maxDelayMs: 1000 },
        poll: { minIntervalMs: 101, maxIntervalMs: 100 },
      }),
    ).toHaveLength(4);
    expect(parseRelayOptions({ publisher, retry: { factor: 1.25 } }).retry.factor).toBe(1.25);
  });
  it('UT-02 validates the target mode and topic filters', () => {
    for (const input of [
      {},
      { publisher, handlers: { a: publisher } },
      { handlers: {} },
      { handlers: [] },
      { handlers: { a: 1 } },
      { handlers: { 'bad topic': publisher } },
      { publisher: 1 },
      { handlers: { a: publisher }, topics: ['a'] },
      { publisher, topics: [] },
      { publisher, topics: ['bad topic'] },
      { publisher, topics: [''] },
      { publisher, topics: Array<string>(1001).fill('a') },
      { publisher, topics: 'a' },
    ])
      expect(() => parseRelayOptions(input)).toThrow();
    expect(parseRelayOptions({ handlers: { 'orders.created': publisher } }).handlers).toEqual({
      'orders.created': publisher,
    });
    expect(parseRelayOptions({ publisher, topics: ['a'] })).toMatchObject({ topics: ['a'] });
    expect(() => parseRelayOptions({ publisher, topics: Array<string>(1000).fill('a'.repeat(200)) })).not.toThrow();
    expect(issues({ publisher, topics: ['a'.repeat(201)] }).join(';')).toContain('topics');
  });
  it('UT-02 validates names and enums while retaining supported options', () => {
    const db = {};
    const signal = new AbortController().signal;
    const tracer = {
      startSpan: () => ({ setAttribute: () => undefined, recordException: () => undefined, end: () => undefined }),
    };
    const result = parseRelayOptions({
      publisher,
      relayId: 'r',
      db,
      signal,
      tracer,
      listen: { db },
      ordering: 'key',
      retry: { jitter: 'none' },
    });
    expect(result).toMatchObject({
      relayId: 'r',
      db,
      signal,
      tracer,
      listen: { db },
      ordering: 'key',
      retry: { jitter: 'none' },
    });
    for (const relayId of ['r', 'r'.repeat(200)])
      expect(parseRelayOptions({ publisher, relayId }).relayId).toBe(relayId);
    for (const relayId of ['', 'r'.repeat(201), null, 1])
      expect(issues({ publisher, relayId }).join(';')).toContain('relayId');
    expect(parseRelayOptions({ publisher, listen: false }).listen).toBe(false);
    for (const bad of [
      { ordering: 'ordered' },
      { retry: { jitter: 'equal' } },
      { listen: {} },
      { listen: null },
      { listen: { db: null } },
      { signal: {} },
      { tracer: {} },
      { tracer: null },
      { db: null },
    ])
      expect(() => parseRelayOptions({ publisher, ...bad })).toThrow();
  });
  it('UT-02 rejects unknown options at each configuration level and reports all issues', () => {
    const result = issues({
      publisher,
      maxRetries: 3,
      attempts: 3,
      backoff: {},
      retry: { factor: 11, typo: 1 },
      poll: { typo: 1 },
      listen: { db: {}, typo: 1 },
      batchSize: 0,
      concurrency: 0,
    });
    for (const name of [
      'maxRetries',
      'attempts',
      'backoff',
      'retry.typo',
      'poll.typo',
      'listen.typo',
      'batchSize',
      'concurrency',
      'retry.factor',
    ])
      expect(result.some((issue) => issue.includes(name))).toBe(true);
    expect(result).toHaveLength(9);
    for (const value of [null, undefined, [], 1, 'x']) expect(issues(value)).toContain('options must be an object');
    for (const value of [null, [], 1]) {
      expect(issues({ publisher, retry: value })).toContain('retry must be an object');
      expect(issues({ publisher, poll: value })).toContain('poll must be an object');
    }
  });
});
