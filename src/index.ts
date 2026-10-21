/** The library version, inlined at build time. */
export const VERSION: string = __OUTBOX_VERSION__;

export { migrationSql, MIGRATIONS, REQUIRED_SCHEMA_VERSION } from './core/migrations/index.js';
export {
  OutboxError,
  RetryableError,
  NonRetryableError,
  isOutboxError,
  isRetryableError,
  isNonRetryableError,
} from './core/errors.js';
export type { OutboxErrorCode } from './core/errors.js';
export type * from './core/types.js';

export { createOutboxCore } from './core/outbox.js';
