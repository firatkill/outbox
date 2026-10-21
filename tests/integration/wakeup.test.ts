import { afterAll, describe, expect, it } from 'vitest';
import { createOutboxCore } from '../../src/core/outbox.js';
import type { DriverAdapter, Relay, SqlExecutor } from '../../src/core/types.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { createTestSchema } from '../helpers/db.js';
import { deferred, waitFor } from '../helpers/wait.js';

describe.each(ADAPTERS)('%s notification wake-up', (name) => {
  const pools: ReturnType<typeof createAdapter>[] = [];
  const schemas: Awaited<ReturnType<typeof createTestSchema>>[] = [];
  const relays: Relay[] = [];
  afterAll(async () => {
    for (const relay of relays) await relay.stop();
    for (const pool of pools) await pool.close();
    for (const owned of schemas) await owned.drop();
  });
  async function setup() {
    const owned = await createTestSchema();
    schemas.push(owned);
    const pool = createAdapter(name, { applicationName: owned.schema + '_main' });
    pools.push(pool);
    const outbox = createOutboxCore(pool.adapter, { schema: owned.schema });
    await outbox.migrate();
    return { owned, pool, outbox };
  }
  it('INT-52 TC-123 reconnects the terminated listen backend and wakes polling', async () => {
    const { owned, pool, outbox } = await setup();
    let notifications = 0,
      reconnects = 0,
      errors = 0,
      deliveries = 0;
    const listen = pool.adapter.listen?.bind(pool.adapter);
    if (!listen) throw new Error('missing listener');
    const wrapped = {
      ...pool.adapter,
      listen: (channel: string, notify: () => void, reconnect: () => void, error: (err: unknown) => void) =>
        listen(
          channel,
          () => {
            notifications++;
            notify();
          },
          () => {
            reconnects++;
            reconnect();
          },
          error,
        ),
    };
    const relay = createOutboxCore(wrapped, { schema: owned.schema }).createRelay({
      listen: true,
      poll: { minIntervalMs: 5000, maxIntervalMs: 5000 },
      publisher: () => {
        deliveries++;
        return Promise.resolve();
      },
    });
    relays.push(relay);
    relay.on('error', (event) => {
      if (event.phase === 'listen') errors++;
    });
    await relay.start();
    const backends =
      await owned.admin`select pid from pg_stat_activity where application_name = ${owned.schema + '_main'} and query ilike 'listen%'`;
    expect(backends).toHaveLength(1);
    const pid = Number(backends[0]?.['pid']);
    await owned.admin`select pg_terminate_backend(${pid})`;
    await pool.adapter.transaction((tx) => outbox.enqueue(tx, { topic: 't', payload: null }));
    // Specified two-second recovery bound includes the adapter's one-second reconnect backoff.
    await waitFor(() => deliveries === 1 && reconnects > 0, { timeoutMs: 2000 });
    if (name === 'pg') expect(errors).toBeGreaterThan(0);
    expect(relay.state).toBe('running');
    await relay.stop();
    if (name === 'pg') {
      expect(
        await owned.admin`select pid from pg_stat_activity where application_name = ${owned.schema + '_main'} and query ilike 'listen%'`,
      ).toHaveLength(0);
    }
    // D-74: postgres.js can retain its replacement subscription after reconnect.
    // A closed adapter must suppress callbacks even when the driver still receives notifications.
    const atStop = notifications;
    await pool.adapter.query('select pg_notify($1::text, $2::text)', [outbox.config.channel, '']);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(notifications).toBe(atStop);
  });
  it('INT-54 TC-124 sends statements to pool A and listens through pool B', async () => {
    const { owned, pool, outbox } = await setup();
    const a = createAdapter(name, { applicationName: owned.schema + '_a' });
    const b = createAdapter(name, { applicationName: owned.schema + '_b' });
    pools.push(a, b);
    const statementApps: unknown[] = [];
    const original: DriverAdapter<unknown, SqlExecutor> = {
      ...pool.adapter,
      withDb: (db) => {
        const selected = pool.adapter.withDb(db);
        return {
          ...selected,
          query: async (text, params) => {
            statementApps.push(
              (await selected.query("select current_setting('application_name') as app", []))[0]?.['app'],
            );
            return selected.query(text, params);
          },
        };
      },
    };
    let delivered = 0;
    const relay = createOutboxCore(original, { schema: owned.schema }).createRelay({
      db: a.adapter.db,
      listen: { db: b.adapter.db },
      poll: { minIntervalMs: 5000, maxIntervalMs: 5000 },
      publisher: () => {
        delivered++;
        return Promise.resolve();
      },
    });
    relays.push(relay);
    await relay.start();
    const listeners =
      await owned.admin`select application_name from pg_stat_activity where application_name in (${owned.schema + '_a'}, ${owned.schema + '_b'}) and query ilike 'listen%'`;
    expect(listeners).toEqual([{ application_name: owned.schema + '_b' }]);
    await pool.adapter.transaction((tx) => outbox.enqueue(tx, { topic: 't', payload: null }));
    await waitFor(() => delivered === 1, { timeoutMs: 1000 });
    await relay.stop();
    expect(statementApps.length).toBeGreaterThan(0);
    expect(new Set(statementApps)).toEqual(new Set([owned.schema + '_a']));
    // Shutdown returns listener ownership without ending either caller-owned pool.
    expect(await a.adapter.query('select 1::int4 as n', [])).toEqual([{ n: 1 }]);
    expect(await b.adapter.query('select 1::int4 as n', [])).toEqual([{ n: 1 }]);
  });
  it('INT-104 TC-128 retries an initial listen failure while polling stays available', async () => {
    const { owned, pool } = await setup();
    const listen = pool.adapter.listen?.bind(pool.adapter);
    if (!listen) throw new Error('missing listener');
    let openings = 0,
      delivered = 0;
    const errors: unknown[] = [];
    const adapter = {
      ...pool.adapter,
      listen: async (...args: Parameters<typeof listen>) => {
        if (++openings === 1) throw new Error('initial listen failure fixture');
        return listen(...args);
      },
    };
    const outbox = createOutboxCore(adapter, { schema: owned.schema, notify: false });
    const relay = outbox.createRelay({
      poll: { minIntervalMs: 5000, maxIntervalMs: 5000 },
      publisher: () => {
        delivered++;
        return Promise.resolve();
      },
    });
    relays.push(relay);
    relay.on('error', (event) => {
      if (event.phase === 'listen') errors.push(event.error);
    });
    await relay.start();
    expect(relay.state).toBe('running');
    expect(errors).toHaveLength(1);
    await pool.adapter.transaction((tx) => outbox.enqueue(tx, { topic: 't', payload: null }));
    await waitFor(() => openings === 2 && delivered === 1, { timeoutMs: 2000 });
    await relay.stop();
  });
  it('INT-104 TC-128 closes a listen handle that finishes opening during stop', async () => {
    const { owned, pool } = await setup();
    const listen = pool.adapter.listen?.bind(pool.adapter);
    if (!listen) throw new Error('missing listener');
    const entered = deferred<undefined>(),
      release = deferred<undefined>();
    let closes = 0;
    const adapter = {
      ...pool.adapter,
      listen: async (...args: Parameters<typeof listen>) => {
        entered.resolve(undefined);
        await release.promise;
        const handle = await listen(...args);
        return {
          close: async () => {
            closes++;
            await handle.close();
          },
        };
      },
    };
    const relay = createOutboxCore(adapter, { schema: owned.schema }).createRelay({
      publisher: () => Promise.resolve(),
    });
    relays.push(relay);
    const starting = relay.start();
    await entered.promise;
    const stopping = relay.stop();
    release.resolve(undefined);
    await starting;
    await stopping;
    expect(closes).toBe(1);
    expect(relay.state).toBe('stopped');
  });
});
