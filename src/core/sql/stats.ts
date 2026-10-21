export const S1 = `select
  (select count(*) from {{messages}}
     where status = 'pending' and available_at <= {{now}})::int4      as ready,          -- claim_idx
  (select count(*) from {{messages}}
     where status = 'pending' and available_at > {{now}})::int4       as scheduled,      -- claim_idx
  (select count(*) from {{messages}}
     where status = 'in_flight')::int4                                                 as in_flight,      -- lease_idx
  (select count(*) from {{messages}}
     where status = 'in_flight' and locked_until < {{now}})::int4     as expired_leases, -- lease_idx
  (select count(*) from {{messages}}
     where status = 'dead')::int4                                                      as dead,           -- dead_idx
  coalesce((
    select extract(epoch from ({{now}} - min(available_at))) * 1000
    from {{messages}}
    where status = 'pending' and available_at <= {{now}}
  ), 0)::float8                                                                        as oldest_ready_age_ms,
  (extract(epoch from {{now}}) * 1000)::float8                         as measured_at_ms;`;

export const S2 = `select
  count(*) filter (where status = 'done')::int4    as done,
  count(*) filter (where status = 'skipped')::int4 as skipped
from {{messages}}
where status in ('done', 'skipped');`;
