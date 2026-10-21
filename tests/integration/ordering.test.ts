import { afterAll, describe, expect, it } from 'vitest';
import { NonRetryableError } from '../../src/core/errors.js';
import { createOutboxCore } from '../../src/core/outbox.js';
import { render } from '../../src/core/sql/render.js';
import type { MessageInput, Relay, RelayOptions } from '../../src/core/types.js';
import { testClock } from '../../src/testing.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema } from '../helpers/db.js';

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
});
