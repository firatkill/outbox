import { describe, expect, it } from 'vitest';
import { checkChangeset, checkFile } from '../../scripts/check-guards.js';

const fixtures = [
  { rule: 'G-1', tc: 'TC-012', path: 'package.json', good: '{"dependencies":{}}', bad: '{"dependencies":{"pg":"8"}}' },
  {
    rule: 'G-2',
    tc: 'TC-013',
    path: 'src/core/relay/loop.ts',
    good: 'adapter.query(sql, []);',
    bad: 'adapter.transaction(fn);',
  },
  { rule: 'G-3', tc: 'TC-014', path: 'src/core/clock.ts', good: 'performance.now();', bad: 'Date.now(); new Date();' },
  {
    rule: 'G-4',
    tc: 'TC-015',
    path: 'src/adapters/pg.ts',
    good: "import type { Outbox } from '../core/types.js';",
    bad: "import pg from 'pg';",
  },
  { rule: 'G-5', tc: 'TC-016', path: 'src/core/sql/claim.ts', good: 'select {{messages}}', bad: 'select ${table}' },
  { rule: 'G-6', tc: 'TC-017', path: 'src/core/outbox.ts', good: 'emit(error);', bad: 'console.error(error);' },
  {
    rule: 'G-7',
    tc: 'TC-018',
    path: 'src/publishers/webhook.ts',
    good: "import { OutboxError } from '../core/errors.js';",
    bad: "import { outbox } from '../core/outbox.js';",
  },
  {
    rule: 'G-8',
    tc: 'TC-019',
    path: 'tests/unit/example.test.ts',
    good: 'it("case", fn);',
    bad: 'it.' + 'only("case", fn);',
  },
];

describe.each(fixtures)('$rule', ({ rule, tc, path, good, bad }) => {
  it(`UT-16 ${tc} accepts the specified valid fixture`, () => {
    expect(checkFile(path, good)).toEqual([]);
  });
  it(`UT-16 ${tc} reports the rule, file and line for a violation`, () => {
    const source = path === 'package.json' ? bad : `\n${bad}`;
    expect(checkFile(path, source)).toContainEqual(
      expect.objectContaining({ rule, file: path, line: path === 'package.json' ? 1 : 2 }),
    );
  });
});

it('UT-16 TC-014 enforces the exact clock allowlist', () => {
  expect(checkFile('src/core/uuid.ts', 'Date.now()')).toEqual([]);
  expect(checkFile('src/core/row.ts', 'new Date(1)')).toEqual([]);
  expect(checkFile('src/core/uuid.ts', 'new Date()')[0]?.rule).toBe('G-3');
  expect(checkFile('src/core/row.ts', 'Date.now()')[0]?.rule).toBe('G-3');
  expect(checkFile('src/adapters/pg.ts', 'new Date()')[0]?.rule).toBe('G-3');
});

it('UT-16 TC-015 handles multiline, type-only and dynamic driver imports', () => {
  expect(checkFile('src/pg.ts', "import type {\n Pool\n} from 'pg';")[0]?.rule).toBe('G-4');
  expect(checkFile('src/cli.ts', "await import('pg'); await import('postgres');")).toEqual([]);
  expect(checkFile('src/pg.ts', "await import('postgres');")[0]?.rule).toBe('G-4');
});

it('UT-16 TC-016 checks numbered migrations as well as SQL files', () => {
  expect(checkFile('src/core/migrations/0001_initial.ts', '${schema}')[0]?.rule).toBe('G-5');
});

it('UT-16 TC-017 allows only the two specified console locations', () => {
  expect(checkFile('src/core/emitter.ts', 'console.error(error);')).toEqual([]);
  expect(checkFile('src/cli.ts', 'console.log(version);')).toEqual([]);
});

it('UT-16 TC-018 checks type imports and permits all four publisher dependencies', () => {
  for (const name of ['../core/errors.js', '../core/json.js', '../core/types.js', 'node:crypto']) {
    expect(checkFile('src/publishers/test.ts', `import type { T } from '${name}';`)).toEqual([]);
  }
  expect(checkFile('src/publishers/test.ts', "import type { T } from '../adapters/pg.js';")[0]?.rule).toBe('G-7');
});

it('UT-16 TC-020 enforces changesets only for unexempted source-changing PRs', () => {
  const base = { changedFiles: ['src/index.ts'], addedFiles: [] as string[], labels: '', isPullRequest: true };
  expect(checkChangeset(base)).toHaveLength(1);
  expect(checkChangeset({ ...base, addedFiles: ['.changeset/new-feature.md'] })).toEqual([]);
  expect(checkChangeset({ ...base, changedFiles: ['docs/PRD.md'] })).toEqual([]);
  expect(checkChangeset({ ...base, labels: 'docs,no-changeset' })).toEqual([]);
  expect(checkChangeset({ ...base, isPullRequest: false })).toEqual([]);
  expect(checkChangeset({ ...base, addedFiles: ['.changeset/README.md', '.changeset/config.json'] })).toHaveLength(1);
  expect(checkChangeset({ ...base, changedFiles: ['src/index.ts', '.changeset/existing.md'] })).toHaveLength(1);
});
