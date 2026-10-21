import { describe, expect, it } from 'vitest';
import { parseOutboxConfig } from '../../src/core/config.js';
import { isOutboxError } from '../../src/core/errors.js';

const db = {};

describe('outbox config', () => {
  it('UT-03 TC-025 resolves every default, qualified name and channel', () => {
    expect(parseOutboxConfig({ db })).toEqual({
      schema: 'public',
      tablePrefix: 'outbox_',
      maxAttempts: 10,
      notify: true,
      maxPayloadBytes: 1048576,
      names: {
        messages: '"public"."outbox_messages"',
        inbox: '"public"."outbox_inbox"',
        migrations: '"public"."outbox_schema_migrations"',
        testClock: '"public"."outbox_test_clock"',
        now: '"public"."outbox_now"()',
      },
      channel: 'public.outbox_messages',
    });
    expect(parseOutboxConfig({ db, schema: 'app_events', tablePrefix: 'ob_' })).toMatchObject({
      channel: 'app_events.ob_messages',
      names: { messages: '"app_events"."ob_messages"' },
    });
  });
  it('UT-03 TC-026 accepts identifier length limits and limits the channel to 59 bytes', () => {
    for (const schema of ['_', 'a', 'a'.repeat(30)])
      for (const tablePrefix of ['_', 'b', 'b'.repeat(20)]) {
        expect(parseOutboxConfig({ db, schema, tablePrefix })).toMatchObject({ schema, tablePrefix });
      }
    expect(parseOutboxConfig({ db, schema: 'a'.repeat(30), tablePrefix: 'b'.repeat(20) }).channel).toHaveLength(59);
  });
  it.each(['', 'Upper', 'a-b', 'a"b', '0abc', 'a b', 'ğ', 'a\n', null, 3])(
    'UT-03 TC-026 rejects invalid identifier %j',
    (value) => {
      for (const field of ['schema', 'tablePrefix']) {
        expect(() => parseOutboxConfig({ db, [field]: value })).toThrow(
          expect.objectContaining({ code: 'OUTBOX_CONFIG' }),
        );
      }
    },
  );
  it('UT-03 TC-026 rejects overlong identifiers', () => {
    expect(() => parseOutboxConfig({ db, schema: 'a'.repeat(31) })).toThrow('schema');
    expect(() => parseOutboxConfig({ db, tablePrefix: 'a'.repeat(21) })).toThrow('tablePrefix');
  });
  it('UT-03 TC-027 accepts numeric boundaries and false notify', () => {
    for (const maxAttempts of [1, 1000])
      for (const maxPayloadBytes of [1, 67108864]) {
        expect(parseOutboxConfig({ db, maxAttempts, maxPayloadBytes, notify: false })).toMatchObject({
          maxAttempts,
          maxPayloadBytes,
          notify: false,
        });
      }
  });
  it.each([
    ['maxAttempts', [0, 1001, 1.5, NaN, Infinity, '1', null]],
    ['maxPayloadBytes', [0, 67108865, 1.5, NaN, Infinity, '1', null]],
    ['notify', [0, 1, 'true', null]],
  ])('UT-03 TC-027 rejects invalid %s options', (field, values) => {
    for (const value of values) expect(() => parseOutboxConfig({ db, [field]: value })).toThrow(field);
  });
  it('UT-03 TC-027 collects all problems including missing db and unknown keys', () => {
    expect.assertions(3);
    try {
      parseOutboxConfig({ schema: 'BAD', tablePrefix: '', maxAttempts: 0, maxPayloadBytes: 0, notify: 0, typo: true });
    } catch (error) {
      expect(isOutboxError(error, 'OUTBOX_CONFIG')).toBe(true);
      if (!isOutboxError(error)) throw error;
      expect(error.details['issues']).toHaveLength(7);
      expect(error.message).toMatch(/typo.*db.*schema.*tablePrefix.*maxAttempts.*maxPayloadBytes.*notify/);
    }
  });
  it.each([null, undefined, [], 1, 'config'])('UT-03 TC-027 rejects non-object config %j', (input) => {
    expect(() => parseOutboxConfig(input)).toThrow(expect.objectContaining({ code: 'OUTBOX_CONFIG' }));
  });
});
