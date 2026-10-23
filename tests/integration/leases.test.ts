import { recordingTracer } from '../helpers/tracing.js';
import { spawn } from 'node:child_process';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createOutboxCore } from '../../src/core/outbox.js';
import { claim } from '../../src/core/sql/claim.js';
import { render } from '../../src/core/sql/render.js';
import { testClock } from '../../src/testing.js';
import type { MessageInput, Relay, RelayOptions } from '../../src/core/types.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema, TEST_DATABASE_URL } from '../helpers/db.js';
import { deferred, waitFor, waitForEvent } from '../helpers/wait.js';

describe.each(ADAPTERS)('%s lease recovery', (name) => {
  const driver = createAdapter(name);
  const schemas: Awaited<ReturnType<typeof createTestSchema>>[] = [];
  const relays: Relay[] = [];
  afterAll(async () => {
    for (const relay of relays) await relay.stop();
    await driver.close();
    for (const owned of schemas) await owned.drop();
  });
  async function setup(messages: MessageInput[] = [{ topic: 't', payload: null }]) {
    const owned = await createTestSchema();
    schemas.push(owned);
    const outbox = createOutboxCore(driver.adapter, { schema: owned.schema });
    await outbox.migrate();
    const clock = testClock(outbox);
    await clock.install();
    const inserted = await driver.adapter.transaction((tx) => outbox.enqueue(tx, messages));
    function relay(options: RelayOptions) {
      const result = outbox.createRelay({
        listen: false,
        poll: { minIntervalMs: 10, maxIntervalMs: 50 },
        reclaimIntervalMs: 500,
        ...options,
      });
      relays.push(result);
      return result;
    }
    const inspect = () =>
      driver.adapter.query(
        render(
          'select id::text, status, attempts, last_error, locked_by, completed_at::text from {{messages}} order by seq',
          outbox.config,
        ),
        [],
      );
    return { owned, outbox, clock, inserted, relay, inspect };
  }
  if (name === 'postgres-js')
    it('INT-23 TC-085 recovers a lease after SIGKILL of the relay process', async () => {
      const { owned, clock, inserted, relay: make, inspect } = await setup();
      await owned.admin`create table ${owned.admin(owned.schema)}.t_started (id uuid primary key)`;
      const child = spawn(process.execPath, ['--import', 'tsx', 'tests/helpers/relay-child.ts'], {
        env: {
          ...process.env,
          TEST_DATABASE_URL,
          OUTBOX_TEST_SCHEMA: owned.schema,
          OUTBOX_LEASE_MS: '5000',
          OUTBOX_HANDLER_TIMEOUT_MS: '4000',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '',
        errors = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        errors += chunk.toString();
      });
      const exited = new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', () => {
          resolve();
        });
      });
      try {
        await waitFor(async () => {
          if (child.exitCode !== null) throw new Error('Child exited: ' + errors);
          return (await owned.admin`select id from ${owned.admin(owned.schema)}.t_started`).length === 1;
        });
        const info = JSON.parse(output.trim()) as { relayId: string };
        expect(info.relayId).toBeTypeOf('string');
        child.kill('SIGKILL');
        await exited;
        await clock.advance(6000);
        const target = vi.fn(() => Promise.resolve());
        const relay = make({ handlers: { t: target } });
        const reclaimed = waitForEvent(relay, 'reclaimed');
        const delivered = waitForEvent(relay, 'delivered');
        await relay.start();
        expect((await reclaimed).ids).toEqual([inserted[0]?.id]);
        await delivered;
        await relay.stop();
        expect(target).toHaveBeenCalledTimes(1);
        const [row] = await inspect();
        expect(row).toMatchObject({ status: 'done', attempts: 2, locked_by: null });
        expect(row?.['last_error']).toMatch('OUTBOX_LEASE_EXPIRED: lease held by ' + info.relayId);
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await exited;
      }
    });
  it('INT-24 TC-086 TC-135 fences a late completion after another relay completes the newer attempt', async () => {
    const { outbox, clock, relay: make, inspect } = await setup();
    const gate = deferred<undefined>(),
      started = deferred<undefined>();
    const { tracer, spans } = recordingTracer();
    const a = make({
      tracer,
      leaseMs: 120000,
      handlerTimeoutMs: 110000,
      publisher: async () => {
        started.resolve(undefined);
        await gate.promise;
      },
    });
    const deliveredA = vi.fn();
    a.on('delivered', deliveredA);
    const running = a.runOnce();
    try {
      await started.promise;
      await clock.advance(121000);
      let holder: unknown;
      const b = make({
        publisher: async (message) => {
          holder = (
            await driver.adapter.query(
              render('select locked_by, attempts from {{messages}} where id = $1::uuid', outbox.config),
              [message.id],
            )
          )[0];
        },
      });
      expect(await b.runOnce()).toMatchObject({ reclaimed: 1, delivered: 1 });
      expect(holder).toEqual({ locked_by: b.id, attempts: 2 });
      const before = await inspect();
      const lost = waitForEvent(a, 'leaseLost');
      gate.resolve(undefined);
      expect(await running).toMatchObject({ delivered: 0, leaseLost: 1 });
      expect(await lost).toMatchObject({ outcome: 'done', attempt: 1 });
      const flushes = spans.filter((span) => span.name === 'outbox flush');
      expect(flushes.reduce((sum, span) => sum + Number(span.attributes['outbox.lease_lost']), 0)).toBe(1);
      expect(flushes.reduce((sum, span) => sum + Number(span.attributes['outbox.completed']), 0)).toBe(0);
      expect(deliveredA).not.toHaveBeenCalled();
      expect(await inspect()).toEqual(before);
      expect(before[0]).toMatchObject({ status: 'done', attempts: 2 });
    } finally {
      gate.resolve(undefined);
      await running;
    }
  });
  it('INT-25 TC-087 reclaims a ghost claim at startup before delivering', async () => {
    const { outbox, clock, inserted, relay: make, inspect } = await setup();
    await claim(driver.adapter, outbox.config, { relayId: 'ghost', limit: 1, leaseMs: 5000 });
    await clock.advance(5001);
    const target = vi.fn(() => Promise.resolve());
    const relay = make({ publisher: target });
    const reclaimed = waitForEvent(relay, 'reclaimed');
    const delivered = waitForEvent(relay, 'delivered');
    await relay.start();
    expect((await reclaimed).ids).toEqual([inserted[0]?.id]);
    await delivered;
    await relay.stop();
    expect(target).toHaveBeenCalledTimes(1);
    expect((await inspect())[0]).toMatchObject({ status: 'done', attempts: 2 });
  });
  it('INT-100 TC-101 periodically reclaims full batches and reports exhausted leases as dead', async () => {
    const {
      outbox,
      clock,
      relay: make,
      inspect,
    } = await setup(Array.from({ length: 5 }, (_, i) => ({ topic: 't', payload: null, maxAttempts: i === 0 ? 1 : 5 })));
    await claim(driver.adapter, outbox.config, { relayId: 'ghost', limit: 5, leaseMs: 5000 });
    const relay = make({ publisher: () => Promise.resolve(), reclaimBatchSize: 2 });
    const reclaimed: string[] = [],
      dead: string[] = [],
      deadIds: string[] = [],
      delivered: string[] = [];
    const batches: number[] = [];
    relay.on('reclaimed', (event) => {
      reclaimed.push(...event.ids);
      deadIds.push(...event.deadIds);
      batches.push(event.count);
    });
    relay.on('dead', (event) => {
      dead.push(event.message.id);
    });
    relay.on('delivered', (event) => {
      delivered.push(event.message.id);
    });
    await relay.start();
    expect(reclaimed).toEqual([]);
    await clock.advance(5001);
    await waitFor(() => delivered.length === 4 && dead.length === 1);
    await relay.stop();
    expect(batches.every((count) => count <= 2)).toBe(true);
    expect(deadIds).toEqual(dead);
    expect(new Set(reclaimed).size).toBe(5);
    expect(reclaimed).toHaveLength(5);
    expect((await inspect()).map((row) => [row['status'], row['attempts']])).toEqual([
      ['dead', 1],
      ['done', 2],
      ['done', 2],
      ['done', 2],
      ['done', 2],
    ]);
  });
});
