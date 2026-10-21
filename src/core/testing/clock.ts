import { OutboxError } from '../errors.js';
import { dateFromEpoch } from '../row.js';
import { render } from '../sql/render.js';
import type { DriverAdapter, ResolvedOutboxConfig } from '../types.js';

/** Test-only controls for database-time offsets. */
export interface TestClock {
  /** Replace <prefix>now() with the offset-aware version and create <prefix>test_clock. Idempotent. */
  install(): Promise<void>;
  /** Restore the production <prefix>now() (select now()) and drop <prefix>test_clock. */
  uninstall(): Promise<void>;
  /** Set the per-schema offset (visible to every connection and process). ms >= 0. */
  set(offsetMs: number): Promise<void>;
  /** Add to the per-schema offset. */
  advance(ms: number): Promise<void>;
  /** Offset back to 0. */
  reset(): Promise<void>;
  /** Current database time as the outbox sees it. */
  now(): Promise<Date>;
  /** Per-transaction override for this tx only: set local outbox.test_offset_ms. */
  setLocal(tx: unknown, offsetMs: number): Promise<void>;
}

const INSTALL = `create table if not exists {{test_clock}} (
  id        boolean primary key default true check (id),
  offset_ms bigint  not null default 0 check (offset_ms >= 0)
);
insert into {{test_clock}} (id) values (true) on conflict (id) do nothing;

create or replace function {{now}} returns timestamptz
  language sql stable
  as $$
    select now() + make_interval(secs => coalesce(
      nullif(current_setting('outbox.test_offset_ms', true), '')::bigint,
      (select c.offset_ms from {{test_clock}} c where c.id),
      0
    ) / 1000.0)
  $$;`;
const UNINSTALL = `create or replace function {{now}} returns timestamptz
  language sql stable parallel safe as $$ select now() $$;
drop table if exists {{test_clock}};`;
const SET = 'update {{test_clock}} set offset_ms = $1::int8 where id';
const ADVANCE = 'update {{test_clock}} set offset_ms = offset_ms + $1::int8 where id';
const NOW = 'select (extract(epoch from {{now}}) * 1000)::float8 as now_ms';
const LOCAL = "select set_config('outbox.test_offset_ms', $1::text, true)";

function checkOffset(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0)
    throw new OutboxError('OUTBOX_CONFIG', 'Test clock offset must be non-negative and finite');
}
/** Test-only clock implementation; never imported by production entries. */
export function createTestClock<TDb, TTx>(adapter: DriverAdapter<TDb, TTx>, config: ResolvedOutboxConfig): TestClock {
  return {
    install: async () => {
      await adapter.transaction((tx) => tx.query(render(INSTALL, config), []));
    },
    uninstall: async () => {
      await adapter.transaction((tx) => tx.query(render(UNINSTALL, config), []));
    },
    set: async (ms) => {
      checkOffset(ms);
      await adapter.query(render(SET, config), [ms]);
    },
    advance: async (ms) => {
      checkOffset(ms);
      await adapter.query(render(ADVANCE, config), [ms]);
    },
    reset: async () => {
      await adapter.query(render(SET, config), [0]);
    },
    now: async () => {
      const rows = await adapter.query(render(NOW, config), []);
      return dateFromEpoch(rows[0]?.['now_ms'], 'now_ms');
    },
    setLocal: async (tx, ms) => {
      checkOffset(ms);
      await adapter.forTransaction(tx as TTx).query(LOCAL, [String(ms)]);
    },
  };
}
