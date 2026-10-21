import { describe, expect, it } from 'vitest';
import { createOutboxCore } from '../../src/core/outbox.js';
import { render } from '../../src/core/sql/render.js';
import { ADAPTERS, createAdapter } from '../helpers/adapters.js';
import { concurrentScenario } from '../helpers/concurrency.js';
import { createTestSchema } from '../helpers/db.js';
import { deferred, waitFor } from '../helpers/wait.js';

describe.each(ADAPTERS)('%s concurrency and resilience', (name) => {
  // 10,000 real deliveries across four independent relay pools, with a 60s completion bound.
  it('INT-22 TC-093 delivers 10000 messages once across four concurrent relays', async () => {
    const result = await concurrentScenario(name, 10000);
    expect(result.seen.size).toBe(10000);
    expect([...result.seen.values()].every((count) => count === 1)).toBe(true);
    expect(result.rows).toEqual([{ status: 'done', attempts: 1, count: 10000 }]);
    expect(result.delivered.every((count) => count >= 100)).toBe(true);
    expect(result.leaseLost).toBe(0);
    expect(result.reclaimed).toBe(0);
    expect(result.durationMs).toBeLessThan(60000);
  }, 120000);
  // Allow setup and cleanup around the specified 30s reconnect-backoff completion bound.
  it('INT-29 TC-094 recovers while only its own backend connections are terminated', async () => {
    const owned = await createTestSchema();
    const producer = createAdapter(name);
    const app = owned.schema + '_relay';
    const worker = createAdapter(name, { max: 4, applicationName: app });
    const outbox = createOutboxCore(producer.adapter, { schema: owned.schema });
    const relay = createOutboxCore(worker.adapter, { schema: owned.schema }).createRelay({
      listen: false,
      // An unknown claim result can retain a lease; recovery must fit the specified 30s bound.
      leaseMs: 5000,
      handlerTimeoutMs: 4000,
      reclaimIntervalMs: 500,
      publisher: async () => {
        // Keep the 2,000-message workload active throughout the specified fault-injection window.
        await new Promise((resolve) => setTimeout(resolve, 10));
      },
    });
    let timer: ReturnType<typeof setInterval> | undefined;
    const kills: Promise<unknown>[] = [];
    const phases: string[] = [];
    relay.on('error', (event) => {
      phases.push(event.phase);
    });
    try {
      await outbox.migrate();
      for (let i = 0; i < 2; i++)
        await producer.adapter.transaction((tx) =>
          outbox.enqueue(
            tx,
            Array.from({ length: 1000 }, () => ({ topic: 't', payload: null })),
          ),
        );
      await relay.start();
      let ticks = 0;
      const ended = deferred<undefined>();
      timer = setInterval(() => {
        const query = owned.admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and application_name = ${app}`;
        kills.push(Promise.resolve(query));
        if (++ticks === 10) {
          clearInterval(timer);
          void Promise.all(kills).then(() => {
            ended.resolve(undefined);
          }, ended.reject);
        }
      }, 200);
      await ended.promise;
      // Reconnect backoff after two seconds of deliberate connection loss.
      await waitFor(
        async () =>
          (
            await producer.adapter.query(
              render("select count(*)::int4 as count from {{messages}} where status = 'done'", outbox.config),
              [],
            )
          )[0]?.['count'] === 2000,
        { timeoutMs: 30000 },
      );
      expect(phases.some((phase) => phase === 'claim' || phase === 'flush')).toBe(true);
      expect(relay.state).toBe('running');
    } finally {
      clearInterval(timer);
      await Promise.allSettled(kills);
      await relay.stop();
      await worker.close();
      await producer.close();
      await owned.drop();
    }
  }, 60000);
});
