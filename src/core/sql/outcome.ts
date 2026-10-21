import { render } from './render.js';
import { OutboxError } from '../errors.js';
import type { ResolvedOutboxConfig, SqlExecutor } from '../types.js';

export const COMPLETE = `-- $1 text   relay id
-- $2 jsonb  [{ "id": "<uuid>", "attempt": 1 }, ...]
update {{messages}} m
set status       = 'done',
    completed_at = {{now}},
    locked_by    = null,
    locked_until = null
from jsonb_to_recordset($2::text::jsonb) as x(id uuid, attempt int4)
where m.id = x.id
  and m.status = 'in_flight'
  and m.locked_by = $1::text
  and m.attempts = x.attempt
returning m.id::text as id;`;

export const FAIL = `-- $1 text   relay id
-- $2 jsonb  [{ "id": "<uuid>", "attempt": 2, "delay_ms": 1834, "error": "Error: boom", "terminal": false }, ...]
update {{messages}} m
set status = case when x.terminal or m.attempts >= m.max_attempts then 'dead' else 'pending' end,
    available_at = case
      when x.terminal or m.attempts >= m.max_attempts then m.available_at
      else {{now}} + (x.delay_ms * interval '1 millisecond')
    end,
    dead_at = case
      when x.terminal or m.attempts >= m.max_attempts then {{now}}
      else null
    end,
    last_error   = x.error,
    locked_by    = null,
    locked_until = null
from jsonb_to_recordset($2::text::jsonb) as x(id uuid, attempt int4, delay_ms int8, error text, terminal boolean)
where m.id = x.id
  and m.status = 'in_flight'
  and m.locked_by = $1::text
  and m.attempts = x.attempt
returning m.id::text as id, m.status, m.attempts, m.max_attempts;`;

export interface AttemptFence {
  id: string;
  attempt: number;
}
export interface FailedAttempt extends AttemptFence {
  delayMs: number;
  error: string;
  terminal: boolean;
}
export interface FailedRow {
  id: string;
  status: 'pending' | 'dead';
  attempts: number;
  maxAttempts: number;
}

/** Read the neutral identifiers returned by fenced updates. */
export function resultIds(rows: Record<string, unknown>[]): string[] {
  return rows.map((row) => {
    if (typeof row['id'] !== 'string') throw new OutboxError('OUTBOX_INTERNAL', 'Invalid outcome id. Please report.');
    return row['id'];
  });
}
/** Complete only the exact in-flight attempts owned by the caller. */
export async function complete(
  executor: SqlExecutor,
  config: ResolvedOutboxConfig,
  relayId: string,
  attempts: readonly AttemptFence[],
): Promise<string[]> {
  return resultIds(
    await executor.query(render(COMPLETE, config), [
      relayId,
      JSON.stringify(attempts.map(({ id, attempt }) => ({ id, attempt }))),
    ]),
  );
}
/** Persist a batch of retry or terminal failures, retaining the full fence. */
export async function fail(
  executor: SqlExecutor,
  config: ResolvedOutboxConfig,
  relayId: string,
  attempts: readonly FailedAttempt[],
): Promise<FailedRow[]> {
  const batch = attempts.map(({ id, attempt, delayMs, error, terminal }) => ({
    id,
    attempt,
    delay_ms: delayMs,
    error,
    terminal,
  }));
  const rows = await executor.query(render(FAIL, config), [relayId, JSON.stringify(batch)]);
  return rows.map((row) => {
    if (
      typeof row['id'] !== 'string' ||
      (row['status'] !== 'pending' && row['status'] !== 'dead') ||
      typeof row['attempts'] !== 'number' ||
      typeof row['max_attempts'] !== 'number'
    )
      throw new OutboxError('OUTBOX_INTERNAL', 'Invalid failure result. Please report.');
    return { id: row['id'], status: row['status'], attempts: row['attempts'], maxAttempts: row['max_attempts'] };
  });
}
