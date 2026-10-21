import { afterAll, describe, expect, it } from 'vitest';
import { createOutboxCore } from '../../src/core/outbox.js';
import { render } from '../../src/core/sql/render.js';
import { testClock } from '../../src/testing.js';
import type { Outbox, SqlExecutor } from '../../src/core/types.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema } from '../helpers/db.js';

describe.each(ADAPTERS)('%s test clock and delays', (name) => {
  const driver = createAdapter(name);
  const schemas: Awaited<ReturnType<typeof createTestSchema>>[] = [];
  afterAll(async () => {
    await driver.close();
    for (const schema of schemas) await schema.drop();
  });
  async function setup() {
    const schema = await createTestSchema();
    schemas.push(schema);
    const outbox = createOutboxCore(driver.adapter, { schema: schema.schema });
    await outbox.migrate();
    return { outbox, clock: testClock(outbox) };
  }
  async function offset(outbox: Outbox<SqlExecutor>, tx: SqlExecutor = driver.adapter) {
    const rows = await tx.query(
      render('select (extract(epoch from ({{now}} - now())) * 1000)::float8 as offset', outbox.config),
      [],
    );
    return rows[0]?.['offset'];
  }
  it('INT-92 TC-059 installs idempotently, moves only outbox time and restores production function', async () => {
    const { outbox, clock } = await setup();
    const key = Symbol.for('@firatkill/outbox/internal');
    expect(Object.getOwnPropertyDescriptor(outbox, key)).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
    expect(() => testClock({} as Outbox<unknown>)).toThrow(expect.objectContaining({ code: 'OUTBOX_CONFIG' }));
    await clock.install();
    await clock.set(12000);
    await clock.install();
    expect(await offset(outbox)).toBe(12000);
    await clock.advance(3000);
    expect(await offset(outbox)).toBe(15000);
    expect(await clock.now()).toBeInstanceOf(Date);
    for (const invalid of [-1, NaN, Infinity]) {
      await expect(clock.set(invalid)).rejects.toThrow();
      await expect(clock.advance(invalid)).rejects.toThrow();
    }
    expect(await offset(outbox)).toBe(15000);
    await outbox.migrate(); // Applied migrations do not overwrite the installed clock.
    expect(await offset(outbox)).toBe(15000);
    const other = await setup();
    await other.clock.install();
    expect(await offset(other.outbox)).toBe(0);
    await clock.reset();
    expect(await offset(outbox)).toBe(0);
    await clock.uninstall();
    const body = (
      await driver.adapter.query('select pg_get_functiondef($1::regprocedure)::text as body', [
        outbox.config.schema + '.' + outbox.config.tablePrefix + 'now()',
      ])
    )[0]?.['body'];
    expect(body).toContain('select now()');
    expect(body).toContain('PARALLEL SAFE');
    expect(body).not.toContain('test_offset');
    expect(
      await driver.adapter.query('select to_regclass($1::text)::text as name', [
        outbox.config.schema + '.outbox_test_clock',
      ]),
    ).toEqual([{ name: null }]);
    expect(await offset(outbox)).toBe(0);
  });
  it('INT-93 TC-060 isolates transaction-local overrides and clears them at transaction end', async () => {
    const { outbox, clock } = await setup();
    await clock.install();
    await clock.set(1000);
    await driver.adapter.transaction(async (tx) => {
      await clock.setLocal(tx, 61000);
      expect(await offset(outbox, tx)).toBe(61000);
      expect(await offset(outbox)).toBe(1000);
      await expect(clock.setLocal(tx, -1)).rejects.toThrow();
    });
    expect(await driver.adapter.transaction((tx) => offset(outbox, tx))).toBe(1000);
    expect(await offset(outbox)).toBe(1000);
  });
});
