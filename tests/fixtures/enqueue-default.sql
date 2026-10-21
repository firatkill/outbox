-- $1 jsonb  messages
-- $2 text   notify channel, or null when notify is disabled
with input as (
  select e.ord, e.value as v
  from jsonb_array_elements($1::text::jsonb) with ordinality as e(value, ord)
),
ins as (
  insert into "public"."outbox_messages"
    (id, topic, key, payload, headers, dedupe_key, max_attempts, available_at)
  select
    (v->>'id')::uuid,
    v->>'topic',
    v->>'key',
    v->'payload',
    v->'headers',
    v->>'dedupe_key',
    (v->>'max_attempts')::int4,
    case
      when v->>'available_at_ms' is not null
        then to_timestamp((v->>'available_at_ms')::float8 / 1000.0)
      else "public"."outbox_now"() + ((v->>'delay_ms')::int8 * interval '1 millisecond')
    end
  from input
  order by ord
  on conflict (topic, dedupe_key) where dedupe_key is not null do nothing
  returning id
)
select
  coalesce((select jsonb_agg(id::text) from ins), '[]'::jsonb)::text as inserted_ids,
  case
    when $2::text is not null and exists (select 1 from ins)
      then (select 1 from pg_notify($2::text, ''))
  end as notified;
