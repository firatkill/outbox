import postgres from 'postgres';
import { createOutbox } from '../../src/postgres-js.js';

const url = process.env['TEST_DATABASE_URL'];
const schema = process.env['OUTBOX_TEST_SCHEMA'];
if (!url || !schema || !/^t_[a-f0-9]+$/.test(schema)) throw new Error('Missing child test configuration');
const db = postgres(url, { max: 2, onnotice: () => undefined });
const outbox = createOutbox({ db, schema });
const relay = outbox.createRelay({
  listen: false,
  leaseMs: Number(process.env['OUTBOX_LEASE_MS'] ?? 5000),
  handlerTimeoutMs: Number(process.env['OUTBOX_HANDLER_TIMEOUT_MS'] ?? 4000),
  handlers: {
    t: async (message, ctx) => {
      await db.unsafe(`insert into "${schema}".t_started (id) values ($1::uuid)`, [message.id]);
      await new Promise<void>((resolve) => {
        ctx.signal.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
    },
  },
});
console.log(JSON.stringify({ relayId: relay.id }));
await relay.start();
