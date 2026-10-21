import { randomBytes } from 'node:crypto';
import postgres from 'postgres';

export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:54317/outbox_test';

/** A schema owned by one test file. Cleanup is restricted to the generated name. */
export async function createTestSchema() {
  const schema = `t_${randomBytes(4).toString('hex')}`;
  const admin = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => undefined });
  try {
    await admin`create schema ${admin(schema)}`;
  } catch (error) {
    await admin.end();
    throw error;
  }
  let dropped = false;
  return {
    schema,
    admin,
    async drop(): Promise<void> {
      if (dropped) return;
      try {
        await admin`drop schema ${admin(schema)} cascade`;
        dropped = true;
      } finally {
        await admin.end();
      }
    },
  };
}
