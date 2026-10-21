import { render } from './render.js';
import { resultIds } from './outcome.js';
import type { AttemptFence } from './outcome.js';
import { OutboxError } from '../errors.js';
import type { ResolvedOutboxConfig, SqlExecutor } from '../types.js';

export const RECLAIM = `-- $1 int4 limit (reclaimBatchSize)
with expired as materialized (
  select m.id
  from {{messages}} m
  where m.status = 'in_flight'
    and m.locked_until < {{now}}
  order by m.locked_until
  limit $1::int4
  for update skip locked
)
update {{messages}} m
set status = case when m.attempts >= m.max_attempts then 'dead' else 'pending' end,
    available_at = case when m.attempts >= m.max_attempts then m.available_at else {{now}} end,
    dead_at = case when m.attempts >= m.max_attempts then {{now}} else null end,
    last_error = 'OUTBOX_LEASE_EXPIRED: lease held by ' || m.locked_by || ' expired at '
                 || to_char(m.locked_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    locked_by = null,
    locked_until = null
from expired e
where m.id = e.id
  and m.status = 'in_flight'        -- defence in depth (AGENTS.md: every UPDATE repeats its source status)
returning m.id::text as id, m.topic, m.status, m.attempts;`;

export const RELEASE = `-- $1 text relay id, $2 jsonb [{ "id": "<uuid>", "attempt": 3 }, ...]
update {{messages}} m
set status       = 'pending',
    attempts     = m.attempts - 1,
    available_at = {{now}},
    locked_by    = null,
    locked_until = null
from jsonb_to_recordset($2::text::jsonb) as x(id uuid, attempt int4)
where m.id = x.id
  and m.status = 'in_flight'
  and m.locked_by = $1::text
  and m.attempts = x.attempt
returning m.id::text as id;`;

export interface ReclaimedRow {
  id: string;
  topic: string;
  status: 'pending' | 'dead';
  attempts: number;
}
/** Reclaim one expired batch using database time and row locks. */
export async function reclaim(
  executor: SqlExecutor,
  config: ResolvedOutboxConfig,
  limit: number,
): Promise<ReclaimedRow[]> {
  const rows = await executor.query(render(RECLAIM, config), [limit]);
  return rows.map((row) => {
    if (
      typeof row['id'] !== 'string' ||
      typeof row['topic'] !== 'string' ||
      typeof row['attempts'] !== 'number' ||
      (row['status'] !== 'pending' && row['status'] !== 'dead')
    )
      throw new OutboxError('OUTBOX_INTERNAL', 'Invalid reclaim result. Please report.');
    return { id: row['id'], topic: row['topic'], status: row['status'], attempts: row['attempts'] };
  });
}
/** Release exact owned attempts without counting them as delivery failures. */
export async function release(
  executor: SqlExecutor,
  config: ResolvedOutboxConfig,
  relayId: string,
  attempts: readonly AttemptFence[],
): Promise<string[]> {
  return resultIds(
    await executor.query(render(RELEASE, config), [
      relayId,
      JSON.stringify(attempts.map(({ id, attempt }) => ({ id, attempt }))),
    ]),
  );
}
