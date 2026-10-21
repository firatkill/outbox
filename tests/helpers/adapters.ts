import postgres from 'postgres';
import { createPostgresJsAdapter } from '../../src/adapters/postgres-js.js';
import { TEST_DATABASE_URL } from './db.js';

export const ADAPTERS = ['postgres-js'] as const;
export function createAdapter() {
  const db = postgres(TEST_DATABASE_URL, { max: 5, onnotice: () => undefined });
  return { adapter: createPostgresJsAdapter(db), close: () => db.end() };
}
