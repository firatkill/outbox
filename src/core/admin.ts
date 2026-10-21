import { S1, S2 } from './sql/stats.js';
import type { ParsedAdminOptions } from './admin-options.js';
import { isUuid, parseAdminOptions } from './admin-options.js';
import { OutboxError } from './errors.js';
import { dateFromEpoch, mapMessageRow } from './row.js';
import { LIST_DEAD, PURGE_DEAD, PURGE_INBOX, PURGE_TERMINAL, RETRY_DEAD, SKIP } from './sql/admin.js';
import { render } from './sql/render.js';
import type { Outbox, ResolvedOutboxConfig, SqlExecutor, SqlParam } from './types.js';

/** Execute an admin statement with the stable driver-error envelope. */
export async function adminQuery(
  executor: SqlExecutor,
  config: ResolvedOutboxConfig,
  statement: string,
  sql: string,
  params: readonly SqlParam[],
) {
  try {
    return await executor.query(render(sql, config), params);
  } catch (cause) {
    if (
      statement === 'stats' &&
      typeof cause === 'object' &&
      cause !== null &&
      'code' in cause &&
      cause.code === '42P01'
    )
      throw new OutboxError(
        'OUTBOX_NOT_MIGRATED',
        'Run: npx outbox migrate --schema ' + config.schema + ' --prefix ' + config.tablePrefix,
        { cause },
      );
    throw new OutboxError('OUTBOX_DRIVER', 'Admin statement failed: ' + statement, { cause, details: { statement } });
  }
}
/** Bind administrative operations to their autocommit executor. */
export function createAdmin(
  executor: SqlExecutor,
  config: ResolvedOutboxConfig,
): Pick<Outbox<unknown>, 'retryDead' | 'skip' | 'purge' | 'purgeInbox' | 'listDead'> {
  const query = (statement: string, sql: string, params: readonly SqlParam[]) =>
    adminQuery(executor, config, statement, sql, params);
  async function purgeBatches(statement: string, sql: string, options: ParsedAdminOptions): Promise<number> {
    let total = 0;
    for (;;) {
      const rows = await query(statement, sql, [options.olderThanMs ?? 0, options.batchSize ?? 5000]);
      const count = rows[0]?.['deleted'];
      if (typeof count !== 'number') throw new OutboxError('OUTBOX_INTERNAL', 'Invalid purge count. Please report.');
      total += count;
      if (count < Number(options.batchSize)) return total;
    }
  }
  return {
    async retryDead(input) {
      const options = parseAdminOptions('retryDead', input);
      const rows = await query('retryDead', RETRY_DEAD, [
        options.ids === undefined ? null : JSON.stringify(options.ids),
        options.topic ?? null,
        options.key ?? null,
        options.limit ?? 1000,
      ]);
      return {
        ids: rows.map((row) => {
          if (typeof row['id'] !== 'string')
            throw new OutboxError('OUTBOX_INTERNAL', 'Invalid retry id. Please report.');
          return row['id'];
        }),
      };
    },
    async skip(id) {
      const notFound = () => new OutboxError('OUTBOX_NOT_FOUND', 'Message not found: ' + id, { details: { id } });
      if (!isUuid(id)) throw notFound();
      const [row] = await query('skip', SKIP, [id]);
      if (row === undefined) throw notFound();
      const status = row['previous_status'];
      if (row['skipped'] !== true)
        throw new OutboxError('OUTBOX_NOT_SKIPPABLE', 'Message cannot be skipped: ' + id, { details: { id, status } });
      if (status !== 'pending' && status !== 'dead')
        throw new OutboxError('OUTBOX_INTERNAL', 'Invalid skip status. Please report.');
      return { id, previousStatus: status };
    },
    async purge(input) {
      const options = parseAdminOptions('purge', input);
      let deleted = await purgeBatches('purge', PURGE_TERMINAL, options);
      if (options.includeDead === true) deleted += await purgeBatches('purge', PURGE_DEAD, options);
      return { deleted };
    },
    async purgeInbox(input) {
      return { deleted: await purgeBatches('purgeInbox', PURGE_INBOX, parseAdminOptions('purgeInbox', input)) };
    },
    async listDead(input) {
      const options = parseAdminOptions('listDead', input);
      return (await query('listDead', LIST_DEAD, [options.topic ?? null, options.limit ?? 100])).map(mapMessageRow);
    },
  };
}

/** Read database-time counts using the partial-index queries. */
export async function readStats(
  executor: SqlExecutor,
  config: ResolvedOutboxConfig,
  input?: { includeTerminal?: boolean },
): Promise<import('./types.js').OutboxStats> {
  const options = parseAdminOptions('stats', input);
  const [row] = await adminQuery(executor, config, 'stats', S1, []);
  const number = (source: Record<string, unknown> | undefined, key: string): number => {
    const value = source?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new OutboxError('OUTBOX_INTERNAL', 'Invalid stats column: ' + key + '. Please report.');
    return value;
  };
  const result: import('./types.js').OutboxStats = {
    ready: number(row, 'ready'),
    scheduled: number(row, 'scheduled'),
    inFlight: number(row, 'in_flight'),
    expiredLeases: number(row, 'expired_leases'),
    dead: number(row, 'dead'),
    oldestReadyAgeMs: number(row, 'oldest_ready_age_ms'),
    measuredAt: dateFromEpoch(row?.['measured_at_ms'], 'measured_at_ms'),
  };
  if (options.includeTerminal) {
    const [terminal] = await adminQuery(executor, config, 'stats', S2, []);
    result.done = number(terminal, 'done');
    result.skipped = number(terminal, 'skipped');
  }
  return result;
}
