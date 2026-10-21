import { describe, expect, it } from 'vitest';
import { isUuid, parseAdminOptions } from '../../src/core/admin-options.js';

describe('admin validation', () => {
  it('UT-20 TC-114 applies defaults and all count boundaries', () => {
    expect(parseAdminOptions('retryDead')).toEqual({ limit: 1000 });
    expect(parseAdminOptions('listDead')).toEqual({ limit: 100 });
    expect(parseAdminOptions('purge', { olderThanMs: 0 })).toEqual({
      olderThanMs: 0,
      batchSize: 5000,
      includeDead: false,
    });
    expect(parseAdminOptions('stats')).toEqual({ includeTerminal: false });
    for (const [op, key, max] of [
      ['retryDead', 'limit', 10000],
      ['listDead', 'limit', 1000],
      ['purge', 'batchSize', 50000],
    ] as const) {
      for (const value of [1, max])
        expect(() =>
          parseAdminOptions(op, { ...(op === 'purge' ? { olderThanMs: 0 } : {}), [key]: value }),
        ).not.toThrow();
      for (const value of [0, max + 1, 1.5, NaN, Infinity, null, '1'])
        expect(() => parseAdminOptions(op, { ...(op === 'purge' ? { olderThanMs: 0 } : {}), [key]: value })).toThrow(
          expect.objectContaining({ code: 'OUTBOX_CONFIG' }),
        );
    }
    for (const value of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null])
      expect(() => parseAdminOptions('purgeInbox', { olderThanMs: value })).toThrow();
    expect(() => parseAdminOptions('purgeInbox', { olderThanMs: Number.MAX_SAFE_INTEGER })).not.toThrow();
  });
  it('UT-20 TC-114 validates strings, IDs, booleans and unknown options', () => {
    expect(isUuid('12345678-1234-1234-1234-123456789abc')).toBe(true);
    expect(isUuid('12345678-1234-1234-1234-123456789abc\n')).toBe(false);
    for (const ids of [[], ['bad'], Array(1001).fill('12345678-1234-1234-1234-123456789abc'), null])
      expect(() => parseAdminOptions('retryDead', { ids })).toThrow(
        expect.objectContaining({ code: 'OUTBOX_INVALID_MESSAGE' }),
      );
    for (const value of [null, [], false]) expect(() => parseAdminOptions('stats', value)).toThrow();
    for (const value of ['', 'a\n', 'a'.repeat(201), null])
      expect(() => parseAdminOptions('listDead', { topic: value })).toThrow();
    for (const value of ['', 'a'.repeat(201), null])
      expect(() => parseAdminOptions('retryDead', { key: value })).toThrow();
    expect(() => parseAdminOptions('retryDead', { topic: 'a/b:c.d-e_f', key: 'ğ'.repeat(200) })).not.toThrow();
    expect(() => parseAdminOptions('stats', { includeTerminal: 1, typo: true })).toThrow(
      expect.objectContaining({ details: { issues: ['Unknown option: typo', 'includeTerminal must be boolean'] } }),
    );
    expect(() => parseAdminOptions('purge', { olderThanMs: 0, includeDead: 'true' })).toThrow();
  });
});
