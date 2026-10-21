import { createOutboxCore } from '../../src/core/outbox.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseOutboxConfig } from '../../src/core/config.js';
import { MIGRATIONS, migrationChecksum, migrationSql } from '../../src/core/migrations/index.js';
import { migrate, schemaVersion } from '../../src/core/migrations/runner.js';
import { render } from '../../src/core/sql/render.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema } from '../helpers/db.js';

// Both real adapters exercise the shared migration contract.
describe.each(ADAPTERS)('%s migrations', (name) => {
  const owned: Awaited<ReturnType<typeof createTestSchema>>[] = [];
  let driver: ReturnType<typeof createAdapter>;
  beforeAll(() => {
    driver = createAdapter(name);
  });
  afterAll(async () => {
    await driver.close();
    for (const schema of owned) await schema.drop();
  });
  async function setup() {
    const schema = await createTestSchema();
    owned.push(schema);
    return parseOutboxConfig({ db: driver.adapter.db, schema: schema.schema });
  }
  it('INT-02 TC-049 isolates custom schema and prefix objects and channels', async () => {
    const a = await setup();
    const b = { ...(await setup()), tablePrefix: 'ob_' };
    const first = driver.outbox({ schema: a.schema });
    const second = driver.outbox({ schema: b.schema, tablePrefix: b.tablePrefix });
    await first.migrate();
    await second.migrate();
    for (const [config, topic] of [
      [first.config, 'first'],
      [second.config, 'second'],
    ] as const) {
      const instance = createOutboxCore(driver.adapter, { schema: config.schema, tablePrefix: config.tablePrefix });
      await driver.adapter.transaction((tx) => instance.enqueue(tx, { topic, payload: null }));
      expect(await driver.adapter.query(render('select topic::text from {{messages}}', config), [])).toEqual([
        { topic },
      ]);
    }
    expect(first.config.channel).not.toBe(second.config.channel);
    expect(await first.schemaVersion()).toEqual({ current: 1, required: 1 });
    expect(await second.schemaVersion()).toEqual({ current: 1, required: 1 });
    const rows = await driver.adapter.query(
      'select to_regclass($1::text)::text as first, to_regclass($2::text)::text as second, to_regclass($3::text)::text as absent',
      [a.schema + '.outbox_messages', b.schema + '.ob_messages', b.schema + '.outbox_messages'],
    );
    expect(rows).toEqual([{ first: a.schema + '.outbox_messages', second: b.schema + '.ob_messages', absent: null }]);
  });
  it('INT-01 TC-031 installs the specified catalog and is idempotent', async () => {
    const config = await setup();
    const outbox = driver.outbox({ schema: config.schema });
    expect(await outbox.migrate()).toMatchObject({
      applied: [{ version: 1, name: 'initial' }],
      currentVersion: 1,
      dryRun: false,
    });
    expect(await outbox.migrate()).toMatchObject({ applied: [], currentVersion: 1 });
    expect(await createOutboxCore(driver.adapter, { schema: config.schema }).schemaVersion()).toEqual({
      current: 1,
      required: 1,
    });
    expect(
      await driver.adapter.query(
        'select $1::text::jsonb::text as payload, $2::int8::text as seq, $3::boolean as flag',
        ['{"id":1}', '9007199254740993', true],
      ),
    ).toEqual([{ payload: '{"id": 1}', seq: '9007199254740993', flag: true }]);
    const migration = MIGRATIONS[0];
    if (migration === undefined) throw new Error('Initial migration missing');
    expect(
      await driver.adapter.query(
        render(
          'select version::int4 as version, name::text as name, checksum::text as checksum from {{migrations}}',
          config,
        ),
        [],
      ),
    ).toEqual([{ version: 1, name: 'initial', checksum: migrationChecksum(migration.template) }]);
    const indexes = await driver.adapter.query(
      'select indexname::text as name from pg_indexes where schemaname = $1::text order by indexname',
      [config.schema],
    );
    expect(indexes.map((row) => row['name'])).toEqual([
      'outbox_inbox_pk',
      'outbox_inbox_processed_idx',
      'outbox_messages_claim_idx',
      'outbox_messages_dead_idx',
      'outbox_messages_dedupe_uq',
      'outbox_messages_lease_idx',
      'outbox_messages_order_idx',
      'outbox_messages_pkey',
      'outbox_messages_purge_idx',
      'outbox_schema_migrations_pkey',
    ]);
    const columns = await driver.adapter.query(
      'select column_name::text as name, data_type::text as type, is_identity::text as identity from information_schema.columns where table_schema = $1::text and table_name = $2::text order by ordinal_position',
      [config.schema, 'outbox_messages'],
    );
    expect(columns.map((row) => [row['name'], row['type']])).toEqual([
      ['id', 'uuid'],
      ['seq', 'bigint'],
      ['topic', 'text'],
      ['key', 'text'],
      ['payload', 'jsonb'],
      ['headers', 'jsonb'],
      ['dedupe_key', 'text'],
      ['status', 'text'],
      ['attempts', 'integer'],
      ['max_attempts', 'integer'],
      ...['available_at', 'created_at'].map((name) => [name, 'timestamp with time zone']),
      ['locked_by', 'text'],
      ...['locked_until', 'last_attempt_at', 'completed_at', 'dead_at'].map((name) => [
        name,
        'timestamp with time zone',
      ]),
      ['last_error', 'text'],
    ]);
    expect(columns.find((row) => row['name'] === 'seq')?.['identity']).toBe('YES');
    const checks = await driver.adapter.query(
      'select conname::text as name from pg_constraint where connamespace = $1::regnamespace and contype = $2::"char" order by conname',
      [config.schema, 'c'],
    );
    expect(checks.map((row) => row['name'])).toEqual([
      'outbox_inbox_consumer_ck',
      'outbox_inbox_message_id_ck',
      ...[
        'attempts',
        'completed',
        'dead',
        'dedupe_key',
        'headers',
        'key',
        'last_error',
        'lease',
        'max_attempts',
        'pending_attempts',
        'status',
        'topic',
      ].map((name) => `outbox_messages_${name}_ck`),
    ]);
    const functionRows = await driver.adapter.query('select pg_get_functiondef($1::regprocedure)::text as definition', [
      config.schema + '.outbox_now()',
    ]);
    expect(functionRows[0]?.['definition']).toContain('select now()');
  });
  it('INT-01b TC-065 rolls back failed migration DDL and preserves its cause', async () => {
    const config = await setup();
    await driver.adapter.query(render('create table {{messages}} (sentinel text)', config), []);
    await expect(migrate(driver.adapter, config)).rejects.toMatchObject({
      code: 'OUTBOX_MIGRATION_FAILED',
      details: { version: 1 },
      cause: { code: '42P07' },
    });
    expect(
      await driver.adapter.query(render('select count(*)::int4 as count from {{migrations}}', config), []),
    ).toEqual([{ count: 0 }]);
    expect(
      await driver.adapter.query('select to_regprocedure($1::text)::text as name', [config.schema + '.outbox_now()']),
    ).toEqual([{ name: null }]);
    expect(
      await driver.adapter.query(render('select sentinel::text as sentinel from {{messages}}', config), []),
    ).toEqual([]);
  });
  it('INT-03 TC-032 rejects a changed checksum without repairing it', async () => {
    const config = await setup();
    await migrate(driver.adapter, config);
    await driver.adapter.query(
      render('update {{migrations}} set checksum = $1::text where version = $2::int4', config),
      ['x', 1],
    );
    await expect(migrate(driver.adapter, config)).rejects.toMatchObject({
      code: 'OUTBOX_MIGRATION_CHECKSUM',
      details: { version: 1, stored: 'x' },
    });
    expect(
      await driver.adapter.query(render('select checksum::text as checksum from {{migrations}}', config), []),
    ).toEqual([{ checksum: 'x' }]);
  });
  it('INT-04 TC-033 serializes five concurrent migration runners', async () => {
    const config = await setup();
    const results = await Promise.all(Array.from({ length: 5 }, () => migrate(driver.adapter, config)));
    expect(results.flatMap((result) => result.applied)).toEqual([{ version: 1, name: 'initial' }]);
    expect(results.every((result) => result.currentVersion === 1)).toBe(true);
    expect(
      await driver.adapter.query(render('select count(*)::int4 as count from {{migrations}}', config), []),
    ).toEqual([{ count: 1 }]);
  });
  it('INT-05 TC-036 produces the same catalog through generated SQL and runner', async () => {
    const printed = await setup();
    const executed = await setup();
    await driver.adapter.query(migrationSql({ schema: printed.schema }), []);
    await migrate(driver.adapter, executed);
    const catalog = async (config: typeof printed) => {
      const columns = await driver.adapter.query(
        'select table_name::text as table_name, column_name::text as name, data_type::text as type, column_default::text as default, is_nullable::text as nullable, is_identity::text as identity from information_schema.columns where table_schema = $1::text order by table_name, ordinal_position',
        [config.schema],
      );
      const constraints = await driver.adapter.query(
        'select conname::text as name, pg_get_constraintdef(oid)::text as definition from pg_constraint where connamespace = $1::regnamespace order by conname',
        [config.schema],
      );
      const indexes = await driver.adapter.query(
        'select indexname::text as name, indexdef::text as definition from pg_indexes where schemaname = $1::text order by indexname',
        [config.schema],
      );
      const versions = await driver.adapter.query(
        render(
          'select version::int4 as version, name::text as name, checksum::text as checksum from {{migrations}} order by version',
          config,
        ),
        [],
      );
      // applied_at is execution bookkeeping; compare version identity/checksum, not wall-clock equality.
      return JSON.stringify({ columns, constraints, indexes, versions }).replaceAll(config.schema, 'normalized_schema');
    };
    expect(await catalog(printed)).toBe(await catalog(executed));
  });
  it('INT-06 TC-034 rejects missing schemas and accepts additive newer versions', async () => {
    const config = await setup();
    await expect(schemaVersion(driver.adapter, config)).rejects.toMatchObject({
      code: 'OUTBOX_NOT_MIGRATED',
    });
    await expect(schemaVersion(driver.adapter, config)).rejects.toThrow('npx outbox migrate --schema');
    const outbox = createOutboxCore(driver.adapter, { schema: config.schema, tablePrefix: config.tablePrefix });
    const missing = outbox.createRelay({ listen: false, publisher: () => Promise.resolve() });
    await expect(missing.start()).rejects.toMatchObject({ code: 'OUTBOX_NOT_MIGRATED' });
    expect(missing.state).toBe('stopped');
    await migrate(driver.adapter, config);
    await driver.adapter.query(
      render('insert into {{migrations}} (version, name, checksum) values ($1::int4, $2::text, $3::text)', config),
      [2, 'future_additive', 'future'],
    );
    expect(await schemaVersion(driver.adapter, config)).toEqual({ current: 2, required: 1 });
    expect(await migrate(driver.adapter, config)).toMatchObject({ currentVersion: 2, applied: [] });
    const newer = outbox.createRelay({ listen: false, publisher: () => Promise.resolve() });
    try {
      await newer.start();
      expect(newer.state).toBe('running');
    } finally {
      await newer.stop();
    }
  });
  it('INT-07 TC-035 returns dry-run SQL without creating any table', async () => {
    const config = await setup();
    const result = await migrate(driver.adapter, config, { dryRun: true });
    expect(result).toMatchObject({ dryRun: true, currentVersion: 0, applied: [{ version: 1, name: 'initial' }] });
    expect(result.sql).toContain('create table');
    expect(
      await driver.adapter.query('select to_regclass($1::text)::text as name', [
        config.schema + '.outbox_schema_migrations',
      ]),
    ).toEqual([{ name: null }]);
    expect(
      await driver.adapter.query(
        'select count(*)::int4 as count from information_schema.tables where table_schema = $1::text',
        [config.schema],
      ),
    ).toEqual([{ count: 0 }]);
  });
});
