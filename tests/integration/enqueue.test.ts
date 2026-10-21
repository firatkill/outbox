import { readFileSync } from 'node:fs';
import { testClock } from '../../src/testing.js';
import { mapMessageRow } from '../../src/core/row.js';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOutboxCore } from '../../src/core/outbox.js';
import { quoteIdent } from '../../src/core/identifiers.js';
import type { MessageInput, Outbox, SqlExecutor } from '../../src/core/types.js';
import { render } from '../../src/core/sql/render.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema, TEST_DATABASE_URL } from '../helpers/db.js';
import { createSpyExecutor } from '../helpers/spy.js';
import { deferred, waitFor } from '../helpers/wait.js';
import { invalidMessages } from '../fixtures/invalid-messages.js';

const base = { topic: 'order.created', payload: { id: 1 } };

describe.each(ADAPTERS)('%s enqueue', (name) => {
  let owned: Awaited<ReturnType<typeof createTestSchema>>;
  let outbox: Outbox<SqlExecutor>;
  const driver = createAdapter(name);
  let role: string;
  beforeAll(async () => {
    owned = await createTestSchema();
    outbox = createOutboxCore(driver.adapter, { schema: owned.schema });
    await outbox.migrate();
    await driver.adapter.query('create table ' + quoteIdent(owned.schema) + '.orders (id int4)', []);
    role = 't_producer_' + owned.schema + '_' + name.replace('-', '');
    await driver.adapter.query('create role ' + quoteIdent(role), []);
    await driver.adapter.query('grant usage on schema ' + quoteIdent(owned.schema) + ' to ' + quoteIdent(role), []);
    await driver.adapter.query(
      'grant insert, select on ' + outbox.config.names.messages + ' to ' + quoteIdent(role),
      [],
    );
    await driver.adapter.query('grant execute on function ' + outbox.config.names.now + ' to ' + quoteIdent(role), []);
  });
  afterAll(async () => {
    if (role) {
      await driver.adapter.query('drop owned by ' + quoteIdent(role), []);
      await driver.adapter.query('drop role ' + quoteIdent(role), []);
    }
    await driver.close();
    await owned.drop();
  });
  const count = async (topic: string) =>
    (
      await driver.adapter.query(
        render('select count(*)::int4 as count from {{messages}} where topic = $1::text', outbox.config),
        [topic],
      )
    )[0]?.['count'];

  it('INT-10 INT-82 TC-050 commits the business row and all message fields atomically', async () => {
    const result = await driver.adapter.transaction(async (tx) => {
      await tx.query('insert into ' + quoteIdent(owned.schema) + '.orders values ($1::int4)', [10]);
      return outbox.enqueue(tx, {
        topic: 'atomic',
        payload: { id: 10 },
        key: 'order-10',
        headers: { traceparent: 'fixture' },
        dedupeKey: 'atomic-10',
        maxAttempts: 7,
        delayMs: 0,
      });
    });
    expect(result).toMatchObject({ topic: 'atomic', deduped: false });
    expect(result.id).toMatch(/^[0-9a-f-]{14}7[0-9a-f-]{21}$/);
    const rows = await driver.adapter.query(
      render(
        `select id::text, seq::text, topic::text, key::text, payload::text, headers::text,
      dedupe_key::text, status::text, attempts::int4, max_attempts::int4, last_error::text,
      (extract(epoch from created_at) * 1000)::float8 as created_at_ms,
      (extract(epoch from available_at) * 1000)::float8 as available_at_ms,
      abs(extract(epoch from ({{now}} - created_at)))::float8 as age,
      (extract(epoch from (available_at - created_at)) * 1000)::float8 as delay
      from {{messages}} where id = $1::uuid`,
        outbox.config,
      ),
      [result.id],
    );
    expect(rows[0]).toMatchObject({
      id: result.id,
      topic: 'atomic',
      key: 'order-10',
      payload: '{"id": 10}',
      headers: '{"traceparent": "fixture"}',
      dedupe_key: 'atomic-10',
      status: 'pending',
      attempts: 0,
      max_attempts: 7,
      delay: 0,
    });
    expect(rows[0]?.['age']).toBeLessThan(2);
    const row = rows[0];
    if (!row) throw new Error('Missing inserted row');
    const mapped = mapMessageRow(row);
    expect(mapped).toMatchObject({ payload: { id: 10 }, headers: { traceparent: 'fixture' }, maxAttempts: 7 });
    expect(typeof mapped.seq).toBe('string');
    expect(mapped.createdAt).toBeInstanceOf(Date);
    expect(mapped.availableAt).toBeInstanceOf(Date);
    expect(
      await driver.adapter.query('select id::int4 from ' + quoteIdent(owned.schema) + '.orders where id = 10', []),
    ).toEqual([{ id: 10 }]);
  });
  it('INT-10b TC-057 inserts and dedupes with no sequence privilege', async () => {
    const send = () =>
      driver.adapter.transaction(async (tx) => {
        await tx.query('set local role ' + quoteIdent(role), []);
        return outbox.enqueue(tx, { ...base, topic: 'restricted', dedupeKey: 'one' });
      });
    const first = await send();
    expect(first.deduped).toBe(false);
    expect(await send()).toEqual({ ...first, deduped: true });
  });
  it('INT-11 TC-051 rolls back both rows without sending a notification', async () => {
    const listener = new pg.Client({ connectionString: TEST_DATABASE_URL });
    let notifications = 0;
    await listener.connect();
    listener.on('notification', () => {
      notifications++;
    });
    try {
      await listener.query('listen ' + quoteIdent(outbox.config.channel));
      await expect(
        driver.adapter.transaction(async (tx) => {
          await tx.query('insert into ' + quoteIdent(owned.schema) + '.orders values (11)', []);
          await outbox.enqueue(tx, { ...base, topic: 'rollback' });
          throw new Error('rollback fixture');
        }),
      ).rejects.toThrow('rollback fixture');
      expect(await count('rollback')).toBe(0);
      expect(
        await driver.adapter.query('select id::int4 from ' + quoteIdent(owned.schema) + '.orders where id = 11', []),
      ).toEqual([]);
      // INT-11 explicitly requires a 300 ms negative notification observation window.
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      expect(notifications).toBe(0);
    } finally {
      await listener.end();
    }
  });
  it('INT-19 TC-122 notifies once after commit and suppresses notify:false', async () => {
    const listen = driver.adapter.listen?.bind(driver.adapter);
    if (!listen) throw new Error('missing listener');
    let notifications = 0;
    const handle = await listen(
      outbox.config.channel,
      () => {
        notifications++;
      },
      () => undefined,
      () => undefined,
    );
    try {
      await driver.adapter.transaction(async (tx) => {
        await outbox.enqueue(
          tx,
          Array.from({ length: 10 }, () => ({ topic: 'notify', payload: null })),
        );
        // INT-19 explicitly holds the transaction open for a 200ms negative observation window.
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(notifications).toBe(0);
      });
      await waitFor(() => notifications === 1);
      const silent = createOutboxCore(driver.adapter, { schema: owned.schema, notify: false });
      await driver.adapter.transaction(async (tx) => {
        const spy = createSpyExecutor(tx);
        await silent.enqueue(spy.executor, { topic: 'silent', payload: null });
        expect(spy.statements).toHaveLength(1);
        expect(spy.statements[0]?.params[1]).toBeNull();
      });
      // Observe absence of notifications after a committed notify:false transaction.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(notifications).toBe(1);
    } finally {
      await handle.close();
    }
  });
  it('INT-12 TC-052 sends one statement for 1000 messages and preserves sequence order', async () => {
    await driver.adapter.transaction(async (tx) => {
      const spy = createSpyExecutor(tx);
      const input = Array.from({ length: 1000 }, (_, id) => ({ topic: 'batch', payload: { id } }));
      const results = await outbox.enqueue(spy.executor, input);
      expect(spy.statements).toHaveLength(1);
      const rows = await tx.query(
        render(
          'select id::text, seq::text, payload::text from {{messages}} m where topic = $1::text order by m.seq',
          outbox.config,
        ),
        ['batch'],
      );
      expect(rows.map((row) => row['id'])).toEqual(results.map((result) => result.id));
      expect(rows.map((row) => JSON.parse(String(row['payload'])) as unknown)).toEqual(input.map((m) => m.payload));
      for (let i = 1; i < rows.length; i++)
        expect(BigInt(String(rows[i]?.['seq']))).toBeGreaterThan(BigInt(String(rows[i - 1]?.['seq'])));
      spy.statements.length = 0;
      await expect(outbox.enqueue(spy.executor, [...input, base])).rejects.toMatchObject({
        code: 'OUTBOX_INVALID_MESSAGE',
      });
      expect(spy.statements).toHaveLength(0);
      expect(await outbox.enqueue(spy.executor, [])).toEqual([]);
      expect(spy.statements).toHaveLength(0);
    });
  });
  it('INT-13 TC-053 dedupes by topic/key with first-wins batch results in input order', async () => {
    const send = (message: MessageInput) => driver.adapter.transaction((tx) => outbox.enqueue(tx, message));
    const first = await send({ ...base, topic: 'dedupe', dedupeKey: 'same' });
    expect(await send({ ...base, topic: 'dedupe', dedupeKey: 'same', payload: 'ignored' })).toEqual({
      ...first,
      deduped: true,
    });
    const other = await send({ ...base, topic: 'other', dedupeKey: 'same' });
    expect(other.id).not.toBe(first.id);
    const batch = await driver.adapter.transaction((tx) =>
      outbox.enqueue(tx, [
        { ...base, topic: 'in-batch', dedupeKey: 'same' },
        { ...base, topic: 'in-batch', dedupeKey: 'same', payload: 'ignored' },
        { ...base, topic: 'dedupe', dedupeKey: 'same' },
      ]),
    );
    expect(batch[0]?.deduped).toBe(false);
    expect(batch[1]).toEqual({ ...batch[0], deduped: true });
    expect(batch[2]).toEqual({ ...first, deduped: true });
    expect(await count('in-batch')).toBe(1);
  });
  it.each([false, true])('INT-14 TC-054 waits for conflicting transaction (rollback=%s)', async (rollback) => {
    const topic = rollback ? 'race.rollback' : 'race.commit';
    const held = deferred<string>();
    const release = deferred<undefined>();
    const secondPid = deferred<number>();
    const first = driver.adapter.transaction(async (tx) => {
      const message = await outbox.enqueue(tx, { ...base, topic, dedupeKey: 'same' });
      held.resolve(message.id);
      await release.promise;
      if (rollback) throw new Error('race rollback');
      return message;
    });
    // Handle the expected rollback rejection immediately, before releasing the gate.
    const firstOutcome = first.catch((error: unknown) => error);
    const firstId = await held.promise;
    const second = driver.adapter.transaction(async (tx) => {
      const row = (await tx.query('select pg_backend_pid()::int4 as pid', []))[0];
      secondPid.resolve(Number(row?.['pid']));
      return outbox.enqueue(tx, { ...base, topic, dedupeKey: 'same' });
    });
    try {
      const pid = await secondPid.promise;
      // A database lock condition replaces a timing sleep while T1 is held open.
      await waitFor(
        async () =>
          (
            await owned.admin.unsafe(
              'select wait_event_type::text as wait from pg_stat_activity where pid = $1::int4',
              [pid],
            )
          )[0]?.['wait'] === 'Lock',
      );
    } finally {
      release.resolve(undefined);
    }
    const result = await second;
    await firstOutcome;
    expect(result.deduped).toBe(!rollback);
    if (rollback) expect(result.id).not.toBe(firstId);
    else expect(result.id).toBe(firstId);
    expect(await count(topic)).toBe(1);
  });
  it('INT-17 TC-055 rejects every UT-05 invalid field without executing SQL', async () => {
    const spy = createSpyExecutor();
    for (const [field, value] of invalidMessages) {
      await expect(outbox.enqueue(spy.executor, { ...base, [field]: value } as MessageInput)).rejects.toMatchObject({
        code: 'OUTBOX_INVALID_MESSAGE',
        details: { index: 0, field },
      });
    }
    expect(spy.statements).toHaveLength(0);
  });
  it('INT-18 TC-056 enforces the JSON byte boundary against PostgreSQL', async () => {
    const limited = createOutboxCore(driver.adapter, { schema: owned.schema, maxPayloadBytes: 1024 });
    await driver.adapter.transaction(async (tx) => {
      const spy = createSpyExecutor(tx);
      await expect(limited.enqueue(spy.executor, { topic: 'size', payload: 'x'.repeat(1023) })).rejects.toMatchObject({
        code: 'OUTBOX_PAYLOAD_TOO_LARGE',
      });
      expect(spy.statements).toHaveLength(0);
      expect((await limited.enqueue(spy.executor, { topic: 'size', payload: 'x'.repeat(1022) })).deduped).toBe(false);
    });
  });
});

// Test-only copy of normative C1; production implementation remains T-13.
const claim = readFileSync(new URL('../fixtures/claim-unordered.sql', import.meta.url), 'utf8');
describe.each(ADAPTERS)('%s enqueue delays', (name) => {
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
  it('INT-15 TC-061 delays exactly 60 seconds and permits only the transaction-local eligible claim', async () => {
    const { outbox, clock } = await setup();
    await clock.install();
    const message = await driver.adapter.transaction((tx) =>
      outbox.enqueue(tx, { topic: 'delayed', payload: {}, delayMs: 60000 }),
    );
    expect(
      await driver.adapter.query(
        render(
          'select (extract(epoch from (available_at - created_at)) * 1000)::float8 as delay from {{messages}} where id = $1::uuid',
          outbox.config,
        ),
        [message.id],
      ),
    ).toEqual([{ delay: 60000 }]);
    await driver.adapter.transaction(async (tx) => {
      expect(await tx.query(render(claim, outbox.config), ['fixture', 1, 60000])).toEqual([]);
      await clock.setLocal(tx, 59000);
      expect(await tx.query(render(claim, outbox.config), ['fixture', 1, 60000])).toEqual([]);
      await clock.setLocal(tx, 61000);
      expect(
        await driver.adapter.query(
          render('select available_at > {{now}} as unready from {{messages}} where id = $1::uuid', outbox.config),
          [message.id],
        ),
      ).toEqual([{ unready: true }]);
      const rows = await tx.query(render(claim, outbox.config), ['fixture', 1, 60000]);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.['id']).toBe(message.id);
    });
  });
  it('INT-16 TC-062 stores the caller-supplied absolute availability to the millisecond', async () => {
    const { outbox, clock } = await setup();
    await clock.install();
    const availableAt = new Date((await clock.now()).getTime() + 5000);
    const result = await driver.adapter.transaction((tx) =>
      outbox.enqueue(tx, { topic: 'absolute', payload: null, availableAt }),
    );
    expect(
      await driver.adapter.query(
        render(
          'select (extract(epoch from available_at) * 1000)::float8 as available_at_ms from {{messages}} where id = $1::uuid',
          outbox.config,
        ),
        [result.id],
      ),
    ).toEqual([{ available_at_ms: availableAt.getTime() }]);
  });
  it('INT-15 TC-083 relay runOnce respects relative delay', async () => {
    const { outbox, clock } = await setup();
    await clock.install();
    await driver.adapter.transaction((tx) => outbox.enqueue(tx, { topic: 'delayed', payload: null, delayMs: 60000 }));
    const relay = outbox.createRelay({ publisher: () => Promise.resolve(), listen: false });
    expect((await relay.runOnce()).claimed).toBe(0);
    await clock.advance(59000);
    expect((await relay.runOnce()).claimed).toBe(0);
    await clock.advance(2000);
    expect(await relay.runOnce()).toMatchObject({ claimed: 1, delivered: 1 });
    await relay.stop();
  });
  it('INT-16 TC-083 relay runOnce respects absolute availability', async () => {
    const { outbox, clock } = await setup();
    await clock.install();
    const availableAt = new Date((await clock.now()).getTime() + 5000);
    await driver.adapter.transaction((tx) => outbox.enqueue(tx, { topic: 'absolute', payload: null, availableAt }));
    const relay = outbox.createRelay({ publisher: () => Promise.resolve(), listen: false });
    expect((await relay.runOnce()).claimed).toBe(0);
    await clock.advance(6000);
    expect(await relay.runOnce()).toMatchObject({ claimed: 1, delivered: 1 });
    await relay.stop();
  });
});
