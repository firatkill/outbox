import { createOutboxCore } from '../../src/core/outbox.js';
import type { Relay } from '../../src/core/types.js';
import { render } from '../../src/core/sql/render.js';
import { createAdapter } from './adapters.js';
import type { AdapterName } from './adapters.js';
import { createTestSchema } from './db.js';
import { waitFor } from './wait.js';

/** Run the TRD INT-22 workload with independent pools, including the INT-81 reduced variant. */
export async function concurrentScenario(name: AdapterName, count: number, prepare = true) {
  const owned = await createTestSchema();
  const producer = createAdapter(name, { max: 4, prepare });
  const pools = Array.from({ length: 4 }, (_, i) =>
    createAdapter(name, { max: 4, prepare, applicationName: owned.schema + '_r' + String(i) }),
  );
  const relays: Relay[] = [];
  const seen = new Map<string, number>();
  const delivered = [0, 0, 0, 0];
  let leaseLost = 0,
    reclaimed = 0;
  try {
    const outbox = createOutboxCore(producer.adapter, { schema: owned.schema });
    await outbox.migrate();
    for (let i = 0; i < count; i += 1000) {
      await producer.adapter.transaction((tx) =>
        outbox.enqueue(
          tx,
          Array.from({ length: Math.min(1000, count - i) }, (_, j) => ({
            topic: 'topic.' + String((i + j) % 10),
            payload: { index: i + j },
          })),
        ),
      );
    }
    for (const [index, pool] of pools.entries()) {
      const relay = createOutboxCore(pool.adapter, { schema: owned.schema }).createRelay({
        listen: false,
        concurrency: 50,
        batchSize: 50,
        publisher: async (message) => {
          seen.set(message.id, (seen.get(message.id) ?? 0) + 1);
          // The TRD workload explicitly includes random 0–2ms handler work.
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 3)));
        },
      });
      relay.on('delivered', () => {
        delivered[index] = (delivered[index] ?? 0) + 1;
      });
      relay.on('leaseLost', () => {
        leaseLost++;
      });
      relay.on('reclaimed', (event) => {
        reclaimed += event.count;
      });
      relays.push(relay);
    }
    const start = performance.now();
    await Promise.all(relays.map((relay) => relay.start()));
    // 10,000 real deliveries (or the specified 1,000-message prepare:false variant).
    await waitFor(() => delivered.reduce((a, b) => a + b, 0) === count, { timeoutMs: 60000 });
    const durationMs = performance.now() - start;
    await Promise.all(relays.map((relay) => relay.stop()));
    const rows = await producer.adapter.query(
      render(
        'select status, attempts, count(*)::int4 as count from {{messages}} group by status, attempts',
        outbox.config,
      ),
      [],
    );
    return { seen, delivered, leaseLost, reclaimed, rows, durationMs };
  } finally {
    await Promise.all(relays.map((relay) => relay.stop()));
    await Promise.all(pools.map((pool) => pool.close()));
    await producer.close();
    await owned.drop();
  }
}
