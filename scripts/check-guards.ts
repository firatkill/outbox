import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export interface Diagnostic {
  rule: string;
  file: string;
  line: number;
  message: string;
}

/** Apply the normative static guards to a tracked file's contents. */
export function checkFile(file: string, content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const report = (rule: string, offset: number, message: string) => {
    diagnostics.push({ rule, file, line: content.slice(0, offset).split('\n').length, message });
  };
  const scan = (rule: string, pattern: RegExp, message: string) => {
    for (const match of content.matchAll(pattern)) report(rule, match.index, message);
  };
  if (file === 'package.json') {
    const pkg = JSON.parse(content) as { dependencies?: Record<string, unknown> };
    if (Object.keys(pkg.dependencies ?? {}).length > 0) report('G-1', 0, 'Runtime dependencies must be empty.');
  }
  if (file.startsWith('src/core/relay/')) scan('G-2', /\.transaction\s*\(/g, 'Relay statements must be autocommit.');
  if (file.startsWith('src/core/') || file.startsWith('src/adapters/')) {
    if (file !== 'src/core/uuid.ts') scan('G-3', /Date\.now\s*\(/g, 'Use database time.');
    if (file !== 'src/core/row.ts') scan('G-3', /new\s+Date\s*\(/g, 'Convert database timestamps only in row.ts.');
  }
  if (file.startsWith('src/core/sql/') || /^src\/core\/migrations\/0.*\.ts$/.test(file)) {
    scan('G-5', /\$\{/g, 'SQL identifiers use renderer tokens, not interpolation.');
  }
  if (file.startsWith('src/') && !['src/core/emitter.ts', 'src/cli.ts'].includes(file)) {
    scan('G-6', /console\./g, 'Console output is confined to the emitter and CLI.');
  }
  if (file.startsWith('tests/')) scan('G-8', /\.only\s*\(/g, 'Focused tests must not be committed.');
  if (!file.startsWith('src/') || !file.endsWith('.ts')) return diagnostics;

  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const isDriver = (name: string) => name === 'pg' || name === 'postgres';
  const publisherImports = new Set(['../core/errors.js', '../core/json.js', '../core/types.js', 'node:crypto']);
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const name = node.moduleSpecifier.text;
      if (isDriver(name)) report('G-4', node.getStart(source), 'Drivers must not be statically imported.');
      if (file.startsWith('src/publishers/') && !publisherImports.has(name)) {
        report('G-7', node.getStart(source), 'Publisher dependency is outside the allowed modules.');
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const target = node.arguments[0];
      if (target && ts.isStringLiteral(target) && isDriver(target.text) && file !== 'src/cli.ts') {
        report('G-4', node.getStart(source), 'Dynamic driver imports are allowed only in cli.ts.');
      }
      if (
        target &&
        ts.isStringLiteral(target) &&
        file.startsWith('src/publishers/') &&
        !publisherImports.has(target.text)
      ) {
        report('G-7', node.getStart(source), 'Publisher dependency is outside the allowed modules.');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return diagnostics;
}

export function checkChangeset(input: {
  changedFiles: readonly string[];
  addedFiles: readonly string[];
  labels: string;
  isPullRequest: boolean;
}): Diagnostic[] {
  if (!input.isPullRequest || input.labels.split(',').includes('no-changeset')) return [];
  const sourceChanged = input.changedFiles.some((file) => file.startsWith('src/'));
  const addedChangeset = input.addedFiles.some(
    (file) => /^\.changeset\/[^/]+\.md$/.test(file) && file !== '.changeset/README.md',
  );
  return sourceChanged && !addedChangeset
    ? [
        {
          rule: 'changeset',
          file: '.changeset',
          line: 1,
          message: 'Source changes need a new changeset or the no-changeset label.',
        },
      ]
    : [];
}

function gitFiles(args: string[]): string[] {
  return execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean);
}

function main(): void {
  const diagnostics = gitFiles(['ls-files', '-z'])
    .filter((file) => existsSync(file) && (/\.[cm]?[jt]sx?$/.test(file) || file === 'package.json'))
    .flatMap((file) => checkFile(file, readFileSync(file, 'utf8')));
  if (process.env['GITHUB_BASE_REF']) {
    diagnostics.push(
      ...checkChangeset({
        changedFiles: gitFiles(['diff', '--name-only', '-z', 'origin/main...HEAD']),
        addedFiles: gitFiles(['diff', '--name-only', '--diff-filter=A', '-z', 'origin/main...HEAD']),
        labels: process.env['PR_LABELS'] ?? '',
        isPullRequest: true,
      }),
    );
  }
  for (const d of diagnostics) console.error(`${d.rule} ${d.file}:${String(d.line)} ${d.message}`);
  if (diagnostics.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
