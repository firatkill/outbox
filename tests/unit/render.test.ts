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
