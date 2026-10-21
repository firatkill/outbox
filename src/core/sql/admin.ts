export const RETRY_DEAD = `-- $1 jsonb ids or null, $2 text topic or null, $3 text key or null, $4 int4 limit
with picked as materialized (
  select m.id
  from {{messages}} m
  where m.status = 'dead'
    and ($1::text::jsonb is null or m.id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid))
    and ($2::text is null or m.topic = $2::text)
    and ($3::text is null or m.key = $3::text)
  order by m.dead_at, m.seq
  limit $4::int4
  for update skip locked
)
update {{messages}} m
set status = 'pending', attempts = 0, available_at = {{now}}, dead_at = null
from picked p
where m.id = p.id
  and m.status = 'dead'
returning m.id::text as id;`;

export const SKIP = `-- $1 uuid
with target as materialized (
  select m.id, m.status as previous_status
  from {{messages}} m
  where m.id = $1::uuid
  for update
),
upd as (
  update {{messages}} m
  set status = 'skipped', completed_at = {{now}}, dead_at = null
  from target t
  where m.id = t.id and t.previous_status in ('pending', 'dead') and m.status in ('pending', 'dead')
  returning m.id
)
select t.previous_status, exists (select 1 from upd) as skipped
from target t;`;

export const PURGE_TERMINAL = `-- P1: done and skipped.  $1 int8 older-than ms, $2 int4 batch size
with doomed as materialized (
  select m.id
  from {{messages}} m
  where m.status in ('done', 'skipped')
    and m.completed_at < {{now}} - ($1::int8 * interval '1 millisecond')
  order by m.completed_at
  limit $2::int4
  for update skip locked
),
del as (
  delete from {{messages}} m using doomed d where m.id = d.id returning 1
)
select count(*)::int4 as deleted from del;`;

export const PURGE_DEAD = `-- P2: dead.  $1 int8 older-than ms, $2 int4 batch size
with doomed as materialized (
  select m.id
  from {{messages}} m
  where m.status = 'dead'
    and m.dead_at < {{now}} - ($1::int8 * interval '1 millisecond')
  order by m.dead_at
  limit $2::int4
  for update skip locked
),
del as (
  delete from {{messages}} m using doomed d where m.id = d.id returning 1
)
select count(*)::int4 as deleted from del;`;

export const LIST_DEAD = `-- $1 text topic or null, $2 int4 limit (1..1000, default 100)
select   m.id::text                                             as id,
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
  m.last_error
from {{messages}} m
where m.status = 'dead' and ($1::text is null or m.topic = $1::text)
order by m.dead_at desc, m.seq desc
limit $2::int4;`;

export const PURGE_INBOX = `-- $1 int8 older-than ms, $2 int4 batch size (default 5000)
with doomed as materialized (
  select i.consumer, i.message_id
  from {{inbox}} i
  where i.processed_at < {{now}} - ($1::int8 * interval '1 millisecond')
  order by i.processed_at
  limit $2::int4
  for update skip locked
),
del as (
  delete from {{inbox}} i using doomed d
  where i.consumer = d.consumer and i.message_id = d.message_id
  returning 1
)
select count(*)::int4 as deleted from del;`;
