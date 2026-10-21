import { OutboxError } from '../errors.js';
import { render } from '../sql/render.js';
import type { DriverAdapter, MigrateResult, ResolvedOutboxConfig, SqlExecutor } from '../types.js';
import { BOOTSTRAP } from './bootstrap.js';
import { MIGRATIONS, migrationChecksum, REQUIRED_SCHEMA_VERSION } from './index.js';

const PRESENT = 'select to_regclass($1::text) is not null as present';
const VERSION = 'select coalesce(max(version), 0)::int4 as version from {{migrations}}';
const APPLIED =
  'select version::int4 as version, name::text as name, checksum::text as checksum from {{migrations}} order by version';
const LOCK = 'select pg_advisory_xact_lock(hashtextextended($1::text, 0))';
const EXISTS = 'select exists(select 1 from {{migrations}} where version = $1::int4) as present';
const INSERT = 'insert into {{migrations}} (version, name, checksum) values ($1::int4, $2::text, $3::text)';

async function versionTablePresent(executor: SqlExecutor, config: ResolvedOutboxConfig): Promise<boolean> {
  const rows = await executor.query(PRESENT, [config.schema + '.' + config.tablePrefix + 'schema_migrations']);
  return rows[0]?.['present'] === true;
}

async function readVersion(executor: SqlExecutor, config: ResolvedOutboxConfig): Promise<number> {
  if (!(await versionTablePresent(executor, config))) return 0;
  const rows = await executor.query(render(VERSION, config), []);
  const version = rows[0]?.['version'];
  if (typeof version !== 'number')
    throw new OutboxError('OUTBOX_INTERNAL', 'Invalid schema version column. Please report.');
  return version;
}

/** Check the schema before operations that depend on it.
 * @example
 * await schemaVersion(adapter, config);
 */
export async function schemaVersion(
  executor: SqlExecutor,
  config: ResolvedOutboxConfig,
): Promise<{ current: number; required: number }> {
  const current = await readVersion(executor, config);
  if (current < REQUIRED_SCHEMA_VERSION) {
    throw new OutboxError(
      'OUTBOX_NOT_MIGRATED',
      `outbox schema "${config.schema}" prefix "${config.tablePrefix}" is at version ${String(current)}, this library needs ${String(REQUIRED_SCHEMA_VERSION)}. Run: npx outbox migrate --schema ${config.schema} --prefix ${config.tablePrefix}`,
    );
  }
  return { current, required: REQUIRED_SCHEMA_VERSION };
}

/** Apply each pending migration in its own advisory-locked transaction.
 * @example
 * await migrate(adapter, config, { dryRun: true });
 */
export async function migrate<TDb, TTx>(
  adapter: DriverAdapter<TDb, TTx>,
  config: ResolvedOutboxConfig,
  options: { dryRun?: boolean } = {},
): Promise<MigrateResult> {
  const dryRun = options.dryRun ?? false;
  const lockKey = 'outbox:migrate:' + config.schema + '.' + config.tablePrefix;
  const bootstrap = render(BOOTSTRAP, config);
  const rows = await adapter.transaction(async (executor) => {
    await executor.query(LOCK, [lockKey]);
    if (!dryRun) await executor.query(bootstrap, []);
    if (dryRun && !(await versionTablePresent(executor, config))) return [];
    return executor.query(render(APPLIED, config), []);
  });
  let currentVersion = 0;
  for (const row of rows) {
    const version = row['version'];
    if (typeof version !== 'number')
      throw new OutboxError('OUTBOX_INTERNAL', 'Invalid migration version column. Please report.');
    currentVersion = Math.max(currentVersion, version);
    const migration = MIGRATIONS.find((entry) => entry.version === version);
    // A newer library can have applied additive migrations during a rolling deploy (FR-16).
    if (version > REQUIRED_SCHEMA_VERSION) continue;
    const expected = migration === undefined ? undefined : migrationChecksum(migration.template);
    if (migration === undefined || row['checksum'] !== expected) {
      throw new OutboxError(
        'OUTBOX_MIGRATION_CHECKSUM',
        `Migration ${String(version)} checksum differs: stored ${String(row['checksum'])}, expected ${String(expected)}`,
        { details: { version, stored: row['checksum'], expected } },
      );
    }
  }
  const pending = MIGRATIONS.filter((migration) => migration.version > currentVersion);
  if (dryRun)
    return {
      applied: pending.map(({ version, name }) => ({ version, name })),
      currentVersion,
      dryRun,
      sql: bootstrap + pending.map((migration) => render(migration.template, config)).join('\n'),
    };
  const applied: MigrateResult['applied'] = [];
  const statements = [bootstrap];
  for (const migration of pending) {
    const ddl = render(migration.template, config);
    try {
      const changed = await adapter.transaction(async (executor) => {
        await executor.query(LOCK, [lockKey]);
        const existing = await executor.query(render(EXISTS, config), [migration.version]);
        if (existing[0]?.['present'] === true) return false;
        await executor.query(ddl, []);
        await executor.query(render(INSERT, config), [
          migration.version,
          migration.name,
          migrationChecksum(migration.template),
        ]);
        return true;
      });
      if (changed) {
        applied.push({ version: migration.version, name: migration.name });
        statements.push(ddl);
      }
    } catch (cause) {
      throw new OutboxError('OUTBOX_MIGRATION_FAILED', `Migration ${String(migration.version)} failed`, {
        cause,
        details: { version: migration.version },
      });
    }
  }
  return { applied, currentVersion: await readVersion(adapter, config), sql: statements.join('\n'), dryRun };
}
