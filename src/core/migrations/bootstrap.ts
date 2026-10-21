/** Version bookkeeping uses now(): the outbox clock may not exist yet. */
export const BOOTSTRAP = `create schema if not exists {{schema}};

create table if not exists {{migrations}} (
  version    integer     primary key,
  name       text        not null,
  checksum   text        not null,
  applied_at timestamptz not null default now()
);
`;
