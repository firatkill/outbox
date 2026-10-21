import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { migrationSql } from '../../src/core/migrations/sql.js';
import { createTestSchema, TEST_DATABASE_URL } from '../helpers/db.js';

const owned: Awaited<ReturnType<typeof createTestSchema>>[] = [];
async function schema() {
  const value = await createTestSchema();
  owned.push(value);
  return value;
}
function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (data: string) => {
      stdout += data;
    });
    child.stderr.setEncoding('utf8').on('data', (data: string) => {
      stderr += data;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
const cli = (args: string[], env?: NodeJS.ProcessEnv) => run(process.execPath, ['dist/cli.js', ...args], env);
beforeAll(async () => {
  const source = await stat('src/cli.ts');
  const built = await stat('dist/cli.js').catch(() => undefined);
  if (built === undefined || built.mtimeMs < source.mtimeMs) {
    const result = await run('pnpm', ['build']);
    if (result.code !== 0) throw new Error(result.stdout + result.stderr);
  }
});
afterAll(async () => {
  for (const value of owned) await value.drop();
});

it.each(['postgres-js', 'pg'])('INT-90 TC-040 %s migrates and reports pending/applied status', async (driver) => {
  const owned = await schema();
  const base = ['migrate', '--url', TEST_DATABASE_URL, '--schema', owned.schema, '--driver', driver];
  const pending = await cli([...base, '--status', '--check']);
  expect(pending.code).toBe(3);
  expect(pending.stdout).toContain('pending  1 initial');
  const applied = await cli(base);
  expect(applied.code, applied.stderr).toBe(0);
  const status = await cli([...base, '--status', '--check']);
  expect(status.code, status.stderr).toBe(0);
  expect(status.stdout).toMatch(
    new RegExp(`^schema "${owned.schema}", prefix "outbox_"\napplied  1 initial   \\d{4}-.*Z\npending  \\(none\\)\n$`),
  );
});
it('INT-90 TC-040 dry-run creates no tables', async () => {
  const owned = await schema();
  const result = await cli(['migrate', '--url', TEST_DATABASE_URL, '--schema', owned.schema, '--dry-run']);
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain('create table');
  const tables = await owned.admin<
    { count: number }[]
  >`select count(*)::int4 as count from information_schema.tables where table_schema = ${owned.schema}`;
  expect(tables).toEqual([{ count: 0 }]);
});
it('INT-90 TC-039 print requires no URL and matches exported SQL', async () => {
  const env = { ...process.env };
  delete env['DATABASE_URL'];
  const result = await cli(['migrate', '--print'], env);
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toBe(migrationSql());
  const delta = await cli(['migrate', '--print', '--from', '1'], env);
  expect(delta.code).toBe(0);
  expect(delta.stdout).toBe(migrationSql({ fromVersion: 1 }));
});
it('INT-91 TC-037 TC-038 reports usage errors and redacts connection errors', async () => {
  const env = { ...process.env };
  delete env['DATABASE_URL'];
  for (const args of [['unknown'], ['migrate'], ['migrate', '--unknown']]) expect((await cli(args, env)).code).toBe(2);
  const failure = await cli(
    ['migrate', '--url', 'postgres://fixture:fixture-secret@127.0.0.1:1/unavailable', '--driver', 'pg'],
    env,
  );
  expect(failure.code).toBe(1);
  expect(failure.stderr).not.toContain('fixture-secret');
});
