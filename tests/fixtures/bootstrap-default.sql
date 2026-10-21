create schema if not exists "public";

create table if not exists "public"."outbox_schema_migrations" (
  version    integer     primary key,
  name       text        not null,
  checksum   text        not null,
  applied_at timestamptz not null default now()
);
