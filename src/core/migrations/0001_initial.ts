import type { Migration } from './index.js';

// After release, never edit this template; add an additive numbered migration instead.
export const m0001Initial: Migration = {
  version: 1,
  name: 'initial',
  template: `-- Time source for every timestamp the library writes or compares.
-- Production: plain now(). The testing entry replaces the body (§11).
create or replace function {{now}} returns timestamptz
  language sql stable parallel safe
  as $$ select now() $$;

create table {{messages}} (
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
  available_at     timestamptz not null default {{now}},
  created_at       timestamptz not null default {{now}},
  locked_by        text,
  locked_until     timestamptz,
  last_attempt_at  timestamptz,
  completed_at     timestamptz,
  dead_at          timestamptz,
  last_error       text,

  constraint "{{p}}messages_status_ck"
    check (status in ('pending', 'in_flight', 'done', 'dead', 'skipped')),
  constraint "{{p}}messages_topic_ck"
    check (char_length(topic) between 1 and 200),
  constraint "{{p}}messages_key_ck"
    check (key is null or char_length(key) between 1 and 200),
  constraint "{{p}}messages_dedupe_key_ck"
    check (dedupe_key is null or char_length(dedupe_key) between 1 and 200),
  constraint "{{p}}messages_headers_ck"
    check (jsonb_typeof(headers) = 'object'),
  constraint "{{p}}messages_max_attempts_ck"
    check (max_attempts between 1 and 1000),
  constraint "{{p}}messages_attempts_ck"
    check (attempts between 0 and max_attempts),
  -- A pending message always has at least one attempt left.
  constraint "{{p}}messages_pending_attempts_ck"
    check (status <> 'pending' or attempts < max_attempts),
  -- Lease columns are set exactly when in flight.
  constraint "{{p}}messages_lease_ck"
    check ((status = 'in_flight' and locked_by is not null and locked_until is not null)
        or (status <> 'in_flight' and locked_by is null and locked_until is null)),
  constraint "{{p}}messages_completed_ck"
    check ((status in ('done', 'skipped')) = (completed_at is not null)),
  constraint "{{p}}messages_dead_ck"
    check ((status = 'dead') = (dead_at is not null)),
  constraint "{{p}}messages_last_error_ck"
    check (last_error is null or char_length(last_error) <= 4000)
);

-- Claim scan: ready pending messages in delivery order. Partial, so done rows never slow claims.
create index "{{p}}messages_claim_idx"
  on {{messages}} (available_at, seq)
  where status = 'pending';

-- Reclaim scan: expired leases.
create index "{{p}}messages_lease_idx"
  on {{messages}} (locked_until)
  where status = 'in_flight';

-- Ordering mode: "is there an unfinished message with the same key and a lower seq?"
create index "{{p}}messages_order_idx"
  on {{messages}} (key, seq)
  where key is not null and status in ('pending', 'in_flight', 'dead');

-- Deduplication: one message per (topic, dedupe_key) until purged.
create unique index "{{p}}messages_dedupe_uq"
  on {{messages}} (topic, dedupe_key)
  where dedupe_key is not null;

-- Dead-letter listing and retryDead.
create index "{{p}}messages_dead_idx"
  on {{messages}} (dead_at)
  where status = 'dead';

-- Purge scan.
create index "{{p}}messages_purge_idx"
  on {{messages}} (completed_at)
  where status in ('done', 'skipped');

-- High-churn table: vacuum and analyze earlier than the defaults (20% / 10%).
alter table {{messages}} set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02
);

comment on table {{messages}} is
  'Transactional outbox managed by @firatkill/outbox. Write only through enqueue(); see https://outbox.firatkil.com';

create table {{inbox}} (
  consumer      text        not null,
  message_id    text        not null,
  processed_at  timestamptz not null default {{now}},
  constraint "{{p}}inbox_pk" primary key (consumer, message_id),
  constraint "{{p}}inbox_consumer_ck" check (char_length(consumer) between 1 and 200),
  constraint "{{p}}inbox_message_id_ck" check (char_length(message_id) between 1 and 200)
);

create index "{{p}}inbox_processed_idx"
  on {{inbox}} (processed_at);

comment on table {{inbox}} is
  'Consumer inbox managed by @firatkill/outbox (withInbox). One row per processed (consumer, message_id).';
`,
};
