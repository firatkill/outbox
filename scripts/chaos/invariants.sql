-- INV-08: each keyed first delivery starts after the previous message completed.
-- No test clock: delivery started_at and completed_at use the database server clock.
with f as (
  select message_id, min(started_at) as first_start
  from {{schema}}.chaos_deliveries
  group by message_id
), s as (
  select id, key, seq, lag(completed_at) over (partition by key order by seq) as prev_done
  from {{messages}}
  where key is not null
)
select s.id::text
from s join f on f.message_id = s.id
where s.prev_done is not null and f.first_start <= s.prev_done;
