import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { NonRetryableError } from '../../src/core/errors.js';
import { createOutboxCore } from '../../src/core/outbox.js';
import { render } from '../../src/core/sql/render.js';
import type { MessageInput, Relay, RelayOptions } from '../../src/core/types.js';
import { testClock } from '../../src/testing.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema } from '../helpers/db.js';
import { waitFor } from '../helpers/wait.js';

describe.each(ADAPTERS)('%s per-key ordering', (name) => {
  const driver = createAdapter(name);
  const schemas: Awaited<ReturnType<typeof createTestSchema>>[] = [];
  const relays: Relay[] = [];
  afterAll(async () => {
    for (const relay of relays) await relay.stop();
    await driver.close();
    for (const schema of schemas) await schema.drop();
  });
  async function setup() {
    const owned = await createTestSchema();
    schemas.push(owned);
    const outbox = createOutboxCore(driver.adapter, { schema: owned.schema });
    await outbox.migrate();
    const clock = testClock(outbox);
    await clock.install();
    function relay(options: RelayOptions) {
      const result = outbox.createRelay({ listen: false, ordering: 'key', concurrency: 10, ...options });
      relays.push(result);
      return result;
    }
    const enqueue = (messages: MessageInput[]) => driver.adapter.transaction((tx) => outbox.enqueue(tx, messages));
    const rows = () =>
      driver.adapter.query(
        render('select id::text, seq::text, status, attempts from {{messages}} m order by m.seq', outbox.config),
        [],
      );
    return { outbox, clock, relay, enqueue, rows };
  }
  it('INT-40 TC-116 delivers five same-key messages in seq order with one active handler', async () => {
    const s = await setup();
    await s.enqueue(Array.from({ length: 5 }, () => ({ topic: 't', key: 'k', payload: null })));
    const expected = (await s.rows()).map((r) => r['id']);
    const seen: string[] = [];
    let active = 0,
      maximum = 0;
    const relay = s.relay({
      publisher: async (m) => {
        maximum = Math.max(maximum, ++active);
        seen.push(m.id);
        await Promise.resolve();
        active--;
      },
    });
    for (let i = 0; i < 5; i++) expect((await relay.runOnce()).delivered).toBe(1);
    expect((await relay.runOnce()).claimed).toBe(0);
    expect(seen).toEqual(expected);
    expect(maximum).toBe(1);
  });
  it('INT-42 TC-117 blocks the next message during backoff while another key progresses', async () => {
    const s = await setup();
    const inserted = await s.enqueue(['k', 'k', 'j', 'j', 'j'].map((key) => ({ topic: 't', key, payload: null })));
    const head = inserted[0]?.id;
    const seen: string[] = [];
    let failed = false;
    const relay = s.relay({
      retry: { baseDelayMs: 10000, jitter: 'none' },
      publisher: (m) => {
        if (m.id === head && !failed) {
          failed = true;
          throw new Error('retry');
        }
        seen.push(m.id);
        return Promise.resolve();
      },
    });
    for (let i = 0; i < 3; i++) await relay.runOnce();
    expect(seen).toEqual(inserted.slice(2).map((m) => m.id));
    expect((await relay.runOnce()).claimed).toBe(0);
    await s.clock.advance(10000);
    await relay.runOnce();
    await relay.runOnce();
    expect(seen.slice(-2)).toEqual(inserted.slice(0, 2).map((m) => m.id));
  });
  it.each(['skip', 'retry'] as const)('INT-43 TC-118 keeps a dead head blocking until %s', async (action) => {
    const s = await setup();
    const inserted = await s.enqueue(Array.from({ length: 3 }, () => ({ topic: 't', key: 'k', payload: null })));
    const head = inserted[0]?.id;
    if (!head) throw new Error('missing fixture');
    let reject = true;
    const seen: string[] = [];
    const relay = s.relay({
      publisher: (m) => {
        if (reject) throw new NonRetryableError('dead head');
        seen.push(m.id);
        return Promise.resolve();
      },
    });
    expect((await relay.runOnce()).dead).toBe(1);
    for (let i = 0; i < 3; i++) expect((await relay.runOnce()).claimed).toBe(0);
    reject = false;
    if (action === 'skip') await s.outbox.skip(head);
    else expect(await s.outbox.retryDead({ ids: [head] })).toEqual({ ids: [head] });
    for (let i = 0; i < 3; i++) await relay.runOnce();
    expect(seen).toEqual(inserted.slice(action === 'skip' ? 1 : 0).map((m) => m.id));
    expect((await s.rows())[0]?.['status']).toBe(action === 'skip' ? 'skipped' : 'done');
  });
  it('INT-44 TC-119 delivers unkeyed messages and other keys past a dead head', async () => {
    const s = await setup();
    const blocked = await s.enqueue(['k', 'k'].map((key) => ({ topic: 't', key, payload: null })));
    const relay = s.relay({
      publisher: (m) => {
        if (m.key === 'k') throw new NonRetryableError('blocked');
        return Promise.resolve();
      },
    });
    await relay.runOnce();
    await s.enqueue(
      Array.from({ length: 20 }, (_, i) => ({
        topic: 't',
        payload: null,
        ...(i < 10 ? {} : { key: `other-${String(i)}` }),
      })),
    );
    let delivered = 0;
    for (let i = 0; i < 3; i++) delivered += (await relay.runOnce()).delivered;
    expect(delivered).toBe(20);
    const rows = await s.rows();
    expect(rows[0]).toMatchObject({ id: blocked[0]?.id, status: 'dead', attempts: 1 });
    expect(rows[1]).toMatchObject({ id: blocked[1]?.id, status: 'pending', attempts: 0 });
  });
  it('INT-45 TC-120 respects earlier messages outside the topic filter', async () => {
    const s = await setup();
    const first = await s.enqueue([{ topic: 'order.created', key: 'order-1', payload: null }]);
    const second = await s.enqueue([{ topic: 'order.paid', key: 'order-1', payload: null }]);
    const seen: string[] = [];
    const handler = (m: { id: string }) => {
      seen.push(m.id);
      return Promise.resolve();
    };
    const a = s.relay({ handlers: { 'order.paid': handler } });
    const b = s.relay({ handlers: { 'order.created': handler } });
    expect((await a.runOnce()).claimed).toBe(0);
    expect((await b.runOnce()).delivered).toBe(1);
    expect((await a.runOnce()).delivered).toBe(1);
    expect(seen).toEqual([first[0]?.id, second[0]?.id]);
  });
  // 6,000 deliveries with per-key serialisation; allow setup/cleanup around the 60s delivery bound.
  it('INT-41 TC-121 preserves ordering across four concurrent relays', async () => {
    const owned = await createTestSchema();
    const producer = createAdapter(name);
    const workers = Array.from({ length: 4 }, () => createAdapter(name, { max: 4 }));
    const running: Relay[] = [];
    const active = new Map<string, number>();
    const maxima = new Map<string, number>();
    const seen = new Map<string, number>();
    let delivered = 0;
    try {
      // Deliberately no test clock: INV-08 compares real database timestamps.
      const outbox = createOutboxCore(producer.adapter, { schema: owned.schema });
      await outbox.migrate();
      await producer.adapter.query(
        `create table "${owned.schema}".chaos_deliveries (message_id uuid not null, started_at timestamptz not null default clock_timestamp())`,
        [],
      );
      const messages: MessageInput[] = [];
      for (let round = 0; round < 25; round++) {
        for (let key = 0; key < 200; key++) {
          messages.push({ topic: 't', key: 'k' + String(key), payload: null });
          if (key % 5 === 0) messages.push({ topic: 't', payload: null });
        }
      }
      for (let offset = 0; offset < messages.length; offset += 1000)
        await producer.adapter.transaction((tx) => outbox.enqueue(tx, messages.slice(offset, offset + 1000)));
      for (const worker of workers) {
        const relay = createOutboxCore(worker.adapter, { schema: owned.schema }).createRelay({
          ordering: 'key',
          listen: false,
          concurrency: 20,
          batchSize: 20,
          publisher: async (m) => {
            seen.set(m.id, (seen.get(m.id) ?? 0) + 1);
            if (m.key !== null) {
              const count = (active.get(m.key) ?? 0) + 1;
              active.set(m.key, count);
              maxima.set(m.key, Math.max(maxima.get(m.key) ?? 0, count));
            }
            try {
              await worker.adapter.query(
                `insert into "${owned.schema}".chaos_deliveries (message_id) values ($1::uuid)`,
                [m.id],
              );
              // Normative INT-41 simulated handler latency, not a readiness wait.
              await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 6)));
            } finally {
              if (m.key !== null) active.set(m.key, (active.get(m.key) ?? 1) - 1);
            }
          },
        });
        relay.on('delivered', () => {
          delivered++;
        });
        running.push(relay);
      }
      const started = performance.now();
      await Promise.all(running.map((r) => r.start()));
      // 6,000 deliveries with per-key serialisation require a real workload deadline.
      await waitFor(() => delivered === 6000, { timeoutMs: 60000 });
      expect(performance.now() - started).toBeLessThan(60000);
      await Promise.all(running.map((r) => r.stop()));
      expect(seen.size).toBe(6000);
      expect([...seen.values()].every((n) => n === 1)).toBe(true);
      expect(maxima.size).toBe(200);
      expect([...maxima.values()].every((n) => n === 1)).toBe(true);
      const counts = await producer.adapter.query(
        render(
          "select count(*)::int4 as total, count(*) filter (where key is null)::int4 as unkeyed from {{messages}} where status = 'done' and attempts = 1",
          outbox.config,
        ),
        [],
      );
      expect(counts).toEqual([{ total: 6000, unkeyed: 1000 }]);
      const invariant = readFileSync(new URL('../../scripts/chaos/invariants.sql', import.meta.url), 'utf8');
      expect(await producer.adapter.query(render(invariant, outbox.config), [])).toEqual([]);
      // Assert first-start ordering separately from the completion fence invariant.
      const starts = await producer.adapter.query(
        render(
          `with firsts as (
        select message_id, min(started_at) as started_at from {{schema}}.chaos_deliveries group by message_id
      ), ordered as (
        select m.id, f.started_at, lag(f.started_at) over (partition by m.key order by m.seq) as previous_start
        from {{messages}} m join firsts f on f.message_id = m.id where m.key is not null
      ) select id::text from ordered where started_at <= previous_start`,
          outbox.config,
        ),
        [],
      );
      expect(starts).toEqual([]);
    } finally {
      await Promise.all(running.map((r) => r.stop()));
      await Promise.all(workers.map((w) => w.close()));
      await producer.close();
      await owned.drop();
    }
  }, 120000);
});
