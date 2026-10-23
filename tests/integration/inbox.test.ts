import { afterAll, describe, expect, it, vi } from 'vitest';
import { createOutboxCore } from '../../src/core/outbox.js';
import { createInbox as createPgInbox } from '../../src/pg.js';
import { createInbox as createPostgresInbox } from '../../src/postgres-js.js';
import type { PgPool } from '../../src/pg.js';
import type { PostgresJsSql } from '../../src/postgres-js.js';
import type { InboxResult, SqlExecutor } from '../../src/core/types.js';
import { testClock } from '../../src/testing.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema } from '../helpers/db.js';
import { deferred, waitFor } from '../helpers/wait.js';

describe.each(ADAPTERS)('%s inbox', (name) => {
  const driver = createAdapter(name, { max: 10 });
  const schemas: Awaited<ReturnType<typeof createTestSchema>>[] = [];
  afterAll(async () => {
    await driver.close();
    for (const owned of schemas) await owned.drop();
  });
  async function setup() {
    const owned = await createTestSchema();
    schemas.push(owned);
    const outbox = createOutboxCore(driver.adapter, { schema: owned.schema });
    await outbox.migrate();
    await owned.admin`create table ${owned.admin(owned.schema)}.effects (id text)`;
    const effect = async (tx: SqlExecutor) => {
      await tx.query('insert into "' + owned.schema + '".effects values ($1::text)', ['effect']);
      return 'result';
    };
    const effects = () => owned.admin`select * from ${owned.admin(owned.schema)}.effects`;
    const rows = () => owned.admin`select * from ${owned.admin(owned.schema)}.outbox_inbox`;
    const clock = testClock(outbox);
    await clock.install();
    return { owned, outbox, effect, effects, rows, clock };
  }
  it('INT-60 TC-129 dedupes by consumer and message id', async () => {
    const { outbox, effect, effects } = await setup();
    const fn = vi.fn(effect);
    const run = (consumer: string) => driver.adapter.transaction((tx) => outbox.withInbox(tx, consumer, 'm1', fn));
    expect(await run('c1')).toEqual({ status: 'processed', result: 'result' });
    expect(await run('c1')).toEqual({ status: 'duplicate' });
    expect(await run('c2')).toEqual({ status: 'processed', result: 'result' });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(await effects()).toHaveLength(2);
  });
  it('INT-61 TC-130 rolls back inbox and effects then processes a retry', async () => {
    const { outbox, effect, effects, rows } = await setup();
    const error = new Error('effect failed');
    await expect(
      driver.adapter.transaction((tx) =>
        outbox.withInbox(tx, 'c', 'm', async (original) => {
          await effect(original);
          throw error;
        }),
      ),
    ).rejects.toBe(error);
    expect(await rows()).toHaveLength(0);
    expect(await effects()).toHaveLength(0);
    expect(await driver.adapter.transaction((tx) => outbox.withInbox(tx, 'c', 'm', effect))).toEqual({
      status: 'processed',
      result: 'result',
    });
    expect(await effects()).toHaveLength(1);
  });
  it('INT-62 TC-131 processes one of ten concurrent transactions', async () => {
    const { outbox, effect, effects } = await setup();
    const ready = deferred<undefined>();
    let entered = 0;
    const pids = new Set<unknown>();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        driver.adapter.transaction(async (tx) => {
          pids.add((await tx.query('select pg_backend_pid() as pid', []))[0]?.['pid']);
          if (++entered === 10) ready.resolve(undefined);
          await ready.promise;
          return outbox.withInbox(tx, 'c', 'm', async (original) => {
            await effect(original);
            // TRD INT-62 specifies 50 ms of real transactional work to expose lock contention.
            await original.query('select pg_sleep(0.05)', []);
          });
        }),
      ),
    );
    expect(pids.size).toBe(10);
    expect(results.filter((r) => r.status === 'processed')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'duplicate')).toHaveLength(9);
    expect(await effects()).toHaveLength(1);
  });
  it('INT-63 TC-132 commits effects once across lease-loss redelivery', async () => {
    const { outbox, effect, effects, clock } = await setup();
    await driver.adapter.transaction((tx) => outbox.enqueue(tx, { topic: 't', payload: null }));
    const gate = deferred<undefined>(),
      committed = deferred<undefined>();
    const outcomes: InboxResult<string>[] = [];
    const handle = async (id: string) => {
      outcomes.push(await driver.adapter.transaction((tx) => outbox.withInbox(tx, 'mailer', id, effect)));
    };
    const a = outbox.createRelay({
      listen: false,
      leaseMs: 120000,
      handlerTimeoutMs: 110000,
      publisher: async (message) => {
        await handle(message.id);
        committed.resolve(undefined);
        await gate.promise;
      },
    });
    const running = a.runOnce();
    try {
      await committed.promise;
      await clock.advance(121000);
      const b = outbox.createRelay({ listen: false, publisher: (message) => handle(message.id) });
      expect(await b.runOnce()).toMatchObject({ reclaimed: 1, delivered: 1 });
      gate.resolve(undefined);
      expect(await running).toMatchObject({ delivered: 0, leaseLost: 1 });
      expect(outcomes).toEqual([{ status: 'processed', result: 'result' }, { status: 'duplicate' }]);
      expect(await effects()).toHaveLength(1);
    } finally {
      gate.resolve(undefined);
      await running;
    }
  });
  it('INT-64 TC-133 purges only inbox records older than retention', async () => {
    const { outbox, clock, rows } = await setup();
    const insert = (id: string) =>
      driver.adapter.transaction((tx) => outbox.withInbox(tx, 'c', id, () => Promise.resolve(undefined)));
    for (const id of ['old1', 'old2', 'old3']) await insert(id);
    await clock.advance(8 * 86400000);
    for (const id of ['new1', 'new2']) await insert(id);
    expect(await outbox.purgeInbox({ olderThanMs: 7 * 86400000, batchSize: 2 })).toEqual({ deleted: 3 });
    expect((await rows()).map((row) => String(row['message_id'])).sort()).toEqual(['new1', 'new2']);
  });
  it('INT-65 TC-134 exposes standalone factories in a separate consumer schema', async () => {
    const { owned: producer } = await setup();
    const consumer = await createTestSchema();
    schemas.push(consumer);
    const config = { schema: consumer.schema };
    // Exercise public factories with actual caller-owned driver transactions.
    if (name === 'pg') {
      const db = driver.adapter.db as PgPool;
      const inbox = createPgInbox({ db, ...config });
      await inbox.migrate();
      const tx = await db.connect();
      try {
        await tx.query('begin');
        expect(
          await inbox.withInbox(tx, 'c', 'm', (original) => {
            expect(original).toBe(tx);
            return Promise.resolve(42);
          }),
        ).toEqual({ status: 'processed', result: 42 });
        await tx.query('commit');
      } catch (error) {
        await tx.query('rollback');
        throw error;
      } finally {
        tx.release();
      }
      await testClock(inbox).install();
      await testClock(inbox).advance(1000);
      expect(await inbox.purgeInbox({ olderThanMs: 500 })).toEqual({ deleted: 1 });
    } else {
      const db = driver.adapter.db as PostgresJsSql;
      const inbox = createPostgresInbox({ db, ...config });
      await inbox.migrate();
      expect(
        await db.begin((tx) =>
          inbox.withInbox(tx, 'c', 'm', (original) => {
            expect(original).toBe(tx);
            return Promise.resolve(42);
          }),
        ),
      ).toEqual({ status: 'processed', result: 42 });
      expect(await consumer.admin`select * from ${consumer.admin(consumer.schema)}.outbox_inbox`).toHaveLength(1);
    }
    expect(await producer.admin`select * from ${producer.admin(producer.schema)}.outbox_inbox`).toHaveLength(0);
    expect(await consumer.admin`select * from ${consumer.admin(consumer.schema)}.outbox_messages`).toHaveLength(0);
  });
  it('INT-105 TC-140 rejects invalid identifiers and processes after concurrent rollback', async () => {
    const { outbox, effect, effects, rows, owned } = await setup();
    await driver.adapter.transaction(async (tx) => {
      const query = vi.spyOn(tx, 'query');
      await expect(outbox.withInbox(tx, 'bad consumer', 'm', effect)).rejects.toMatchObject({
        code: 'OUTBOX_INVALID_MESSAGE',
      });
      await expect(outbox.withInbox(tx, 'c', '', effect)).rejects.toMatchObject({ code: 'OUTBOX_INVALID_MESSAGE' });
      expect(query).not.toHaveBeenCalled();
    });
    const inserted = deferred<undefined>(),
      release = deferred<undefined>();
    const error = new Error('rollback first');
    const first = driver.adapter
      .transaction((tx) =>
        outbox.withInbox(tx, 'c', 'm', async (original) => {
          await effect(original);
          inserted.resolve(undefined);
          await release.promise;
          throw error;
        }),
      )
      .catch((cause: unknown) => cause);
    await inserted.promise;
    let pid: unknown;
    const second = driver.adapter.transaction(async (tx) => {
      pid = (await tx.query('select pg_backend_pid() as pid', []))[0]?.['pid'];
      return outbox.withInbox(tx, 'c', 'm', effect);
    });
    try {
      await waitFor(
        async () =>
          (
            await owned.admin`select pid from pg_stat_activity where pid = ${Number(pid ?? 0)} and wait_event_type = 'Lock'`
          ).length === 1,
      );
      release.resolve(undefined);
      expect(await first).toBe(error);
      expect(await second).toEqual({ status: 'processed', result: 'result' });
      expect(await effects()).toHaveLength(1);
      expect(await rows()).toHaveLength(1);
    } finally {
      release.resolve(undefined);
      await first;
      await second;
    }
  });
});
