-- $1 jsonb  [{ "ord": 0, "topic": "...", "dedupe_key": "..." }]
select x.ord::int4 as ord, m.id::text as id
from jsonb_to_recordset($1::text::jsonb) as x(ord int4, topic text, dedupe_key text)
join "app_events"."ob_messages" m
  on m.topic = x.topic and m.dedupe_key = x.dedupe_key;
