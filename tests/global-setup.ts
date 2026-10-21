import postgres from 'postgres';
import { TEST_DATABASE_URL } from './helpers/db.js';

export default async function setup(): Promise<void> {
  const target = new URL(TEST_DATABASE_URL);
  const database = decodeURIComponent(target.pathname.slice(1));
  const adminUrl = new URL(target);
  adminUrl.pathname = '/postgres';
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => undefined });
  try {
    // Session lock serializes database creation across the two T-02 harness runs.
    await admin`select pg_advisory_lock(hashtextextended(${`outbox:test-db:${database}`}, 0))`;
    const found = await admin`select 1 from pg_database where datname = ${database}`;
    if (found.length === 0) await admin`create database ${admin(database)}`;
  } finally {
    await admin.end(); // Also releases the session advisory lock.
  }
  const sql = postgres(TEST_DATABASE_URL, { max: 1 });
  try {
    const rows = await sql`show server_version`;
    console.log(`PostgreSQL ${String(rows[0]?.['server_version'])}`);
  } finally {
    await sql.end();
  }
}
