import { mapMessageRow } from '../../src/core/row.js';
import { readFileSync } from 'node:fs';
import { BOOTSTRAP } from '../../src/core/migrations/bootstrap.js';
import { MIGRATIONS } from '../../src/core/migrations/index.js';
import { expect, it } from 'vitest';
import { parseOutboxConfig } from '../../src/core/config.js';
import { quoteIdent } from '../../src/core/identifiers.js';
import { render } from '../../src/core/sql/render.js';

const template = '{{schema}} {{messages}} {{inbox}} {{migrations}} {{test_clock}} {{now}} "{{p}}messages_claim_idx"';

it('UT-04 TC-028 snapshots all default tokens', () => {
  expect(render(template, parseOutboxConfig({ db: {} }))).toMatchInlineSnapshot(
    `"\"public\" \"public\".\"outbox_messages\" \"public\".\"outbox_inbox\" \"public\".\"outbox_schema_migrations\" \"public\".\"outbox_test_clock\" \"public\".\"outbox_now\"() \"outbox_messages_claim_idx\""`,
  );
});
it('UT-04 TC-028 snapshots custom names without leftover tokens', () => {
  const sql = render(template, parseOutboxConfig({ db: {}, schema: 'app_events', tablePrefix: 'ob_' }));
  expect(sql).toMatchInlineSnapshot(
    `"\"app_events\" \"app_events\".\"ob_messages\" \"app_events\".\"ob_inbox\" \"app_events\".\"ob_schema_migrations\" \"app_events\".\"ob_test_clock\" \"app_events\".\"ob_now\"() \"ob_messages_claim_idx\""`,
  );
  expect(sql).not.toContain('{{');
});
it('UT-04 TC-028 escapes quotes and rejects unresolved tokens', () => {
  expect(quoteIdent('a"b')).toBe('"a""b"');
  for (const sql of ['{{unknown}}', '{{messages', '{{}}'])
    expect(() => render(sql, parseOutboxConfig({ db: {} }))).toThrow(
      expect.objectContaining({ code: 'OUTBOX_INTERNAL' }),
    );
});

// Expected SQL fixtures are copied from TRD 7.2/7.3, not generated from implementation.
it('UT-04 TC-028 renders the normative migration and bootstrap snapshots', () => {
  const migration = MIGRATIONS[0];
  if (migration === undefined) throw new Error('Initial migration missing');
  for (const [variant, schema, tablePrefix] of [
    ['default', 'public', 'outbox_'],
    ['custom', 'app_events', 'ob_'],
  ] as const) {
    const config = parseOutboxConfig({ db: {}, schema, tablePrefix });
    for (const [name, template] of [
      ['bootstrap', BOOTSTRAP],
      ['initial', migration.template],
    ] as const) {
      expect(render(template, config)).toBe(
        readFileSync(new URL(`../fixtures/${name}-${variant}.sql`, import.meta.url), 'utf8'),
      );
    }
  }
});

const messageRow = {
  id: '019a39b9-0000-7000-8000-000000000000',
  seq: '9007199254740993',
  topic: 'order.created',
  key: null,
  payload: '{"id":1}',
  headers: '{"traceparent":"trace"}',
  dedupe_key: null,
  status: 'pending',
  attempts: 0,
  max_attempts: 10,
  created_at_ms: 1700000000000,
  available_at_ms: 1700000001000,
  last_error: null,
};
it('UT-04 TC-046 maps every driver-neutral column without losing sequence precision', () => {
  expect(mapMessageRow(messageRow)).toEqual({
    id: messageRow.id,
    seq: '9007199254740993',
    topic: 'order.created',
    key: null,
    payload: { id: 1 },
    headers: { traceparent: 'trace' },
    dedupeKey: null,
    status: 'pending',
    attempts: 0,
    maxAttempts: 10,
    createdAt: new Date(1700000000000),
    availableAt: new Date(1700000001000),
    lastError: null,
  });
  expect(mapMessageRow({ ...messageRow, key: 'key', dedupe_key: 'dedupe', last_error: 'error' })).toMatchObject({
    key: 'key',
    dedupeKey: 'dedupe',
    lastError: 'error',
  });
});
it.each(Object.keys(messageRow))('UT-04 TC-046 names wrong-type column %s', (column) => {
  expect(() => mapMessageRow({ ...messageRow, [column]: {} })).toThrow(column);
  expect(() => mapMessageRow({ ...messageRow, [column]: {} })).toThrow(
    expect.objectContaining({ code: 'OUTBOX_INTERNAL' }),
  );
});
it.each(['headers', 'payload'])('UT-04 TC-046 names malformed JSON column %s', (column) => {
  expect(() => mapMessageRow({ ...messageRow, [column]: '{invalid' })).toThrow(column);
});
