#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createPostgresJsAdapter } from './adapters/postgres-js.js';
import { CLI_HELP, CLI_OPTIONS, redactPassword, resolveCliArgs } from './core/cli-args.js';
import type { CliArgs } from './core/cli-args.js';
import { parseOutboxConfig } from './core/config.js';
import { MIGRATIONS, migrationSql } from './core/migrations/index.js';
import { migrate } from './core/migrations/runner.js';
import { render } from './core/sql/render.js';
import type { DriverAdapter, SqlExecutor } from './core/types.js';

async function execute<TDb, TTx>(args: CliArgs, adapter: DriverAdapter<TDb, TTx>): Promise<number> {
  const config = parseOutboxConfig({ db: adapter.db, schema: args.schema, tablePrefix: args.tablePrefix });
  if (args.status) {
    const present = await adapter.query('select to_regclass($1::text) is not null as present', [
      config.schema + '.' + config.tablePrefix + 'schema_migrations',
    ]);
    const applied =
      present[0]?.['present'] === true
        ? await adapter.query(
            render(
              'select version::int4 as version, name::text as name, (extract(epoch from applied_at) * 1000)::float8 as applied_at_ms from {{migrations}} order by version',
              config,
            ),
            [],
          )
        : [];
    console.log(`schema "${config.schema}", prefix "${config.tablePrefix}"`);
    for (const row of applied) {
      if (typeof row['applied_at_ms'] !== 'number') throw new Error('Invalid migration timestamp');
      console.log(
        `applied  ${String(row['version'])} ${String(row['name'])}   ${new Date(row['applied_at_ms']).toISOString()}`,
      );
    }
    const latest = Math.max(0, ...applied.map((row) => Number(row['version'])));
    const pending = MIGRATIONS.filter((migration) => migration.version > latest);
    if (pending.length === 0) console.log('pending  (none)');
    for (const migration of pending) console.log(`pending  ${String(migration.version)} ${migration.name}`);
    return args.check && pending.length > 0 ? 3 : 0;
  }
  const result = await migrate(adapter, config, { dryRun: args.dryRun });
  if (args.dryRun) process.stdout.write(result.sql);
  else for (const migration of result.applied) console.log(`applied  ${String(migration.version)} ${migration.name}`);
  return 0;
}

// Driver loading stays confined to the CLI.
async function postgresJs(args: CliArgs): Promise<number> {
  const { default: postgres } = await import('postgres');
  const db = postgres(args.url ?? '', { max: 1, onnotice: () => undefined });
  try {
    return await execute(args, createPostgresJsAdapter(db));
  } finally {
    await db.end();
  }
}

async function nodePostgres(args: CliArgs): Promise<number> {
  const { default: pg } = await import('pg');
  const db = new pg.Pool({ connectionString: args.url, max: 1 });
  interface Tx {
    query: typeof db.query;
    release(destroy?: boolean | Error): void;
  }
  const wrap = (client: Pick<Tx, 'query'>): SqlExecutor => ({
    query: async (text, params) => {
      const result = await client.query<Record<string, unknown>>(text, [...params]);
      return result.rows;
    },
  });
  const bind = (pool: typeof db): DriverAdapter<typeof db, Tx> => ({
    name: 'pg',
    db: pool,
    query: (text, params) => wrap(pool).query(text, params),
    forTransaction: wrap,
    transaction: async (fn) => {
      const client = await pool.connect();
      let destroy = false;
      try {
        await client.query('begin');
        const result = await fn(wrap(client));
        await client.query('commit');
        return result;
      } catch (error) {
        try {
          await client.query('rollback');
        } catch {
          destroy = true;
        }
        throw error;
      } finally {
        client.release(destroy);
      }
    },
    withDb: bind,
  });
  try {
    return await execute(args, bind(db));
  } finally {
    await db.end();
  }
}

async function main(): Promise<number> {
  let args: CliArgs;
  try {
    const parsed = parseArgs({ options: CLI_OPTIONS, allowPositionals: true, strict: true });
    args = resolveCliArgs(parsed.values, parsed.positionals, process.env['DATABASE_URL']);
  } catch (error) {
    console.error(redactPassword(error instanceof Error ? error.message : String(error)));
    return 2;
  }
  if (args.command === 'help') {
    process.stdout.write(CLI_HELP);
    return 0;
  }
  if (args.command === 'version') {
    console.log(__OUTBOX_VERSION__);
    return 0;
  }
  if (args.command === 'stats') {
    console.error('stats is not implemented');
    return 2;
  }
  try {
    if (args.print) {
      process.stdout.write(
        migrationSql({ schema: args.schema, tablePrefix: args.tablePrefix, fromVersion: args.fromVersion }),
      );
      return 0;
    }
    let driver = args.driver;
    if (driver === undefined) {
      try {
        await import('postgres');
        driver = 'postgres-js';
      } catch {
        try {
          await import('pg');
          driver = 'pg';
        } catch {
          console.error('Install a driver: npm i postgres  (or: npm i pg)');
          return 2;
        }
      }
    }
    try {
      return await (driver === 'postgres-js' ? postgresJs(args) : nodePostgres(args));
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND') {
        console.error('Install a driver: npm i postgres  (or: npm i pg)');
        return 2;
      }
      throw error;
    }
  } catch (error) {
    console.error(redactPassword(error instanceof Error ? error.message : String(error), args.url));
    return 1;
  }
}

process.exitCode = await main();
