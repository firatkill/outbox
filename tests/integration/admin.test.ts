import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createOutboxCore } from '../../src/core/outbox.js';
import { NonRetryableError } from '../../src/core/errors.js';
import { claim } from '../../src/core/sql/claim.js';
import { render } from '../../src/core/sql/render.js';
import type { MessageInput, SqlParam } from '../../src/core/types.js';
import { testClock } from '../../src/testing.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema } from '../helpers/db.js';

describe.each(ADAPTERS)('%s admin', (name) => {
  const driver = createAdapter(name);
  const schemas: Awaited<ReturnType<typeof createTestSchema>>[] = [];
  afterAll(async () => {
    await driver.close();
    for (const s of schemas) await s.drop();
  });
  async function setup() {
    const owned = await createTestSchema();
    schemas.push(owned);
    const outbox = createOutboxCore(driver.adapter, { schema: owned.schema });
    await outbox.migrate();
    const clock = testClock(outbox);
    await clock.install();
    const enqueue = (messages: MessageInput[]) => driver.adapter.transaction((tx) => outbox.enqueue(tx, messages));
    const query = (sql: string, params: readonly SqlParam[] = []) =>
      driver.adapter.query(render(sql, outbox.config), params);
    async function deliver(dead = false) {
      const relay = outbox.createRelay({
        listen: false,
        concurrency: 1000,
        batchSize: 1000,
        publisher: () => {
          if (dead) throw new NonRetryableError('fixture');
          return Promise.resolve();
        },
      });
      try {
        while ((await relay.runOnce()).claimed > 0) {
          /* Drain ready fixtures. */
        }
      } finally {
        await relay.stop();
      }
    }
    return { outbox, clock, enqueue, query, deliver };
  }
  it('INT-35 TC-108 retries dead filters and preserves diagnostic errors', async () => {
    const s = await setup();
    const inserted = await s.enqueue(
      ['a', 'a', 'a', 'b', 'b'].map((topic, i) => ({ topic, payload: i, ...(i === 4 ? { key: 'k' } : {}) })),
    );
    await s.deliver(true);
    expect(new Set((await s.outbox.retryDead({ topic: 'a' })).ids)).toEqual(
      new Set(inserted.slice(0, 3).map((m) => m.id)),
    );
    expect((await s.outbox.retryDead({ ids: [String(inserted[3]?.id)] })).ids).toEqual([inserted[3]?.id]);
    expect((await s.outbox.retryDead({ key: 'k' })).ids).toEqual([inserted[4]?.id]);
    expect(await s.query('select status, attempts, dead_at::text, last_error from {{messages}}')).toEqual(
      Array.from({ length: 5 }, () => ({
        status: 'pending',
        attempts: 0,
        dead_at: null,
        last_error: 'OUTBOX_NON_RETRYABLE: fixture',
      })),
    );
    await s.deliver();
    expect(await s.query("select count(*)::int4 as n from {{messages}} where status = 'done'")).toEqual([{ n: 5 }]);
    await s.enqueue([
      { topic: 'b', payload: null },
      { topic: 'b', payload: null },
    ]);
    await s.deliver(true);
    expect((await s.outbox.retryDead({ limit: 1 })).ids).toHaveLength(1);
    expect((await s.outbox.listDead()).length).toBe(1);
  });
  it('INT-36 TC-109 purges in bounded batches and ends the dedupe window', async () => {
    const s = await setup();
    for (const count of [1000, 50])
      await s.enqueue(
        Array.from({ length: count }, (_, i) => ({
          topic: 'done',
          payload: null,
          ...(count === 50 && i === 0 ? { dedupeKey: 'reuse' } : {}),
        })),
      );
    await s.deliver();
    await s.enqueue(Array.from({ length: 5 }, () => ({ topic: 'dead', payload: null })));
    await s.deliver(true);
    await s.clock.advance(8 * 86400000);
    await s.enqueue(Array.from({ length: 10 }, () => ({ topic: 'recent', payload: null })));
    await s.deliver();
    await s.enqueue(Array.from({ length: 5 }, () => ({ topic: 'pending', payload: null })));
    const spy = vi.spyOn(driver.adapter, 'query');
    try {
      expect(await s.outbox.purge({ olderThanMs: 7 * 86400000, batchSize: 100 })).toEqual({ deleted: 1050 });
      expect(spy.mock.calls.filter(([sql]) => sql.includes('-- P1:')).length).toBe(11);
    } finally {
      spy.mockRestore();
    }
    expect(
      await s.query('select status, count(*)::int4 as n from {{messages}} group by status order by status'),
    ).toEqual([
      { status: 'dead', n: 5 },
      { status: 'done', n: 10 },
      { status: 'pending', n: 5 },
    ]);
    expect(await s.outbox.purge({ olderThanMs: 7 * 86400000, includeDead: true })).toEqual({ deleted: 5 });
    expect((await s.enqueue([{ topic: 'done', payload: null, dedupeKey: 'reuse' }]))[0]).toMatchObject({
      deduped: false,
    });
  });
  it('INT-38 TC-110 skips only pending or dead messages', async () => {
    const s = await setup();
    const [done] = await s.enqueue([{ topic: 't', payload: null }]);
    await s.deliver();
    const [dead] = await s.enqueue([{ topic: 't', payload: null }]);
    await s.deliver(true);
    const [flight] = await s.enqueue([{ topic: 't', payload: null }]);
    await claim(driver.adapter, s.outbox.config, { relayId: 'ghost', limit: 1, leaseMs: 5000 });
    const [pending] = await s.enqueue([{ topic: 't', payload: null }]);
    for (const [row, status] of [
      [pending, 'pending'],
      [dead, 'dead'],
    ] as const) {
      expect(await s.outbox.skip(String(row?.id))).toEqual({ id: row?.id, previousStatus: status });
    }
    for (const [row, status] of [
      [flight, 'in_flight'],
      [done, 'done'],
    ] as const)
      await expect(s.outbox.skip(String(row?.id))).rejects.toMatchObject({
        code: 'OUTBOX_NOT_SKIPPABLE',
        details: { id: row?.id, status },
      });
    await expect(s.outbox.skip(randomUUID())).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    const spy = vi.spyOn(driver.adapter, 'query');
    try {
      await expect(s.outbox.skip('malformed')).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect(
      await s.query(
        "select status, completed_at is not null as completed, dead_at::text from {{messages}} where status = 'skipped'",
      ),
    ).toEqual([
      { status: 'skipped', completed: true, dead_at: null },
      { status: 'skipped', completed: true, dead_at: null },
    ]);
  });
  it('INT-39 INT-82 TC-111 lists newest dead messages with neutral full fields', async () => {
    const s = await setup();
    await s.query("select setval(pg_get_serial_sequence($1::text, 'seq'), 9007199254740988, true)", [
      s.outbox.config.names.messages,
    ]);
    const inserted = await s.enqueue(
      ['a', 'a', 'a', 'b', 'b'].map((topic, i) => ({
        topic,
        payload: { i },
        headers: { trace: 'fixture' },
        key: 'key',
        dedupeKey: String(i),
      })),
    );
    await s.deliver(true);
    // Distinct database timestamps establish the required ordering without wall-clock waits.
    for (const [i, m] of inserted.entries())
      await s.query(
        "update {{messages}} set dead_at = {{now}} + ($2::int4 * interval '1 second') where id = $1::uuid and status = 'dead'",
        [m.id, i],
      );
    const last = inserted.at(-1);

    expect((await s.outbox.listDead()).map((m) => m.id)).toEqual(inserted.map((m) => m.id).reverse());
    const [message] = await s.outbox.listDead({ topic: 'b', limit: 1 });
    expect(message).toEqual({
      id: last?.id,
      seq: '9007199254740993',
      topic: 'b',
      payload: { i: 4 },
      headers: { trace: 'fixture' },
      key: 'key',
      dedupeKey: '4',
      status: 'dead',
      attempts: 1,
      maxAttempts: 10,
      createdAt: expect.any(Date) as unknown,
      availableAt: expect.any(Date) as unknown,
      lastError: 'OUTBOX_NON_RETRYABLE: fixture',
    });
  });
  it('INT-102 TC-114 rejects invalid admin input before SQL and wraps driver failures', async () => {
    const s = await setup();
    const spy = vi.spyOn(driver.adapter, 'query');
    try {
      await expect(s.outbox.retryDead({ ids: ['bad'] })).rejects.toMatchObject({ code: 'OUTBOX_INVALID_MESSAGE' });
      await expect(s.outbox.purge({ olderThanMs: 0.5, batchSize: 0 })).rejects.toMatchObject({
        code: 'OUTBOX_CONFIG',
        details: { issues: expect.any(Array) as unknown },
      });
      await expect(s.outbox.listDead({ limit: 1001 })).rejects.toMatchObject({ code: 'OUTBOX_CONFIG' });
      expect(spy).not.toHaveBeenCalled();
      const cause = new Error('fixture driver error');
      spy.mockRejectedValueOnce(cause);
      await expect(s.outbox.listDead()).rejects.toMatchObject({
        code: 'OUTBOX_DRIVER',
        cause,
        details: { statement: 'listDead' },
      });
    } finally {
      spy.mockRestore();
    }
  });
});
