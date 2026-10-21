import { render } from './render.js';
import { mapMessageRow } from '../row.js';
import type { OutboxMessage, ResolvedOutboxConfig, SqlExecutor } from '../types.js';

export const C1 = `-- $1 text  relay id
-- $2 int4  limit (1..batchSize)
-- $3 int8  lease ms
with candidates as materialized (
  select m.id
  from {{messages}} m
  where m.status = 'pending'
    and m.available_at <= {{now}}
  order by m.available_at, m.seq
  limit $2::int4
  for update skip locked
)
update {{messages}} m
set status          = 'in_flight',
    locked_by       = $1::text,
    locked_until    = {{now}} + ($3::int8 * interval '1 millisecond'),
    attempts        = m.attempts + 1,
    last_attempt_at = {{now}}
from candidates c
where m.id = c.id
  and m.status = 'pending'          -- defence in depth; the CTE already holds the row lock (A-20)
returning
  m.id::text                                             as id,
  m.seq::text                                            as seq,
  m.topic,
  m.key,
  m.payload::text                                        as payload,
  m.headers::text                                        as headers,
  m.dedupe_key,
  m.status,
  m.attempts,
  m.max_attempts,
  (extract(epoch from m.created_at) * 1000)::float8      as created_at_ms,
  (extract(epoch from m.available_at) * 1000)::float8    as available_at_ms,
  m.last_error;`;

export const C1T = `-- $1 text  relay id
-- $2 int4  limit (1..batchSize)
-- $3 int8  lease ms
with candidates as materialized (
  select m.id
  from {{messages}} m
  where m.status = 'pending'
    and m.available_at <= {{now}}
    and m.topic = any (array(select jsonb_array_elements_text($4::text::jsonb)))
  order by m.available_at, m.seq
  limit $2::int4
  for update skip locked
)
update {{messages}} m
set status          = 'in_flight',
    locked_by       = $1::text,
    locked_until    = {{now}} + ($3::int8 * interval '1 millisecond'),
    attempts        = m.attempts + 1,
    last_attempt_at = {{now}}
from candidates c
where m.id = c.id
  and m.status = 'pending'          -- defence in depth; the CTE already holds the row lock (A-20)
returning
  m.id::text                                             as id,
  m.seq::text                                            as seq,
  m.topic,
  m.key,
  m.payload::text                                        as payload,
  m.headers::text                                        as headers,
  m.dedupe_key,
  m.status,
  m.attempts,
  m.max_attempts,
  (extract(epoch from m.created_at) * 1000)::float8      as created_at_ms,
  (extract(epoch from m.available_at) * 1000)::float8    as available_at_ms,
  m.last_error;`;

export const C2 = `-- $1 text  relay id
-- $2 int4  limit (1..batchSize)
-- $3 int8  lease ms
with candidates as materialized (
  select m.id
  from {{messages}} m
  where m.status = 'pending'
    and m.available_at <= {{now}}
    and (
      m.key is null
      or not exists (
        select 1
        from {{messages}} p
        where p.key = m.key
          and p.seq < m.seq
          and p.status in ('pending', 'in_flight', 'dead')
      )
    )
  order by m.available_at, m.seq
  limit $2::int4
  for update of m skip locked
)
update {{messages}} m
set status          = 'in_flight',
    locked_by       = $1::text,
    locked_until    = {{now}} + ($3::int8 * interval '1 millisecond'),
    attempts        = m.attempts + 1,
    last_attempt_at = {{now}}
from candidates c
where m.id = c.id
  and m.status = 'pending'          -- defence in depth; the CTE already holds the row lock (A-20)
returning
  m.id::text                                             as id,
  m.seq::text                                            as seq,
  m.topic,
  m.key,
  m.payload::text                                        as payload,
  m.headers::text                                        as headers,
  m.dedupe_key,
  m.status,
  m.attempts,
  m.max_attempts,
  (extract(epoch from m.created_at) * 1000)::float8      as created_at_ms,
  (extract(epoch from m.available_at) * 1000)::float8    as available_at_ms,
  m.last_error;`;

export const C2T = `-- $1 text  relay id
-- $2 int4  limit (1..batchSize)
-- $3 int8  lease ms
with candidates as materialized (
  select m.id
  from {{messages}} m
  where m.status = 'pending'
    and m.available_at <= {{now}}
    and (
      m.key is null
      or not exists (
        select 1
        from {{messages}} p
        where p.key = m.key
          and p.seq < m.seq
          and p.status in ('pending', 'in_flight', 'dead')
      )
    )
    and m.topic = any (array(select jsonb_array_elements_text($4::text::jsonb)))
  order by m.available_at, m.seq
  limit $2::int4
  for update of m skip locked
)
update {{messages}} m
set status          = 'in_flight',
    locked_by       = $1::text,
    locked_until    = {{now}} + ($3::int8 * interval '1 millisecond'),
    attempts        = m.attempts + 1,
    last_attempt_at = {{now}}
from candidates c
where m.id = c.id
  and m.status = 'pending'          -- defence in depth; the CTE already holds the row lock (A-20)
returning
  m.id::text                                             as id,
  m.seq::text                                            as seq,
  m.topic,
  m.key,
  m.payload::text                                        as payload,
  m.headers::text                                        as headers,
  m.dedupe_key,
  m.status,
  m.attempts,
  m.max_attempts,
  (extract(epoch from m.created_at) * 1000)::float8      as created_at_ms,
  (extract(epoch from m.available_at) * 1000)::float8    as available_at_ms,
  m.last_error;`;

const CLAIMS = { none: [C1, C1T], key: [C2, C2T] } as const;

/** Select one of the four normative claim statements. */
export function claimSql(ordering: 'none' | 'key', hasTopicFilter: boolean): string {
  return CLAIMS[ordering][hasTopicFilter ? 1 : 0];
}

/** Claim one ready batch in a single autocommit statement. */
export async function claim(
  executor: SqlExecutor,
  config: ResolvedOutboxConfig,
  options: { relayId: string; limit: number; leaseMs: number; topics?: readonly string[]; sql?: string },
): Promise<OutboxMessage[]> {
  const params = [options.relayId, options.limit, options.leaseMs];
  if (options.topics !== undefined) params.push(JSON.stringify(options.topics));
  const rows = await executor.query(
    render(options.sql ?? claimSql('none', options.topics !== undefined), config),
    params,
  );
  return rows.map(mapMessageRow);
}
