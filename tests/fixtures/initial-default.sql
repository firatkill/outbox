-- Time source for every timestamp the library writes or compares.
-- Production: plain now(). The testing entry replaces the body (§11).
create or replace function "public"."outbox_now"() returns timestamptz
  language sql stable parallel safe
  as $$ select now() $$;

create table "public"."outbox_messages" (
  id               uuid        primary key,
  seq              bigint      generated always as identity,
  topic            text        not null,
  key              text,
  payload          jsonb       not null,
  headers          jsonb       not null default '{}'::jsonb,
  dedupe_key       text,
  status           text        not null default 'pending',
  attempts         integer     not null default 0,
  max_attempts     integer     not null default 10,
  available_at     timestamptz not null default "public"."outbox_now"(),
  created_at       timestamptz not null default "public"."outbox_now"(),
  locked_by        text,
  locked_until     timestamptz,
  last_attempt_at  timestamptz,
  completed_at     timestamptz,
  dead_at          timestamptz,
  last_error       text,

  constraint "outbox_messages_status_ck"
    check (status in ('pending', 'in_flight', 'done', 'dead', 'skipped')),
  constraint "outbox_messages_topic_ck"
    check (char_length(topic) between 1 and 200),
  constraint "outbox_messages_key_ck"
    check (key is null or char_length(key) between 1 and 200),
  constraint "outbox_messages_dedupe_key_ck"
    check (dedupe_key is null or char_length(dedupe_key) between 1 and 200),
  constraint "outbox_messages_headers_ck"
    check (jsonb_typeof(headers) = 'object'),
  constraint "outbox_messages_max_attempts_ck"
    check (max_attempts between 1 and 1000),
  constraint "outbox_messages_attempts_ck"
    check (attempts between 0 and max_attempts),
  -- A pending message always has at least one attempt left.
  constraint "outbox_messages_pending_attempts_ck"
    check (status <> 'pending' or attempts < max_attempts),
  -- Lease columns are set exactly when in flight.
  constraint "outbox_messages_lease_ck"
    check ((status = 'in_flight' and locked_by is not null and locked_until is not null)
        or (status <> 'in_flight' and locked_by is null and locked_until is null)),
  constraint "outbox_messages_completed_ck"
    check ((status in ('done', 'skipped')) = (completed_at is not null)),
  constraint "outbox_messages_dead_ck"
    check ((status = 'dead') = (dead_at is not null)),
  constraint "outbox_messages_last_error_ck"
    check (last_error is null or char_length(last_error) <= 4000)
);

-- Claim scan: ready pending messages in delivery order. Partial, so done rows never slow claims.
create index "outbox_messages_claim_idx"
  on "public"."outbox_messages" (available_at, seq)
  where status = 'pending';

-- Reclaim scan: expired leases.
create index "outbox_messages_lease_idx"
  on "public"."outbox_messages" (locked_until)
  where status = 'in_flight';

-- Ordering mode: "is there an unfinished message with the same key and a lower seq?"
create index "outbox_messages_order_idx"
  on "public"."outbox_messages" (key, seq)
  where key is not null and status in ('pending', 'in_flight', 'dead');

-- Deduplication: one message per (topic, dedupe_key) until purged.
create unique index "outbox_messages_dedupe_uq"
  on "public"."outbox_messages" (topic, dedupe_key)
  where dedupe_key is not null;

-- Dead-letter listing and retryDead.
create index "outbox_messages_dead_idx"
  on "public"."outbox_messages" (dead_at)
  where status = 'dead';

-- Purge scan.
create index "outbox_messages_purge_idx"
  on "public"."outbox_messages" (completed_at)
  where status in ('done', 'skipped');

-- High-churn table: vacuum and analyze earlier than the defaults (20% / 10%).
alter table "public"."outbox_messages" set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02
);

comment on table "public"."outbox_messages" is
  'Transactional outbox managed by @firatkill/outbox. Write only through enqueue(); see https://outbox.firatkil.com';

create table "public"."outbox_inbox" (
  consumer      text        not null,
  message_id    text        not null,
  processed_at  timestamptz not null default "public"."outbox_now"(),
  constraint "outbox_inbox_pk" primary key (consumer, message_id),
  constraint "outbox_inbox_consumer_ck" check (char_length(consumer) between 1 and 200),
  constraint "outbox_inbox_message_id_ck" check (char_length(message_id) between 1 and 200)
);

create index "outbox_inbox_processed_idx"
  on "public"."outbox_inbox" (processed_at);

comment on table "public"."outbox_inbox" is
  'Consumer inbox managed by @firatkill/outbox (withInbox). One row per processed (consumer, message_id).';
