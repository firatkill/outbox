create schema if not exists "app_events";

create table if not exists "app_events"."ob_schema_migrations" (
  version    integer     primary key,
  name       text        not null,
  checksum   text        not null,
  applied_at timestamptz not null default now()
);
