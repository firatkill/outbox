import { createHash } from 'node:crypto';
import { m0001Initial } from './0001_initial.js';

/** Immutable, numbered schema change. Add new versions instead of editing released templates. */
export interface Migration {
  /** Contiguous version starting at one. */
  version: number;
  /** Snake-case migration name. */
  name: string;
  /** LF-normalized SQL template without BEGIN/COMMIT. */
  template: string;
}

/** Ordered migrations shipped by this library. */
export const MIGRATIONS: readonly Migration[] = [m0001Initial];
/** Minimum schema version required by the current implementation. */
export const REQUIRED_SCHEMA_VERSION = 1;

/** Hash the template, independent of the configured schema or prefix.
 * @example
 * migrationChecksum(migration.template);
 */
export function migrationChecksum(template: string): string {
  return createHash('sha256').update(template.replaceAll('\r\n', '\n')).digest('hex');
}
