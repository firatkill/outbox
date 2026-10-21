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
