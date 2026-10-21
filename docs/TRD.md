# Outbox: Technical Requirements Document

| Field | Value |
|---|---|
| Status | Approved for implementation |
| Version | 1.0 (2026-10-21) |
| Reads with | [PRD.md](./PRD.md) (what and why), [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) (task order), [../AGENTS.md](../AGENTS.md) |

This document is normative. Where it shows SQL, TypeScript signatures, YAML or config, implement it as written unless a step in §22 (assumptions to verify) proves an external fact wrong; then change the smallest thing and record the change in PRD §14. TypeScript bodies shown here are illustrative unless marked "normative"; signatures, option names, defaults, ranges, SQL and error codes are always normative.

---

## 1. Reading order for implementers

1. PRD §6 (FR list), §7 (guarantees), §9 (statuses).
2. This document §2 (architecture), §5 (public API), §7 (DDL), §9 (SQL and algorithms), §12 (guarantees and crash points).
3. §15 (tests) before writing any code for a task: every task in IMPLEMENTATION_PLAN.md names the tests it must make pass.

## 2. Architecture

### 2.1 Components

```mermaid
flowchart LR
  subgraph App["Producer service"]
    H["Request handler"] -->|"same transaction"| TX[("BEGIN ... COMMIT")]
  end
  TX -->|"INSERT business rows"| DB[("PostgreSQL")]
  TX -->|"outbox.enqueue(tx, msg)<br/>INSERT outbox_messages + pg_notify"| DB
  subgraph R["Relay (1..n processes)"]
    L["Loop: claim → deliver → flush"]
    LS["LISTEN connection"]
    RC["Reclaim timer"]
  end
  DB -- "NOTIFY (hint)" --> LS
  LS --> L
  L -- "claim / complete / fail<br/>(short autocommit statements)" --> DB
  RC -- "reclaim expired leases" --> DB
  L -->|"handlers[topic](msg, ctx)"| C["In-process handler"]
  L -->|"publisher(msg, ctx)"| P["BullMQ / webhook / custom"]
  C -->|"withInbox(tx, consumer, id, fn)"| DB
```

- The producer only ever runs `INSERT` (and `pg_notify`) inside its own transaction. It never talks to the relay.
- The relay never holds a transaction open while it calls a handler or publisher. Every relay statement is a single autocommit statement that finishes in milliseconds (PRD D-13, NFR-03).
- Any number of relays can run against one table. They coordinate only through row locks (`SKIP LOCKED`) and leases.
- Consumers that need exactly-once effects call `withInbox` inside their own transaction, in whatever database holds their effects.

### 2.2 Message state machine (normative)

```mermaid
stateDiagram-v2
  [*] --> pending: enqueue (tx commits)
  pending --> in_flight: claim (attempts += 1, lease set)
  in_flight --> done: complete (handler resolved)
  in_flight --> pending: fail, retryable, attempts < max_attempts\n(available_at = now + backoff)
  in_flight --> dead: fail, non-retryable or attempts >= max_attempts
  in_flight --> pending: lease expired (reclaim), attempts < max_attempts
  in_flight --> dead: lease expired (reclaim), attempts >= max_attempts
  in_flight --> pending: shutdown release (attempts -= 1)
  dead --> pending: retryDead (attempts = 0)
  pending --> skipped: skip(id)
  dead --> skipped: skip(id)
  done --> [*]: purge
  skipped --> [*]: purge
  dead --> [*]: purge (includeDead)
```

| From | Event | To | SQL (section) | Event emitted |
|---|---|---|---|---|
| (none) | enqueue commit | `pending` | §9.1 | none (producer side) |
| `pending` | claim | `in_flight` | §9.2 / §9.4 | `claimed` |
| `in_flight` | complete | `done` | §9.3.1 | `delivered` |
| `in_flight` | fail, retryable, attempts < max | `pending` | §9.3.2 | `failed` |
| `in_flight` | fail, terminal or attempts ≥ max | `dead` | §9.3.2 | `failed` then `dead` |
| `in_flight` | lease expiry | `pending` / `dead` | §9.6.1 | `reclaimed` (and `dead` per dead row) |
| `in_flight` | shutdown release | `pending` | §9.6.2 | none |
| `dead` | `retryDead` | `pending` | §9.7.1 | none (admin) |
| `pending`, `dead` | `skip` | `skipped` | §9.7.2 | none (admin) |
| `done`, `skipped`, (`dead`) | `purge` | deleted | §9.7.3 | none (admin) |

No other transitions exist. Every UPDATE in §9 includes its source status in the WHERE clause, so an illegal transition is impossible by construction. INV-04 checks the lock-consistency CHECK constraint after every chaos run.

### 2.3 Delivery sequence (happy path and crash)

```mermaid
sequenceDiagram
  autonumber
  participant App as Producer
  participant DB as PostgreSQL
  participant R1 as Relay A
  participant R2 as Relay B
  participant H as Handler
  App->>DB: BEGIN; INSERT orders; INSERT outbox_messages; pg_notify
  App->>DB: COMMIT (NOTIFY delivered now)
  DB-->>R1: NOTIFY outbox channel
  R1->>DB: claim: UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING
  Note over R1,DB: row: in_flight, locked_by=A, locked_until=now+60s, attempts=1
  R1->>H: handler(msg, { signal, attempt: 1 })
  H-->>R1: resolved
  R1->>DB: complete: UPDATE ... SET status='done' WHERE locked_by=A AND attempts=1
  Note over R1: crash variant: A dies after step 6, before step 8
  R2->>DB: reclaim (every 10 s): locked_until < now() → pending
  R2->>DB: claim → in_flight, locked_by=B, attempts=2
  R2->>H: handler(msg, { attempt: 2 }) (duplicate delivery; inbox makes it harmless)
  R2->>DB: complete WHERE locked_by=B AND attempts=2
```

### 2.4 Relay internals

A relay is one object with four cooperating parts, all in one Node process:

| Part | Responsibility | File |
|---|---|---|
| Scheduler | Decides when to claim: free slots, poll interval, wake-ups, stop | `src/core/relay/scheduler.ts` (pure) and `src/core/relay/loop.ts` |
| Deliverer | Runs one handler or publisher per claimed message with timeout and abort | `src/core/relay/deliver.ts` |
| Flusher | Single-flight writer of buffered outcomes (complete, fail) | `src/core/relay/flush.ts` |
| Reclaimer | Timer that returns expired leases to `pending` | `src/core/relay/reclaim.ts` |

Concurrency model: `active` is the number of messages claimed and not yet finished delivering. The loop claims `min(batchSize, concurrency − active)` rows when `concurrency − active ≥ ceil(batchSize / 2)` or `active = 0` (§9.5.1). Outcomes go into an in-memory buffer; the flusher writes the whole buffer in at most two statements (complete, fail) and, if new outcomes arrived while it was writing, writes again. This "group commit" batches completions under load and writes single completions immediately when idle, with no timer.

---

## 3. Stack

Exact versions are resolved on the implementation date and pinned exactly in `package.json` (`pnpm add -E`). The majors below were current when this document was written; verify each with `pnpm view <pkg> version` (A-07..A-10, A-17).

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.9+ (`strict`) | If TypeScript 6 or 7 is current, use it if `tsup`, `typedoc` and `typescript-eslint` support it; otherwise the latest 5.x |
| Runtime | Node.js 22 and 24 (supported, required CI cells); Node.js 20.11+ best-effort (one non-blocking CI cell, PRD D-41) | `.nvmrc` = `22` for local development; `engines.node` stays `>=20.11` so Node 20 users can still install |
| Package manager | pnpm 10 | `packageManager` field set; Corepack |
| Build | tsdown 0.23.1 | Owner-approved A-07 fallback (D-56); ESM + CJS + `.d.ts`/`.d.cts` |
| Tests | Vitest 3 or 4, `@vitest/coverage-v8` | Projects `unit` and `integration` |
| Lint / format | ESLint 9 flat config + `typescript-eslint` strict-type-checked; Prettier 3 | |
| Versioning | `@changesets/cli` 2 | |
| Package checks | `publint`, `@arethetypeswrong/cli`, `size-limit` + `@size-limit/preset-small-lib` | |
| Docs | VitePress 1.x, `vitepress-plugin-mermaid`, `mermaid`, `typedoc`, `typedoc-plugin-markdown`, `typedoc-vitepress-theme` | PRD D-24, D-25 (A-09) |
| Drivers (dev and peer) | `postgres` 3.4+, `pg` 8.11+ (+ `@types/pg` dev only) | A-03, A-04 |
| BullMQ (dev only, for INT-85) | `bullmq` 5, `ioredis` (if BullMQ requires it separately) | Never a peer or runtime dependency |
| Process helpers in scripts | `tsx` (dev) | Runs `scripts/**/*.ts` |
| Database | `postgres:14`, `postgres:16`, `postgres:17`, `postgres:18` images | Local compose and CI services (PRD D-42) |

## 4. Repository layout

```
outbox/
├── AGENTS.md
├── README.md
├── LICENSE                         # MIT, "Copyright (c) 2026 Fırat Kıl"
├── CHANGELOG.md                    # generated by Changesets
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml             # packages: ['.', 'examples/*']
├── .nvmrc                          # 22
├── .gitignore                      # node_modules, dist, coverage, site/.vitepress/dist, site/.vitepress/cache, site/api, bench/out
├── .prettierignore                 # docs/, CHANGELOG.md, pnpm-lock.yaml, dist, coverage, site/api, site/.vitepress/dist, site/.vitepress/cache, bench/out, bench/results
├── .dockerignore                   # node_modules, **/node_modules, dist, coverage, site/api, site/.vitepress/dist, site/.vitepress/cache, bench/out, .git
├── .changeset/config.json
├── .size-limit.json
├── compose.yml                     # local Postgres 14/16/17/18 + Redis (§16.7)
├── tsconfig.json                   # editor + typecheck (src, tests, scripts, site)
├── tsconfig.build.json             # src only, used by tsdown dts
├── tsdown.config.ts
├── vitest.config.ts
├── eslint.config.mjs
├── prettier.config.mjs
├── typedoc.json
├── docs/                           # specs: PRD.md, TRD.md, IMPLEMENTATION_PLAN.md
├── site/                           # VitePress docs site (§18)
│   ├── .vitepress/config.ts
│   ├── index.md
│   ├── guide/*.md
│   ├── snippets/*.ts               # type-checked samples included into pages
│   └── api/                        # generated by TypeDoc (gitignored)
├── src/
│   ├── index.ts                    # core entry "."
│   ├── postgres-js.ts              # entry "./postgres-js"
│   ├── pg.ts                       # entry "./pg"
│   ├── bullmq.ts                   # entry "./bullmq"
│   ├── webhook.ts                  # entry "./webhook"
│   ├── testing.ts                  # entry "./testing"
│   ├── cli.ts                      # bin "outbox" (ESM only)
│   ├── env.d.ts                    # declare const __OUTBOX_VERSION__: string (§4.2)
│   ├── core/
│   │   ├── outbox.ts               # createOutboxCore
│   │   ├── config.ts               # outbox config parsing
│   │   ├── identifiers.ts          # identifier validation and quoting
│   │   ├── validate.ts             # message validation
│   │   ├── errors.ts               # error classes, codes, brand
│   │   ├── backoff.ts              # computeBackoffMs (pure)
│   │   ├── uuid.ts                 # uuidv7 (pure, injectable clock/random)
│   │   ├── json.ts                 # JSON encode with size check
│   │   ├── row.ts                  # SQL row → OutboxMessage mapping
│   │   ├── emitter.ts              # typed event emitter, listener isolation
│   │   ├── types.ts                # public types (§5, §6.6, §14.2)
│   │   ├── cli-args.ts             # pure CLI argument parsing and URL redaction (UT-12)
│   │   ├── inbox.ts                # withInbox, purgeInbox
│   │   ├── testing/clock.ts        # test clock SQL and TestClock (used only by src/testing.ts)
│   │   ├── admin.ts                # retryDead, skip, purge, listDead, stats
│   │   ├── sql/
│   │   │   ├── render.ts           # renders templates with quoted identifiers
│   │   │   ├── enqueue.ts
│   │   │   ├── claim.ts            # unordered + ordering-mode claim
│   │   │   ├── outcome.ts          # complete, fail
│   │   │   ├── lease.ts            # reclaim, release
│   │   │   ├── admin.ts
│   │   │   ├── inbox.ts
│   │   │   └── stats.ts
│   │   ├── migrations/
│   │   │   ├── index.ts            # list of migrations (version, name, template)
│   │   │   ├── 0001_initial.ts
│   │   │   ├── runner.ts           # migrate(), status()
│   │   │   └── sql.ts              # migrationSql()
│   │   └── relay/
│   │       ├── options.ts          # parseRelayOptions (pure)
│   │       ├── relay.ts            # Relay class, lifecycle
│   │       ├── scheduler.ts        # pure: next action and interval
│   │       ├── loop.ts
│   │       ├── deliver.ts
│   │       ├── flush.ts
│   │       ├── reclaim.ts
│   │       └── tracing.ts
│   ├── adapters/
│   │   ├── types.ts                # DriverAdapter, SqlExecutor, ListenHandle
│   │   ├── postgres-js.ts
│   │   └── pg.ts
│   └── publishers/
│       ├── bullmq.ts
│       └── webhook.ts              # webhookPublisher, verifyWebhook, signing
├── tests/
│   ├── unit/*.test.ts              # UT-xx
│   ├── integration/*.test.ts       # INT-xx
│   ├── helpers/                    # db.ts, adapters.ts, wait.ts, spy.ts, relay-child.ts
│   ├── smoke/                      # cjs.cjs, esm.mjs: load every entry from dist
│   └── global-setup.ts             # creates database outbox_test if missing
├── scripts/
│   ├── chaos/run.ts                # CHAOS-01/02 driver (§15.5)
│   ├── chaos/relay-child.ts
│   ├── chaos/invariants.sql
│   ├── chaos/seeded.ts             # seeded PRNG and hash
│   ├── bench/run.ts                # BENCH-01 (§15.6)
│   ├── bench/readme.ts             # writes the README benchmark table
│   ├── bench/schema.ts             # results JSON type and runtime validator
│   ├── check-guards.ts             # §16.6
│   └── docs-check.ts               # §18.4
├── bench/results/                  # committed JSON (real runs only)
├── examples/orders/                # §17
├── vercel.json                     # docs deploy settings (§16.5)
└── .github/workflows/              # ci.yml, bench.yml, version.yml, publish.yml
```

### 4.1 package.json (normative except versions)

```json
{
  "name": "@firatkill/outbox",
  "version": "0.0.0",
  "description": "Transactional outbox, relay and inbox for PostgreSQL. At-least-once delivery with leases, retries, dead letters and per-key ordering.",
  "license": "MIT",
  "author": "Fırat Kıl",
  "homepage": "https://outbox.firatkil.com",
  "repository": { "type": "git", "url": "git+https://github.com/firatkill/outbox.git" },
  "bugs": { "url": "https://github.com/firatkill/outbox/issues" },
  "keywords": ["outbox", "transactional-outbox", "postgres", "postgresql", "relay", "inbox", "idempotency", "at-least-once", "skip-locked", "bullmq", "webhook"],
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=20.11" },
  "packageManager": "pnpm@10.0.0",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./postgres-js": {
      "import": { "types": "./dist/postgres-js.d.ts", "default": "./dist/postgres-js.js" },
      "require": { "types": "./dist/postgres-js.d.cts", "default": "./dist/postgres-js.cjs" }
    },
    "./pg": {
      "import": { "types": "./dist/pg.d.ts", "default": "./dist/pg.js" },
      "require": { "types": "./dist/pg.d.cts", "default": "./dist/pg.cjs" }
    },
    "./bullmq": {
      "import": { "types": "./dist/bullmq.d.ts", "default": "./dist/bullmq.js" },
      "require": { "types": "./dist/bullmq.d.cts", "default": "./dist/bullmq.cjs" }
    },
    "./webhook": {
      "import": { "types": "./dist/webhook.d.ts", "default": "./dist/webhook.js" },
      "require": { "types": "./dist/webhook.d.cts", "default": "./dist/webhook.cjs" }
    },
    "./testing": {
      "import": { "types": "./dist/testing.d.ts", "default": "./dist/testing.js" },
      "require": { "types": "./dist/testing.d.cts", "default": "./dist/testing.cjs" }
    },
    "./package.json": "./package.json"
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.cts",
  "bin": { "outbox": "./dist/cli.js" },
  "files": ["dist", "README.md", "LICENSE", "CHANGELOG.md"],
  "peerDependencies": { "pg": "^8.11.0", "postgres": "^3.4.0" },
  "peerDependenciesMeta": { "pg": { "optional": true }, "postgres": { "optional": true } },
  "dependencies": {},
  "publishConfig": { "access": "public", "provenance": true },
  "scripts": {
    "build": "tsdown",
    "clean": "rm -rf dist coverage",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "pnpm test:unit && pnpm test:integration",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:coverage": "vitest run --coverage",
    "chaos": "tsx scripts/chaos/run.ts",
    "bench": "tsx scripts/bench/run.ts",
    "bench:readme": "tsx scripts/bench/readme.ts",
    "db:up": "docker compose up -d --wait postgres redis",
    "db:up:all": "docker compose --profile matrix up -d --wait",
    "db:down": "docker compose --profile matrix down -v",
    "db:psql": "docker compose exec postgres psql -U postgres -d outbox_test",
    "check:package": "publint --strict && attw --pack . --profile node16",
    "check:guards": "tsx scripts/check-guards.ts",
    "size": "size-limit",
    "docs:api": "typedoc",
    "docs:check": "tsx scripts/docs-check.ts",
    "docs:dev": "pnpm docs:api && vitepress dev site",
    "docs:build": "pnpm docs:api && vitepress build site",
    "changeset": "changeset",
    "version": "changeset version && pnpm install --lockfile-only",
    "prepublishOnly": "pnpm build && pnpm check:package"
  }
}
```

Notes:
- `bullmq` is intentionally not a peer dependency: the BullMQ publisher uses a structural queue type and never imports `bullmq` (PRD D-37).
- `publishConfig.provenance: true` makes `npm publish` request provenance; the workflow also passes `--provenance` explicitly (§16.4).
- `"types": "./dist/index.d.cts"` exists for tools that ignore `exports`; `attw` runs with `--profile node16` because subpath exports cannot resolve under `node10` resolution by design (A-18).

### 4.2 tsdown.config.ts (normative; owner-approved A-07 fallback, PRD D-56)

Build tooling runs on Node 22.18+ (or another runtime supported by the pinned tsdown release), while output targets Node 20. The published runtime floor and entry map remain unchanged.

```ts
import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };
const define = { __OUTBOX_VERSION__: JSON.stringify(version) };

export default defineConfig([
  {
    define,
    entry: {
      index: 'src/index.ts',
      'postgres-js': 'src/postgres-js.ts',
      pg: 'src/pg.ts',
      bullmq: 'src/bullmq.ts',
      webhook: 'src/webhook.ts',
      testing: 'src/testing.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    tsconfig: 'tsconfig.build.json',
    target: 'node20',
    platform: 'node',
    sourcemap: true,
    clean: true,
    treeshake: true,
    deps: { neverBundle: ['pg', 'postgres'] },
    outExtensions: ({ format }) => ({ js: format === 'es' ? '.js' : '.cjs' }),
  },
  {
    define,
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    target: 'node20',
    platform: 'node',
    sourcemap: true,
    clean: false,
    deps: { neverBundle: ['pg', 'postgres'] },
    outExtensions: () => ({ js: '.js' }),
  },
]);
```

The library version is never read from package.json at runtime. `src/env.d.ts` declares `__OUTBOX_VERSION__`; tsdown and Vitest inline the package version. The CLI source carries the executable shebang. The CLI config explicitly sets `clean: false`, preventing it from deleting library output. tsdown emits ESM/CJS chunks and declarations with the extensions required by §4.1.

### 4.3 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src", "tests", "scripts", "*.ts"]
}
```

`tsconfig.build.json` extends it with `"include": ["src"]` and `"exclude": ["src/cli.ts"]`. Source files import siblings with `.js` extensions (NodeNext).

What `pnpm typecheck` covers and why (normative): the root config deliberately excludes `site/` and `examples/`. Both import the package by name (`@firatkill/outbox/...`), which resolves through the `exports` map to `dist/`, and `pnpm typecheck` runs before `pnpm build` in CI. Instead, `site/snippets/**` is type-checked by `pnpm docs:check` with its own tsconfig whose `paths` point at `src/` (§18.4), `site/.vitepress/config.ts` is type-checked by VitePress at `docs:build` (it imports the generated `site/api/typedoc-sidebar.json`), and `examples/orders` is compiled by its own `tsc` build after the root build (§17.5). Files under `tests/` and `scripts/` import library code by relative path into `src/` (for example `../../src/postgres-js.js`), never by package name; the only exceptions are `tests/smoke/*` (plain `.cjs`/`.mjs`, not type-checked) and INT-90/INT-91, which run `dist/cli.js`.

### 4.4 .size-limit.json (normative)

```json
[
  { "name": "core", "path": "dist/index.js", "import": "*", "limit": "10 kB", "ignore": ["node:crypto", "node:os"] },
  { "name": "postgres-js createOutbox", "path": "dist/postgres-js.js", "import": "{ createOutbox }", "limit": "12 kB", "ignore": ["node:crypto", "node:os", "postgres"] },
  { "name": "pg createOutbox", "path": "dist/pg.js", "import": "{ createOutbox }", "limit": "12 kB", "ignore": ["node:crypto", "node:os", "pg"] },
  { "name": "webhook", "path": "dist/webhook.js", "import": "*", "limit": "3 kB", "ignore": ["node:crypto"] },
  { "name": "bullmq", "path": "dist/bullmq.js", "import": "*", "limit": "2 kB" },
  { "name": "testing", "path": "dist/testing.js", "import": "*", "limit": "2 kB" }
]
```

Sizes are min + brotli as reported by `@size-limit/preset-small-lib` (A-08). `webhook` and `bullmq` sizes exclude core code they share (they import only `errors.ts` and `json.ts`).

### 4.5 Module boundaries

Enforced by ESLint `no-restricted-imports` (patterns per directory):

| Directory | May import | Must not import |
|---|---|---|
| `src/core/**` | other `src/core/**`, `node:crypto`, `node:os` | `src/adapters/**`, `src/publishers/**`, `pg`, `postgres`, any npm package |
| `src/adapters/**` | `src/core/**` (types and `createOutboxCore`) | `pg`, `postgres` as values (types are structural; `import type` from drivers is also forbidden so declarations stay driver-free), `src/publishers/**` |
| `src/publishers/**` | `src/core/errors.ts`, `src/core/json.ts`, `node:crypto` | everything else |
| `src/cli.ts` | anything in `src/`, dynamic `import('postgres')` / `import('pg')` | |
| `tests/**`, `scripts/**` | anything | |

The only file that loads a driver at runtime is `src/cli.ts`, through dynamic `import()`. Adapters receive the user's driver instance; they never import the driver module.

---

## 5. Public API

All signatures in this section are normative. Every public export carries TSDoc (NFR-41). Generic parameter `Topics` is a map from topic name to payload type, default `Record<string, unknown>`.

### 5.1 createOutbox

Exported by `@firatkill/outbox/postgres-js` and `@firatkill/outbox/pg` with the adapter's `Db` and `Tx` types filled in (§6).

```ts
// @firatkill/outbox/postgres-js
export function createOutbox<Topics extends TopicMap = DefaultTopics>(
  config: OutboxConfig<PostgresJsSql>,
): Outbox<PostgresJsTx, Topics>;

// @firatkill/outbox/pg
export function createOutbox<Topics extends TopicMap = DefaultTopics>(
  config: OutboxConfig<PgPool>,
): Outbox<PgTx, Topics>;

export type TopicMap = Record<string, unknown>;
export type DefaultTopics = Record<string, unknown>;

export interface OutboxConfig<TDb> {
  /** Driver handle used for relay statements, admin helpers and migrations. */
  db: TDb;
  /** Schema that holds the tables. Default 'public'. ^[a-z_][a-z0-9_]*$, 1..30 chars. */
  schema?: string;
  /** Prefix for tables, function and channel. Default 'outbox_'. ^[a-z_][a-z0-9_]*$, 1..20 chars. */
  tablePrefix?: string;
  /** Default max attempts stored on each message at enqueue. Default 10. Integer 1..1000. */
  maxAttempts?: number;
  /** Send pg_notify from enqueue. Default true. */
  notify?: boolean;
  /** Max UTF-8 bytes of JSON.stringify(payload). Default 1_048_576. Integer 1..67_108_864. */
  maxPayloadBytes?: number;
}
```

| Option | Default | Range | Notes |
|---|---|---|---|
| `db` | required | adapter-specific | postgres.js `Sql` or pg `Pool` |
| `schema` | `'public'` | identifier, 1..30 | Must exist before `migrate` (the migration runs `create schema if not exists`; the role needs `CREATE` on the database for non-existing schemas) |
| `tablePrefix` | `'outbox_'` | identifier, 1..20 | Tables `<prefix>messages`, `<prefix>inbox`, `<prefix>schema_migrations`, `<prefix>test_clock` (testing only), function `<prefix>now()` |
| `maxAttempts` | `10` | 1..1000 | Per-message override at enqueue |
| `notify` | `true` | boolean | PRD D-19 |
| `maxPayloadBytes` | `1048576` | 1..67108864 | |

Invalid config throws `OutboxError` code `OUTBOX_CONFIG` synchronously from `createOutbox`, listing every problem in `details.issues: string[]`.

Example (postgres.js):

```ts
import postgres from 'postgres';
import { createOutbox } from '@firatkill/outbox/postgres-js';

type Topics = {
  'order.created': { orderId: string; email: string; totalCents: number };
  'order.paid': { orderId: string };
};

const sql = postgres(process.env.DATABASE_URL!);
export const outbox = createOutbox<Topics>({ db: sql });

await sql.begin(async (tx) => {
  const [order] = await tx`insert into orders (email, total_cents) values (${email}, ${total}) returning id`;
  await outbox.enqueue(tx, {
    topic: 'order.created',
    key: `order-${order.id}`,
    payload: { orderId: String(order.id), email, totalCents: total },
    dedupeKey: `order-created-${order.id}`,
  });
});
```

Example (pg):

```ts
import pg from 'pg';
import { createOutbox } from '@firatkill/outbox/pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const outbox = createOutbox({ db: pool });

const client = await pool.connect();
try {
  await client.query('begin');
  const { rows } = await client.query('insert into orders (email) values ($1) returning id', [email]);
  await outbox.enqueue(client, { topic: 'order.created', payload: { orderId: rows[0].id } });
  await client.query('commit');
} catch (err) {
  await client.query('rollback');
  throw err;
} finally {
  client.release();
}
```

### 5.2 Message types

```ts
/** Input to enqueue. Discriminated by topic when Topics is a concrete map. */
export type MessageInput<Topics extends TopicMap = DefaultTopics> = {
  [K in keyof Topics & string]: {
    topic: K;
    payload: Topics[K];
    /** Partition key for ordering mode. 1..200 chars. null/undefined = unordered. */
    key?: string | null;
    /** String headers, e.g. traceparent. ≤ 50 entries, names 1..100 chars, values ≤ 2000 chars. */
    headers?: Readonly<Record<string, string>>;
    /** Unique per topic until the earlier message is purged. 1..200 chars. */
    dedupeKey?: string;
    /** Delay relative to database time. Integer 0..31_536_000_000 (365 days). Exclusive with availableAt. */
    delayMs?: number;
    /** Absolute earliest delivery instant. Exclusive with delayMs. */
    availableAt?: Date;
    /** Override the outbox default. Integer 1..1000. */
    maxAttempts?: number;
  };
}[keyof Topics & string];

export interface EnqueueResult {
  /** UUIDv7 of the stored message (the existing one when deduped). */
  id: string;
  topic: string;
  /** True when (topic, dedupeKey) already existed and nothing was inserted. */
  deduped: boolean;
}

/** A message as seen by handlers, publishers and admin helpers. */
export interface OutboxMessage<P = unknown> {
  id: string;
  /** Database sequence number, decimal string (int8 can exceed 2^53). */
  seq: string;
  topic: string;
  key: string | null;
  payload: P;
  headers: Readonly<Record<string, string>>;
  dedupeKey: string | null;
  status: MessageStatus;
  /** Number of claims so far, including the current one inside a handler. */
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  availableAt: Date;
  lastError: string | null;
}

export type MessageStatus = 'pending' | 'in_flight' | 'done' | 'dead' | 'skipped';
```

Validation rules (all checked before SQL; failures throw `OUTBOX_INVALID_MESSAGE` with `details: { index, field, reason }`):

| Field | Rule |
|---|---|
| `topic` | string matching `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$` |
| `payload` | `JSON.stringify(payload)` returns a string (not `undefined`) and does not throw (BigInt, cycles); size ≤ `maxPayloadBytes` else `OUTBOX_PAYLOAD_TOO_LARGE` |
| `key` | `undefined`, `null` or string of 1..200 chars |
| `headers` | plain object; ≤ 50 entries; every value a string; name 1..100 chars, value ≤ 2000 chars |
| `dedupeKey` | `undefined` or string 1..200 chars |
| `delayMs` | `undefined` or safe integer 0..31_536_000_000 |
| `availableAt` | `undefined` or a `Date` with a finite time |
| `delayMs` + `availableAt` | not both |
| `maxAttempts` | `undefined` or integer 1..1000 |
| batch | array length 0..1000 (0 returns `[]` without SQL); unknown extra properties are rejected (catches typos such as `dedupe_key`) |

### 5.3 Outbox interface

```ts
export interface Outbox<TTx, Topics extends TopicMap = DefaultTopics> {
  readonly config: ResolvedOutboxConfig;

  /** Insert one message using the caller's transaction. One statement. */
  enqueue(tx: TTx, message: MessageInput<Topics>): Promise<EnqueueResult>;
  /** Insert up to 1000 messages using the caller's transaction. One statement. Results in input order. */
  enqueue(tx: TTx, messages: readonly MessageInput<Topics>[]): Promise<EnqueueResult[]>;

  createRelay(options: RelayOptions<Topics>): Relay;

  /** Run fn at most once per (consumer, messageId), inside the caller's transaction. */
  withInbox<T>(tx: TTx, consumer: string, messageId: string, fn: (tx: TTx) => Promise<T>): Promise<InboxResult<T>>;
  purgeInbox(options: { olderThanMs: number; batchSize?: number }): Promise<{ deleted: number }>;

  retryDead(filter?: RetryDeadFilter): Promise<{ ids: string[] }>;
  skip(id: string): Promise<{ id: string; previousStatus: 'pending' | 'dead' }>;
  purge(options: PurgeOptions): Promise<{ deleted: number }>;
  listDead(options?: { topic?: string; limit?: number }): Promise<OutboxMessage[]>;
  stats(options?: { includeTerminal?: boolean }): Promise<OutboxStats>;

  migrate(options?: { dryRun?: boolean }): Promise<MigrateResult>;
  schemaVersion(): Promise<{ current: number; required: number }>;
}

export interface ResolvedOutboxConfig {
  schema: string;
  tablePrefix: string;
  maxAttempts: number;
  notify: boolean;
  maxPayloadBytes: number;
  /** Fully quoted names used in SQL, e.g. "public"."outbox_messages". */
  names: { messages: string; inbox: string; migrations: string; testClock: string; now: string };
  /** NOTIFY channel: `${schema}.${tablePrefix}messages`. */
  channel: string;
}

export interface RetryDeadFilter {
  ids?: readonly string[];   // 1..1000 UUIDs
  topic?: string;
  key?: string;
  limit?: number;            // default 1000, 1..10000
}

export interface PurgeOptions {
  /** Delete terminal messages finished more than this many ms ago (database time). ≥ 0. */
  olderThanMs: number;
  /** Also delete dead messages (by dead_at). Default false. */
  includeDead?: boolean;
  /** Rows per DELETE statement. Default 5000, 1..50000. */
  batchSize?: number;
}

export interface OutboxStats {
  /** pending and available_at <= now */
  ready: number;
  /** pending and available_at > now */
  scheduled: number;
  inFlight: number;
  /** in_flight with locked_until < now (a relay died or is late) */
  expiredLeases: number;
  dead: number;
  /** Present only with includeTerminal: true. */
  done?: number;
  skipped?: number;
  /** now - min(available_at) over ready messages, in ms; 0 when none. */
  oldestReadyAgeMs: number;
  /** Database time when the stats were read. */
  measuredAt: Date;
}

export interface MigrateResult {
  applied: { version: number; name: string }[];
  currentVersion: number;
  dryRun: boolean;
  /** SQL that ran (or would run with dryRun). */
  sql: string;
}

export type InboxResult<T> = { status: 'processed'; result: T } | { status: 'duplicate' };
```

`skip` throws `OUTBOX_NOT_SKIPPABLE` (`details: { id, status }`) when the message is in another status, and `OUTBOX_NOT_FOUND` when no row has that id.

### 5.4 createRelay options

```ts
export type RelayOptions<Topics extends TopicMap = DefaultTopics> =
  | (RelayCommonOptions & { handlers: Handlers<Topics>; publisher?: never })
  | (RelayCommonOptions & { publisher: Publisher; handlers?: never; topics?: readonly string[] });

export type Handlers<Topics extends TopicMap> = {
  [K in keyof Topics & string]?: Handler<Topics[K]>;
};
export type Handler<P = unknown> = (message: OutboxMessage<P>, ctx: DeliveryContext) => Promise<void>;
export type Publisher = (message: OutboxMessage, ctx: DeliveryContext) => Promise<void>;

export interface DeliveryContext {
  /** Aborted on handler timeout (reason: OutboxError OUTBOX_HANDLER_TIMEOUT) or forced shutdown (reason: OutboxError OUTBOX_SHUTDOWN). */
  signal: AbortSignal;
  /** 1-based attempt number (equals message.attempts). */
  attempt: number;
  relayId: string;
}

export interface RelayCommonOptions {
  /** Override the outbox db for this relay (e.g. a dedicated pool). Same driver type as the outbox. */
  db?: unknown; // typed per adapter as TDb
  /** Default `${os.hostname()}:${process.pid}:${4 random hex bytes}`. 1..200 chars. */
  relayId?: string;
  batchSize?: number;          // default 10, 1..1000, must be <= concurrency
  concurrency?: number;        // default 10, 1..1000
  leaseMs?: number;            // default 60_000, 1_000..86_400_000, >= handlerTimeoutMs + 1000
  handlerTimeoutMs?: number;   // default 30_000, 100..3_600_000
  ordering?: 'none' | 'key';   // default 'none'
  retry?: {
    baseDelayMs?: number;      // default 1000, 0..3_600_000
    factor?: number;           // default 2, 1..10 (finite)
    maxDelayMs?: number;       // default 300_000, >= baseDelayMs, <= 86_400_000
    jitter?: 'full' | 'none';  // default 'full'
  };
  poll?: {
    minIntervalMs?: number;    // default 100, 10..60_000
    maxIntervalMs?: number;    // default 2000, >= minIntervalMs, <= 300_000
  };
  /** LISTEN wake-up. true = use the relay db; { db } = separate direct connection; false = poll only. Default true. */
  listen?: boolean | { db: unknown };
  reclaimIntervalMs?: number;  // default 10_000, 500..3_600_000
  reclaimBatchSize?: number;   // default 1000, 1..10_000
  /** Default drain timeout used by stop() and by signal abort. Default 30_000, 0..3_600_000. */
  drainTimeoutMs?: number;
  /** Stop the relay when this signal aborts (uses drainTimeoutMs). */
  signal?: AbortSignal;
  tracer?: Tracer;
}
```

| Option | Default | Range / rule | Effect |
|---|---|---|---|
| `handlers` / `publisher` | one required | exactly one | Handlers mode claims only topics with a handler (FR-40) |
| `topics` | all topics | publisher mode only, 1..1000 topic names | Claim filter |
| `db` | outbox `db` | same driver | Relay statements use it |
| `relayId` | host:pid:random | 1..200 chars | Stored in `locked_by` |
| `batchSize` | 10 | 1..1000, ≤ `concurrency` | Max rows per claim |
| `concurrency` | 10 | 1..1000 | Max simultaneous deliveries |
| `leaseMs` | 60000 | 1000..86400000, ≥ `handlerTimeoutMs + 1000` | `locked_until = now + leaseMs` |
| `handlerTimeoutMs` | 30000 | 100..3600000 | Abort and fail after this |
| `ordering` | `'none'` | `'none'`, `'key'` | §9.4 |
| `retry.baseDelayMs` | 1000 | 0..3600000 | §9.3.3 |
| `retry.factor` | 2 | 1..10 | |
| `retry.maxDelayMs` | 300000 | ≥ base, ≤ 86400000 | Also clamps `retryAfterMs` |
| `retry.jitter` | `'full'` | `'full'`, `'none'` | `'none'` is for tests and deterministic systems |
| `poll.minIntervalMs` | 100 | 10..60000 | |
| `poll.maxIntervalMs` | 2000 | ≥ min, ≤ 300000 | Upper bound on discovery latency (GU-08) |
| `listen` | `true` | boolean or `{ db }` | §10 |
| `reclaimIntervalMs` | 10000 | 500..3600000 | GU-09 bound |
| `reclaimBatchSize` | 1000 | 1..10000 | Rows per reclaim statement; loops while full |
| `drainTimeoutMs` | 30000 | 0..3600000 | §9.6.3 |
| `signal` | none | AbortSignal | Calls `stop()` on abort |
| `tracer` | none | §14.2 | |

Unknown option names throw `OUTBOX_CONFIG` (catches `maxRetries`, `attempts`, `backoff` typos, which is the class of bug this library exists to prevent). In handlers mode, a handler value that is not a function, or an empty handlers object, throws `OUTBOX_CONFIG`.

`relayId` must be unique among relays running at the same time against one table. Fencing (§9.3) compares `(locked_by, attempts)`, and `attempts` is not strictly increasing (shutdown release decrements it, `retryDead` resets it), so two live relays sharing an id weaken the fence. The library cannot detect a shared id; the default includes 4 random bytes, and the TSDoc and docs "Operations" say "only set `relayId` if each process sets a different value".

### 5.5 Relay interface and events

```ts
export interface Relay {
  readonly id: string;
  readonly state: 'idle' | 'starting' | 'running' | 'stopping' | 'stopped';
  /** Check schema version, reclaim once, open LISTEN, start the loop. Rejects with OUTBOX_NOT_MIGRATED or OUTBOX_RELAY_STATE. */
  start(): Promise<void>;
  /** Graceful stop. Idempotent: later calls return the first call's promise. */
  stop(options?: { drainTimeoutMs?: number }): Promise<StopResult>;
  /** Claim and deliver at most one batch, flush outcomes, resolve. Only in state 'idle' (not started). */
  runOnce(): Promise<RunOnceResult>;
  on<E extends keyof RelayEvents>(event: E, listener: (payload: RelayEvents[E]) => void): () => void;
  off<E extends keyof RelayEvents>(event: E, listener: (payload: RelayEvents[E]) => void): void;
}

export interface StopResult {
  /** True when every in-flight delivery finished before the drain timeout. */
  drained: boolean;
  /** Leases released back to pending after the timeout. */
  released: number;
  durationMs: number;
}

export interface RunOnceResult {
  claimed: number;
  delivered: number;
  failed: number;
  dead: number;
  leaseLost: number;
  reclaimed: number;
}

export interface RelayEvents {
  claimed: { relayId: string; count: number; ids: string[]; durationMs: number };
  delivered: { relayId: string; message: OutboxMessage; durationMs: number };
  failed: { relayId: string; message: OutboxMessage; error: unknown; willRetry: boolean; retryInMs: number | null };
  dead: { relayId: string; message: OutboxMessage | { id: string; topic: string; attempts: number }; error: unknown };
  reclaimed: { relayId: string; count: number; ids: string[]; deadIds: string[] };
  leaseLost: { relayId: string; id: string; attempt: number; outcome: 'done' | 'failed' };
  error: { relayId: string; phase: 'start' | 'claim' | 'flush' | 'reclaim' | 'listen' | 'release' | 'listener'; error: unknown };
}
```

Event rules:
- Events are emitted synchronously after the database confirmed the change (for `delivered`, `failed`, `dead`, `reclaimed`, `leaseLost`: after the flush or reclaim statement returned).
- A listener that throws is caught; the relay emits `error` with phase `listener` (a throwing `error` listener is swallowed after one `console.error`).
- If no `error` listener is attached, errors go to `console.error` rate-limited to one line per phase per 10 s (FR-84), formatted `[outbox] <relayId> <phase>: <code or name>: <message>`.
- `dead` from reclaim carries the minimal shape (`id`, `topic`, `attempts`) because reclaim does not return payloads.

Example:

```ts
const relay = outbox.createRelay({
  handlers: {
    'order.created': async (msg, { signal }) => {
      await sendConfirmation(msg.payload.email, msg.payload.orderId, { signal });
    },
  },
  concurrency: 20,
  batchSize: 20,
  ordering: 'key',
});

relay.on('dead', ({ message, error }) => log.error({ id: message.id, error }, 'outbox message dead'));
relay.on('error', ({ phase, error }) => log.warn({ phase, error }, 'outbox relay error'));

await relay.start();
process.on('SIGTERM', async () => {
  const result = await relay.stop({ drainTimeoutMs: 20_000 });
  log.info(result, 'relay stopped');
  await sql.end();
});
```

### 5.6 Inbox

```ts
// From adapter entries; also available as outbox.withInbox / outbox.purgeInbox.
export function createInbox(config: { db: TDb; schema?: string; tablePrefix?: string }): Inbox<TTx>;

export interface Inbox<TTx> {
  withInbox<T>(tx: TTx, consumer: string, messageId: string, fn: (tx: TTx) => Promise<T>): Promise<InboxResult<T>>;
  purgeInbox(options: { olderThanMs: number; batchSize?: number }): Promise<{ deleted: number }>;
  migrate(options?: { dryRun?: boolean }): Promise<MigrateResult>;
}
```

`consumer`: 1..200 chars, `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$`. `messageId`: 1..200 chars, any characters. Violations throw `OUTBOX_INVALID_MESSAGE` before SQL. Semantics in §9.8.

### 5.7 Core entry exports (`@firatkill/outbox`)

```ts
export { createOutboxCore } from './core/outbox.js';       // for custom adapters (§6.6)
export { migrationSql, MIGRATIONS, REQUIRED_SCHEMA_VERSION } from './core/migrations/index.js';
export { computeBackoffMs } from './core/backoff.js';
export { OutboxError, RetryableError, NonRetryableError, isOutboxError, isRetryableError, isNonRetryableError } from './core/errors.js';
export type { OutboxErrorCode } from './core/errors.js';
export type * from './core/types.js';                       // all types in §5.2–§5.6, §6.1, §14.2
/** The library version, inlined at build time (§4.2). */
export const VERSION: string = __OUTBOX_VERSION__;
```

```ts
export function migrationSql(options?: {
  schema?: string;        // default 'public'
  tablePrefix?: string;   // default 'outbox_'
  fromVersion?: number;   // default 0 (exclusive)
  toVersion?: number;     // default REQUIRED_SCHEMA_VERSION (inclusive)
}): string;

export function computeBackoffMs(
  attempt: number,                       // integer >= 1: the attempt that just failed
  policy: Required<NonNullable<RelayCommonOptions['retry']>>,
  random?: () => number,                 // default Math.random, must return [0, 1)
): number;                               // integer in [0, min(maxDelayMs, base * factor^(attempt-1))]
```

### 5.8 Testing entry (`@firatkill/outbox/testing`)

```ts
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
export function testClock(target: Outbox<unknown, TopicMap> | Inbox<unknown>): TestClock;
```

Design and SQL in §11.

How `testClock` reaches the database (normative): `createOutboxCore` and `createInbox` attach a non-enumerable, read-only property keyed by `Symbol.for('@firatkill/outbox/internal')` holding `{ adapter: DriverAdapter, config: ResolvedOutboxConfig }`. The symbol is not part of the public types. `testClock` reads it (throwing `OUTBOX_CONFIG` "testClock needs an object returned by createOutbox or createInbox" if absent), runs `install`/`set`/`advance`/`reset`/`now`/`uninstall` through `adapter.query` (and `install`/`uninstall` through `adapter.transaction`), and runs `setLocal` through `adapter.forTransaction(tx)`. The symbol key works across the ESM and CJS builds for the same reason as the error brand (PRD D-29).

### 5.9 Errors and codes (normative)

```ts
const BRAND = Symbol.for('@firatkill/outbox/error');

export type OutboxErrorCode =
  | 'OUTBOX_CONFIG' | 'OUTBOX_INVALID_MESSAGE' | 'OUTBOX_PAYLOAD_TOO_LARGE'
  | 'OUTBOX_NOT_MIGRATED' | 'OUTBOX_MIGRATION_CHECKSUM' | 'OUTBOX_MIGRATION_FAILED'
  | 'OUTBOX_RELAY_STATE' | 'OUTBOX_HANDLER_TIMEOUT' | 'OUTBOX_SHUTDOWN'
  | 'OUTBOX_RETRYABLE' | 'OUTBOX_NON_RETRYABLE'
  | 'OUTBOX_NOT_FOUND' | 'OUTBOX_NOT_SKIPPABLE' | 'OUTBOX_LEASE_LOST'
  | 'OUTBOX_WEBHOOK_STATUS' | 'OUTBOX_WEBHOOK_TIMEOUT' | 'OUTBOX_WEBHOOK_NETWORK'
  | 'OUTBOX_LEASE_EXPIRED' | 'OUTBOX_DRIVER' | 'OUTBOX_INTERNAL';

export class OutboxError extends Error {
  readonly [BRAND] = true;
  readonly code: OutboxErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
  constructor(code: OutboxErrorCode, message: string, options?: { cause?: unknown; details?: Record<string, unknown> });
}
export class RetryableError extends OutboxError {
  /** Overrides the computed backoff; clamped to [0, retry.maxDelayMs]. */
  readonly retryAfterMs: number | undefined;
  constructor(message: string, options?: { retryAfterMs?: number; cause?: unknown; details?: Record<string, unknown> });
}
export class NonRetryableError extends OutboxError {
  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> });
}
export function isOutboxError(err: unknown, code?: OutboxErrorCode): err is OutboxError;
export function isRetryableError(err: unknown): err is RetryableError;     // code === 'OUTBOX_RETRYABLE'
export function isNonRetryableError(err: unknown): err is NonRetryableError; // code === 'OUTBOX_NON_RETRYABLE'
```

`isOutboxError` checks `typeof err === 'object' && err !== null && (err as any)[BRAND] === true` plus the code, never `instanceof` (PRD D-29).

| Code | Thrown by / used for | Meaning | What the message tells the user |
|---|---|---|---|
| `OUTBOX_CONFIG` | `createOutbox`, `createInbox`, `createRelay` | Invalid or unknown option | Every issue, e.g. `batchSize (50) must be <= concurrency (10)` |
| `OUTBOX_INVALID_MESSAGE` | `enqueue`, `withInbox` | Field fails validation | Index, field, rule |
| `OUTBOX_PAYLOAD_TOO_LARGE` | `enqueue` | JSON bytes > `maxPayloadBytes` | Size and limit |
| `OUTBOX_NOT_MIGRATED` | `relay.start`, `schemaVersion`, `stats` when the table is missing | DB schema version < required | `Run: npx outbox migrate --schema <s> --prefix <p>` |
| `OUTBOX_MIGRATION_CHECKSUM` | `migrate` | An applied migration's checksum differs from the library's | Version, both checksums; never auto-fixed |
| `OUTBOX_MIGRATION_FAILED` | `migrate` | A migration statement failed; that migration's transaction rolled back | Version and the PostgreSQL error as `cause` |
| `OUTBOX_RELAY_STATE` | `start`, `runOnce` | Wrong lifecycle state | Current state |
| `OUTBOX_HANDLER_TIMEOUT` | relay (abort reason, stored in `last_error`) | Handler exceeded `handlerTimeoutMs` | Timeout value; retryable |
| `OUTBOX_SHUTDOWN` | relay (abort reason) | Forced stop after drain timeout | Never stored; the lease is released |
| `OUTBOX_RETRYABLE` | user code (`RetryableError`) | Retry, optionally after `retryAfterMs` | User message |
| `OUTBOX_NON_RETRYABLE` | user code, webhook publisher | Do not retry; move to dead | User message |
| `OUTBOX_NOT_FOUND` | `skip` | No message with that id | Id |
| `OUTBOX_NOT_SKIPPABLE` | `skip` | Status is not pending or dead | Id and status |
| `OUTBOX_LEASE_LOST` | `leaseLost` event payload context, `error` never | Completion arrived after the lease moved | Informational |
| `OUTBOX_WEBHOOK_STATUS` | webhook publisher (as `details.reason` of the thrown error, never as its `code`) | Non-2xx response | Status, URL host, first 500 bytes of body |
| `OUTBOX_WEBHOOK_TIMEOUT` | webhook publisher (as `details.reason`) | No response within `timeoutMs` | Retryable |
| `OUTBOX_WEBHOOK_NETWORK` | webhook publisher (as `details.reason`) | fetch threw (DNS, reset) | Retryable |
| `OUTBOX_LEASE_EXPIRED` | reclaim (text prefix of `last_error` only, never thrown) | The lease ran out before an outcome was recorded | Holder relay id and expiry time |
| `OUTBOX_DRIVER` | relay, admin | Wraps a driver error with the statement name (`claim`, `complete`, ...) in `details.statement`; original in `cause` | |
| `OUTBOX_INTERNAL` | anywhere | Invariant broken inside the library (bug) | "Please report" with details |

Webhook errors (normative): the webhook publisher always throws a `RetryableError` (code `OUTBOX_RETRYABLE`) or a `NonRetryableError` (code `OUTBOX_NON_RETRYABLE`), so the relay's classification by code keeps working. The specific reason is carried three ways: `details.reason` is one of `OUTBOX_WEBHOOK_STATUS`, `OUTBOX_WEBHOOK_TIMEOUT`, `OUTBOX_WEBHOOK_NETWORK`; the `message` starts with that reason followed by `: ` (for example `OUTBOX_WEBHOOK_STATUS: 503 from hooks.example.com/orders`); and `cause` is the underlying fetch error when there is one. The stored `last_error` is therefore e.g. `OUTBOX_RETRYABLE: OUTBOX_WEBHOOK_TIMEOUT: no response from hooks.example.com/orders within 200 ms`.

Errors thrown inside the caller's transaction (`enqueue`, `withInbox`) are not wrapped: driver errors propagate unchanged so the caller's transaction code behaves as with any other query.

Error to `last_error` text (normative): `` `${isOutboxError(e) ? e.code : (e instanceof Error ? e.name : 'Error')}: ${e instanceof Error ? e.message : String(e)}` `` truncated to 2000 UTF-16 code units, with a trailing `…` when truncated.

How handler errors are classified:

| Thrown value | Outcome |
|---|---|
| `NonRetryableError` (by brand/code) | `dead` now |
| `RetryableError` with `retryAfterMs` | `pending`, delay = clamp(retryAfterMs, 0, maxDelayMs) unless attempts exhausted |
| anything else, including `OUTBOX_HANDLER_TIMEOUT` | `pending` with computed backoff unless attempts exhausted |

---

## 6. Adapters

### 6.1 What adapters do

An adapter turns a driver handle into a `DriverAdapter` (§6.6) and calls `createOutboxCore`. Adapters contain no SQL and no business logic. Each is under 150 lines.

### 6.2 postgres.js adapter (`src/adapters/postgres-js.ts`)

Structural types (no import from `postgres`):

```ts
export interface PostgresJsSql {
  unsafe(query: string, params?: readonly unknown[]): PromiseLike<readonly Record<string, unknown>[]>;
  begin<T>(fn: (tx: PostgresJsTx) => Promise<T>): Promise<T>;
  listen(channel: string, onNotify: (payload: string) => void, onListen?: () => void): Promise<{ unlisten(): Promise<void> }>;
}
export interface PostgresJsTx {
  unsafe(query: string, params?: readonly unknown[]): PromiseLike<readonly Record<string, unknown>[]>;
}
```

| Adapter member | Implementation |
|---|---|
| `forTransaction(tx)` | `{ query: (text, params) => tx.unsafe(text, params).then(toArray) }` |
| `query` | `sql.unsafe(text, params)` |
| `transaction(fn)` | `sql.begin((tx) => fn(wrap(tx)))` (used only by migrations and test helpers) |
| `listen(channel, onNotify, onReconnect, onError)` | `sql.listen(channel, () => onNotify(), () => { if (!first) onReconnect(); first = false; })`; a rejection of the `listen` promise goes to `onError`; close calls `unlisten()`. postgres.js keeps a dedicated listen connection and reconnects itself; `onListen` fires on every (re)connect (A-03). |
| `name` | `'postgres-js'` |

Parameter passing: every parameter is sent as a string, number, boolean or null; JSON inputs are always `JSON.stringify` strings cast in SQL (`$1::jsonb`). Neither driver tells the server a parameter type for these values (postgres.js `unsafe` and pg both send them untyped), so every parameter in library SQL carries an explicit cast (`$1::text`, `$2::int4`, `$3::int8`, `$4::jsonb`); see §9. `sql.unsafe(text, params)` does not use prepared statements by default and uses the simple query protocol when `params` is empty (A-03), which is what the migration runner relies on for multi-statement templates. Users behind a transaction-mode pooler must still create the client with `prepare: false` for their own tagged-template queries (docs "Operations").

### 6.3 pg adapter (`src/adapters/pg.ts`)

```ts
export interface PgQueryResultLike { rows: Record<string, unknown>[] }
export interface PgClientLike {
  query(text: string, params?: unknown[]): Promise<PgQueryResultLike>;
  on(event: 'notification', listener: (msg: { channel: string; payload?: string }) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  removeAllListeners?(event?: string): unknown;
}
export interface PgPoolClientLike extends PgClientLike { release(destroy?: boolean | Error): void }
export interface PgPool {
  query(text: string, params?: unknown[]): Promise<PgQueryResultLike>;
  connect(): Promise<PgPoolClientLike>;
}
export type PgTx = PgClientLike; // a pg Client or PoolClient inside BEGIN
```

| Adapter member | Implementation |
|---|---|
| `forTransaction(client)` | `{ query: (t, p) => client.query(t, [...p]).then((r) => r.rows) }` |
| `query` | `pool.query(t, [...p]).then((r) => r.rows)` |
| `transaction(fn)` | `connect` → `begin` → `fn` → `commit`; on error `rollback` then rethrow; `release()` in `finally`; if `rollback` itself fails, `release(err)` destroys the client |
| `listen(channel, onNotify, onReconnect, onError)` | Check out one client with `pool.connect()` (or from `listen: { db }`), run `listen "<channel>"` (quoted with `quoteIdent`), attach `notification` (filtered to `msg.channel === channel`) and `error` handlers. On `error`: call `onError(err)`, `release(err)`, wait (1 s doubling to 30 s), reconnect, call `onReconnect()`. `close()` runs `unlisten *`, removes listeners, releases the client. pg uses the simple query protocol when the params array is empty, so `query(text, [])` can run multi-statement migration templates (A-04). |
| `name` | `'pg'` |

The listen client is held for the relay's lifetime, so the pool needs `max ≥ 2` per relay (one listen, at least one for statements). Docs state this. INT-80 checks that `transaction` releases clients on success and failure.

### 6.4 Type mapping (normative)

All SQL in §9 returns only these types, so both drivers parse identically (PRD D-30):

| Value | SQL expression | Driver returns | Core converts with |
|---|---|---|---|
| id, seq, topic, key, dedupe key, status, last error | `col::text` | string | as is |
| payload, headers | `col::text` | string | `JSON.parse` |
| timestamps | `(extract(epoch from col) * 1000)::float8` | number | `new Date(n)` |
| counts, attempts | `col::int4` / `count(*)::int4` | number | as is |
| flags | `boolean` | boolean | as is |

`src/core/row.ts` defines `mapMessageRow(row): OutboxMessage` with a runtime check of every field type; a mismatch throws `OUTBOX_INTERNAL` naming the column (catches driver type-parser surprises, A-04).

### 6.5 Poolers

| Feature | Session pooler / direct | Transaction-mode pooler (PgBouncer, Supavisor 6543) |
|---|---|---|
| `enqueue` | yes | yes (runs in the caller's transaction) |
| claim, complete, fail, reclaim, admin | yes | yes (single statements; no session state; no advisory session locks) |
| migrations | yes | yes (`pg_advisory_xact_lock` is transaction-scoped) |
| NOTIFY from `enqueue` | yes | yes (sent at commit of the transaction) |
| LISTEN | yes | no: pass `listen: { db: <direct connection> }` or `listen: false` |
| test clock `setLocal` | yes | yes (`set local` is transaction-scoped) |
| postgres.js prepared statements | yes | set `prepare: false` |

### 6.6 DriverAdapter interface (public, normative)

```ts
export type SqlParam = string | number | boolean | null;

export interface SqlExecutor {
  /** With an empty params array the executor must accept several ;-separated statements (simple query protocol); the migration runner relies on this. */
  query(text: string, params: readonly SqlParam[]): Promise<Record<string, unknown>[]>;
}

export interface ListenHandle {
  close(): Promise<void>;
}

export interface DriverAdapter<TDb, TTx> {
  readonly name: string;
  readonly db: TDb;
  /** Autocommit executor for single statements. */
  readonly query: SqlExecutor['query'];
  /** Wrap a caller-owned transaction handle. Must not BEGIN/COMMIT. */
  forTransaction(tx: TTx): SqlExecutor;
  /** Run fn in a new transaction (migrations, tests). */
  transaction<T>(fn: (executor: SqlExecutor) => Promise<T>): Promise<T>;
  /** Optional. Without it, relays poll only. */
  listen?(channel: string, onNotify: () => void, onReconnect: () => void, onError: (err: unknown) => void): Promise<ListenHandle>;
  /** Build an adapter for a relay `db` or `listen.db` override. */
  withDb(db: TDb): DriverAdapter<TDb, TTx>;
}

export function createOutboxCore<TDb, TTx, Topics extends TopicMap = DefaultTopics>(
  adapter: DriverAdapter<TDb, TTx>,
  config: Omit<OutboxConfig<TDb>, 'db'>,
): Outbox<TTx, Topics>;
```

`withInbox` passes the caller's original `tx` to `fn`, so adapters never need to convert an executor back into a driver handle. The docs page "API reference → Custom drivers" shows a 40-line adapter for a fictional driver.

---

## 7. Schema

### 7.1 Rendering rules (normative)

SQL in this document is written with the default names (`schema = 'public'`, `tablePrefix = 'outbox_'`). The library stores SQL as templates and renders them once per outbox instance in `src/core/sql/render.ts`:

| Template token | Rendered (defaults) | Rule |
|---|---|---|
| `{{schema}}` | `"public"` | `quoteIdent(schema)` |
| `{{messages}}` | `"public"."outbox_messages"` | `quoteIdent(schema) + '.' + quoteIdent(prefix + 'messages')` |
| `{{inbox}}` | `"public"."outbox_inbox"` | same pattern |
| `{{migrations}}` | `"public"."outbox_schema_migrations"` | same pattern |
| `{{test_clock}}` | `"public"."outbox_test_clock"` | same pattern |
| `{{now}}` | `"public"."outbox_now"()` | function call |
| `{{p}}` | `outbox_` | raw prefix, used only inside index and constraint names that are then quoted as a whole: `"{{p}}messages_claim_idx"` |

`quoteIdent(s)` returns `'"' + s.replaceAll('"', '""') + '"'`. Identifiers are validated first (`^[a-z_][a-z0-9_]*$`, schema 1..30, prefix 1..20, PRD D-32), so quoting is defence in depth. The longest derived name is `<prefix>messages_pending_attempts_ck` at most 20 + 28 = 48 bytes (implicit names such as `<prefix>schema_migrations_pkey` and the identity sequence `<prefix>messages_seq_seq` are shorter), below the 63-byte limit. The NOTIFY channel is `${schema}.${tablePrefix}messages` (at most 30 + 1 + 20 + 8 = 59 bytes); `pg_notify` rejects channel names of 64 bytes or more, so this limit matters.

UT-04 snapshots the rendered SQL for the default names and for `schema = 'app_events', tablePrefix = 'ob_'`.

### 7.2 Bootstrap (run by the runner before any migration, and emitted first by `migrationSql`)

```sql
create schema if not exists "public";

create table if not exists "public"."outbox_schema_migrations" (
  version    integer     primary key,
  name       text        not null,
  checksum   text        not null,
  applied_at timestamptz not null default now()
);
```

`applied_at` uses `now()` directly because `outbox_now()` may not exist yet; it is bookkeeping, not delivery logic.

### 7.3 Migration 0001 `initial` (normative)

```sql
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
```

Column notes:

| Column | Written by | Notes |
|---|---|---|
| `id` | enqueue (UUIDv7 from TypeScript) | No database default on purpose: every row must come from `enqueue` or from SQL that supplies an id (docs show `gen_random_uuid()` for manual inserts) |
| `seq` | identity | Ordering key and tie-breaker; never reused |
| `attempts` | claim (+1), shutdown release (−1), retryDead (= 0) | Counts claims (PRD D-16) |
| `available_at` | enqueue, fail (backoff), reclaim, retryDead, release | Earliest claim time, database time |
| `created_at` | enqueue (default) | Start time of the enqueuing transaction (`now()` semantics) |
| `locked_by`, `locked_until` | claim; cleared by every exit from `in_flight` | Lease |
| `last_attempt_at` | claim | Diagnostics |
| `completed_at` | complete, skip | Purge cutoff |
| `dead_at` | fail/reclaim to dead | Cleared by retryDead and skip |
| `last_error` | fail, reclaim | Kept after success (PRD D-36) |

### 7.4 Index rationale and sizes

- Every hot query (claim, reclaim, ordering probe, dedupe) uses a partial index whose size is proportional to unfinished messages, not to table size. A table with 50 million `done` rows and 1,000 pending rows claims as fast as an empty one (INT-37 asserts `EXPLAIN` uses `outbox_messages_claim_idx` with 100,000 done rows present; check with `explain (format json)` and assert the plan contains the index name).
- The primary key on UUIDv7 inserts at the right edge of the B-tree (time-ordered), avoiding random page splits that UUIDv4 causes.
- Status changes move rows between partial indexes, so updates are not HOT. This is the expected cost of a queue table; autovacuum settings above keep bloat bounded. Docs "Operations" gives `pg_stat_user_tables` queries to watch dead tuples.

---

## 8. Migrations

### 8.1 Migration list

`src/core/migrations/index.ts`:

```ts
export interface Migration {
  version: number;      // 1, 2, 3 ... contiguous
  name: string;         // snake_case
  template: string;     // SQL with {{tokens}} (§7.1), LF line endings, no BEGIN/COMMIT
}
export const MIGRATIONS: readonly Migration[] = [m0001Initial];
export const REQUIRED_SCHEMA_VERSION = 1;
```

Checksum: `sha256` (hex) of `template` with `\r\n` normalised to `\n`, computed with `node:crypto`. Checksums are of the template, not the rendered SQL, so they are identical for every schema and prefix.

### 8.2 Runner (`src/core/migrations/runner.ts`, normative algorithm)

```
migrate({ dryRun }):
  lockKey = 'outbox:migrate:' + schema + '.' + prefix
  tx 1 (bootstrap):
    select pg_advisory_xact_lock(hashtextextended($1::text, 0))  -- $1 = lockKey
    if not dryRun: execute bootstrap (§7.2)
    applied = if dryRun and V1 (§9.10) reports the version table absent: []   -- never select from a missing table: the error would abort the transaction
              else select version, name, checksum from migrations order by version
  verify: for each applied row, the library migration with that version exists and checksum matches
          → else OUTBOX_MIGRATION_CHECKSUM (unknown versions above the library's are allowed: newer library ran)
  pending = MIGRATIONS with version > max(applied.version)
  if dryRun: return { applied: pending, sql: render(bootstrap + pending), dryRun: true }
  for m in pending:
    tx (one per migration):
      select pg_advisory_xact_lock(hashtextextended($1::text, 0))
      if exists (select 1 from migrations where version = m.version): skip (another runner applied it)
      execute render(m.template)                                    -- multi-statement: executor.query(sql, []) with empty params
      insert into migrations (version, name, checksum) values ($1::int4, $2::text, $3::text)
    on error: OUTBOX_MIGRATION_FAILED { version, cause }            -- this migration rolled back; earlier ones stay
  return { applied, currentVersion, sql, dryRun: false }
```

Multi-statement execution: postgres.js `unsafe(sql)` without parameters and pg `client.query(sql)` without parameters both use the simple query protocol, which accepts several statements (A-03, A-04). The version insert is a separate parameterised statement.

`hashtextextended(text, bigint)` exists since PostgreSQL 11.

### 8.3 migrationSql

`migrationSql({ schema, tablePrefix, fromVersion = 0, toVersion = REQUIRED_SCHEMA_VERSION })` returns:

```sql
-- @firatkill/outbox schema migrations 1..1 for schema "public", prefix "outbox_"
-- Generated by @firatkill/outbox 0.1.0. Run inside one transaction. Do not edit.
create schema if not exists "public";
create table if not exists "public"."outbox_schema_migrations" ( ... );            -- §7.2

-- migration 1: initial
<rendered 0001 template>
insert into "public"."outbox_schema_migrations" (version, name, checksum)
  values (1, 'initial', '<sha256 hex>') on conflict (version) do nothing;
```

The version-table insert lets `relay.start()` verify the schema even when the user ran the SQL through another tool. INT-05 proves that `migrationSql` applied as one script produces the same catalog (columns, constraints, index definitions, version rows) as the runner.

Docs examples (site page "Quick start → Migrations"):

```ts
// Knex: migrations/20261021_outbox.ts
import { migrationSql } from '@firatkill/outbox';
export async function up(knex) { await knex.raw(migrationSql()); }
export async function down() { throw new Error('irreversible'); }
```

```bash
# Prisma: create an empty migration and fill it
npx prisma migrate dev --create-only --name outbox
npx outbox migrate --print > prisma/migrations/<timestamp>_outbox/migration.sql
npx prisma migrate dev
```

```bash
# Drizzle: custom migration
npx drizzle-kit generate --custom --name=outbox
npx outbox migrate --print > drizzle/<number>_outbox.sql
npx drizzle-kit migrate
```

Upgrades: when a later library version adds migration 2, users of external tools generate the delta with `npx outbox migrate --print --from 1`.

### 8.4 CLI (`src/cli.ts`)

Argument parsing with `node:util` `parseArgs`. No dependencies.

```
Usage: outbox <command> [options]

Commands:
  migrate            Apply pending migrations
  stats              Print queue statistics

Options (all commands):
  --url <url>        Connection string (default: $DATABASE_URL)
  --schema <name>    Schema (default: public)
  --prefix <prefix>  Table prefix (default: outbox_)
  --driver <name>    postgres-js | pg (default: first installed of postgres, pg)
  -h, --help
  -v, --version

migrate options:
  --dry-run          Print the SQL that would run; change nothing
  --status           Print applied and pending versions
  --check            With --status: exit 3 when migrations are pending
  --print            Print migrationSql() and exit (no connection)
  --from <n>         With --print: start after version n (default 0)

stats options:
  --json             Machine-readable output
```

| Exit code | Meaning |
|---|---|
| 0 | Success |
| 1 | Runtime error (connection, migration failure, checksum mismatch); message on stderr |
| 2 | Usage error (unknown command or option, missing URL, no driver installed) |
| 3 | `--status --check` found pending migrations |

Driver loading: `await import('postgres')`, falling back to `await import('pg')`; if neither resolves, exit 2 with `Install a driver: npm i postgres  (or: npm i pg)`. Connections use one connection (`max: 1`) and are closed before exit. The password in `--url` is never printed; errors print the URL with the password replaced by `***` (UT-12).

`--status` output (normative format):

```
schema "public", prefix "outbox_"
applied  1 initial   2026-10-21T10:00:00.000Z
pending  (none)
```

`stats` output: one `key: value` line per `OutboxStats` field (with `includeTerminal: true`), or the JSON object with `--json`.

### 8.5 Rules for future migrations

1. Never edit an applied migration; add a new version. The checksum check enforces this.
2. Within a major version, migrations are additive: new nullable columns or columns with defaults, new indexes (`create index concurrently` is not allowed inside a transaction, so new indexes on large tables are documented as an operational step with `--print`), new functions, wider CHECK constraints. No drops, renames or narrower constraints (PRD FR-16).
3. Bump `REQUIRED_SCHEMA_VERSION` only when the library uses the new objects. A library that requires version N refuses to start against N−1 with `OUTBOX_NOT_MIGRATED`.
4. Every migration has an INT test that applies it on top of the previous version with data present.

---

## 9. SQL and algorithms

All statements below are normative. Parameters are numbered as the driver receives them. Every statement except those inside `enqueue` and `withInbox` is executed with the adapter's autocommit `query`, so each statement is its own transaction (PRD D-13).

Rules that apply to every statement in this section:
- Every parameter reference carries an explicit cast (`$1::text`, `$2::int4`, `$3::int8`, `$n::jsonb`, `$n::uuid`). Both drivers send the values untyped (§6.2), and an uncast parameter in a position the server cannot infer (for example `limit $2` or `$1 * interval ...`) would be resolved differently or rejected.
- Every CTE that selects rows `for update [skip locked]` and feeds an UPDATE or DELETE is written `as materialized` (PostgreSQL 12+). This pins the plan to "pick and lock at most `limit` rows once, then modify exactly those rows"; without it the planner may inline the CTE into the outer statement. The materialized form is the one INT-21, INT-22 and INT-41 prove.
- Partial-index predicates in §7.3 and the WHERE clauses below are kept textually identical (same status literals, same `in (...)` order), so the planner can prove the index applies (INT-37 asserts it for the claim).

### 9.1 Enqueue (`src/core/sql/enqueue.ts`)

TypeScript side (normative steps):

1. Validate every message (§5.2). Resolve defaults: `id = uuidv7()`, `headers = {}`, `delay_ms = 0`, `max_attempts = config.maxAttempts`.
2. Collapse duplicates inside the batch by `(topic, dedupeKey)`: the first occurrence is sent; later ones get the first's id with `deduped: true`.
3. Encode the batch as one JSON array: `[{ id, topic, key, payload, headers, dedupe_key, delay_ms, available_at_ms, max_attempts }]` (`available_at_ms` is `availableAt.getTime()` or `null`).
4. Run statement E1 on the caller's transaction. Mark ids in `inserted_ids` as `deduped: false`.
5. If some messages with a `dedupeKey` were not inserted, run statement E2 on the caller's transaction to fetch the existing ids. A missing row throws `OUTBOX_INTERNAL` (cannot happen under Read Committed unless the row was purged between E1 and E2).

E1 (one statement for 1..1000 messages):

```sql
-- $1 jsonb  messages
-- $2 text   notify channel, or null when notify is disabled
with input as (
  select e.ord, e.value as v
  from jsonb_array_elements($1::jsonb) with ordinality as e(value, ord)
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
```

E2 (only when a dedupe hit happened):

```sql
-- $1 jsonb  [{ "ord": 0, "topic": "...", "dedupe_key": "..." }]
select x.ord::int4 as ord, m.id::text as id
from jsonb_to_recordset($1::jsonb) as x(ord int4, topic text, dedupe_key text)
join "public"."outbox_messages" m
  on m.topic = x.topic and m.dedupe_key = x.dedupe_key;
```

Notes:
- `order by ord` makes `seq` follow input order (A-05, asserted by INT-12).
- A conflicting row inserted by a concurrent, uncommitted transaction makes E1 wait for that transaction. If it commits, the row is a dedupe hit and E2 (a new statement with a new Read Committed snapshot) finds it. If it rolls back, E1 inserts. Under Repeatable Read or Serializable, PostgreSQL raises a serialization failure in the conflicting case; the caller retries its transaction as usual (docs FAQ).
- `pg_notify` inside a transaction is queued and delivered only at commit; a rolled-back transaction sends nothing. PostgreSQL also collapses identical notifications within one transaction, so a batch sends one.
- `created_at` and a zero-delay `available_at` equal the start time of the caller's transaction (`now()` semantics), not the commit time. Delays count from transaction start. Docs state this.

### 9.2 Claim, unordered (`src/core/sql/claim.ts`)

Two variants are rendered at relay construction: without a topic filter (C1) and with one (C1T). The relay picks one; there is no `($4 is null or ...)` branch, so the planner always sees a simple predicate.

C1:

```sql
-- $1 text  relay id
-- $2 int4  limit (1..batchSize)
-- $3 int8  lease ms
with candidates as materialized (
  select m.id
  from "public"."outbox_messages" m
  where m.status = 'pending'
    and m.available_at <= "public"."outbox_now"()
  order by m.available_at, m.seq
  limit $2::int4
  for update skip locked
)
update "public"."outbox_messages" m
set status          = 'in_flight',
    locked_by       = $1::text,
    locked_until    = "public"."outbox_now"() + ($3::int8 * interval '1 millisecond'),
    attempts        = m.attempts + 1,
    last_attempt_at = "public"."outbox_now"()
from candidates c
where m.id = c.id
  and m.status = 'pending'          -- defence in depth; the CTE already holds the row lock (A-20)
returning
  m.id::text                                             as id,
  m.seq::text                                            as seq,
  m.topic,
  m.key,
  m.payload::text                                        as payload,
  m.headers::text                                        as headers,
  m.dedupe_key,
  m.status,
  m.attempts,
  m.max_attempts,
  (extract(epoch from m.created_at) * 1000)::float8      as created_at_ms,
  (extract(epoch from m.available_at) * 1000)::float8    as available_at_ms,
  m.last_error;
```

C1T adds, after the `available_at` predicate:

```sql
    and m.topic = any (array(select jsonb_array_elements_text($4::jsonb)))   -- $4 jsonb topics
```

Why this is safe with many relays:
- `FOR UPDATE SKIP LOCKED` in the CTE locks each selected row; a concurrent claim skips rows another claim has locked, so two relays never select the same row in overlapping statements.
- If a row was claimed and committed by another relay between this statement's snapshot and its lock attempt, PostgreSQL re-checks the row's latest version against the WHERE clause (Read Committed re-evaluation); `status = 'pending'` is false, so the row is skipped.
- The UPDATE and the lock happen in one statement, so there is no window in which a row is selected but not yet leased.
- `RETURNING` order is not guaranteed; the relay sorts claimed rows by `seq` (compared as `BigInt`) before starting deliveries.

### 9.3 Outcomes

#### 9.3.1 Complete (`src/core/sql/outcome.ts`)

```sql
-- $1 text   relay id
-- $2 jsonb  [{ "id": "<uuid>", "attempt": 1 }, ...]
update "public"."outbox_messages" m
set status       = 'done',
    completed_at = "public"."outbox_now"(),
    locked_by    = null,
    locked_until = null
from jsonb_to_recordset($2::jsonb) as x(id uuid, attempt int4)
where m.id = x.id
  and m.status = 'in_flight'
  and m.locked_by = $1::text
  and m.attempts = x.attempt
returning m.id::text as id;
```

Ids in the input but not in the result lost their lease (reclaimed and possibly re-claimed by another relay). They produce `leaseLost` with `outcome: 'done'`; the handler's work was not recorded and the message will be (or already was) delivered again (PRD D-17). A completion that arrives after `locked_until` but before any reclaim still succeeds: nobody else took the message, and recording success avoids a needless duplicate.

#### 9.3.2 Fail

```sql
-- $1 text   relay id
-- $2 jsonb  [{ "id": "<uuid>", "attempt": 2, "delay_ms": 1834, "error": "Error: boom", "terminal": false }, ...]
update "public"."outbox_messages" m
set status = case when x.terminal or m.attempts >= m.max_attempts then 'dead' else 'pending' end,
    available_at = case
      when x.terminal or m.attempts >= m.max_attempts then m.available_at
      else "public"."outbox_now"() + (x.delay_ms * interval '1 millisecond')
    end,
    dead_at = case
      when x.terminal or m.attempts >= m.max_attempts then "public"."outbox_now"()
      else null
    end,
    last_error   = x.error,
    locked_by    = null,
    locked_until = null
from jsonb_to_recordset($2::jsonb) as x(id uuid, attempt int4, delay_ms int8, error text, terminal boolean)
where m.id = x.id
  and m.status = 'in_flight'
  and m.locked_by = $1::text
  and m.attempts = x.attempt
returning m.id::text as id, m.status, m.attempts, m.max_attempts;
```

The returned `status` decides the events: `pending` → `failed` (`willRetry: true`, `retryInMs: delay_ms`); `dead` → `failed` (`willRetry: false`) then `dead`. Missing ids → `leaseLost` with `outcome: 'failed'`.

#### 9.3.3 Backoff (normative)

```ts
export function computeBackoffMs(attempt: number, policy: RetryPolicy, random: () => number = Math.random): number {
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError('attempt must be an integer >= 1');
  const exponential = policy.baseDelayMs * Math.pow(policy.factor, attempt - 1); // may overflow to Infinity
  const ceiling = Math.floor(Math.min(policy.maxDelayMs, Number.isFinite(exponential) ? exponential : policy.maxDelayMs));
  if (policy.jitter === 'none') return ceiling;
  const r = random();
  if (!(r >= 0 && r < 1)) throw new RangeError('random() must return a number in [0, 1)');
  return Math.floor(r * (ceiling + 1)); // uniform integer in [0, ceiling]
}
```

Delay used for a failed attempt `n`:
- `RetryableError` with `retryAfterMs` → `clamp(retryAfterMs, 0, maxDelayMs)`, no jitter.
- otherwise → `computeBackoffMs(n, policy)`.

Ceilings with defaults (`base 1000, factor 2, max 300000`):

| Failed attempt | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Ceiling | 1 s | 2 s | 4 s | 8 s | 16 s | 32 s | 64 s | 128 s | 256 s | dead |

With `maxAttempts = 10` there are 9 retry delays; the expected total wait before `dead` is half the sum of ceilings, about 4.3 minutes, plus handler time. Full jitter (uniform in `[0, ceiling]`) spreads retries after an outage so that relays do not hit a recovering dependency in lockstep. Docs "Retries and dead letters" shows how to compute other policies.

### 9.4 Claim in ordering mode

C2 (and C2T with the same topic predicate as C1T):

```sql
-- $1 text relay id, $2 int4 limit, $3 int8 lease ms
with candidates as materialized (
  select m.id
  from "public"."outbox_messages" m
  where m.status = 'pending'
    and m.available_at <= "public"."outbox_now"()
    and (
      m.key is null
      or not exists (
        select 1
        from "public"."outbox_messages" p
        where p.key = m.key
          and p.seq < m.seq
          and p.status in ('pending', 'in_flight', 'dead')
      )
    )
  order by m.available_at, m.seq
  limit $2::int4
  for update of m skip locked
)
update "public"."outbox_messages" m
set status          = 'in_flight',
    locked_by       = $1::text,
    locked_until    = "public"."outbox_now"() + ($3::int8 * interval '1 millisecond'),
    attempts        = m.attempts + 1,
    last_attempt_at = "public"."outbox_now"()
from candidates c
where m.id = c.id
  and m.status = 'pending'          -- defence in depth; the CTE already holds the row lock (A-20)
returning <same columns as C1>;
```

Correctness argument:
- The head of a key is its unfinished message with the lowest `seq`. Only heads (and unkeyed messages) pass the `not exists` test.
- Within one statement, two messages of the same key can never both qualify: the lower one, being `pending`, blocks the higher one in the same snapshot.
- Across concurrent claims: if relay A holds the lock on head `h`, relay B skips `h` (SKIP LOCKED) and every later message of that key still sees `h` as `pending` or `in_flight` in its snapshot, so it does not qualify. If A committed the claim before B's snapshot, `h` is `in_flight` and still blocks.
- The next message becomes claimable only after `h` is `done` or `skipped` and that change is committed. A message in backoff (`pending` with a future `available_at`) or `dead` keeps blocking.
- Why a stale snapshot is safe (the property the whole argument rests on): the `not exists` probe is evaluated with the statement's snapshot, also when PostgreSQL re-checks a locked candidate against its newest version (Read Committed re-evaluation re-runs the subquery with the original snapshot). For a given key, a message with a lower `seq` can leave the blocking set {`pending`, `in_flight`, `dead`} only towards `done`, `skipped` or deletion (`purge` with `includeDead`), and none of those ever returns to the blocking set (`retryDead` moves `dead` to `pending`, blocking to blocking). So a stale snapshot can only show a lower message as still blocking when it no longer is (the claim is merely conservative; the next claim picks the head up); it can never show a lower message as finished while it is unfinished. The only way for an unfinished lower-`seq` message to be invisible is an enqueue transaction that was still open when a higher-`seq` message of the same key committed, which is exactly the case GU-06 excludes (limits below).
- No advisory locks or per-key lock table are used (PRD D-43). "At most one claimed message per key" is held by row state (`in_flight` blocks) rather than by a lock, so it outlives the claim statement, works through transaction-mode poolers, and needs no cleanup after a crash (lease and reclaim already handle that). Transaction-scoped advisory locks are released when the autocommit claim statement commits, so they cannot cover the delivery; session-scoped ones do not work through transaction poolers and stay held by a hung relay.
- The ordering probe uses `outbox_messages_order_idx` (`key, seq` over unfinished rows). Its predicate (`key is not null and status in ('pending', 'in_flight', 'dead')`) is implied by the probe's `p.key = m.key` (a strict operator) and the identical `in` list.

Limits (documented on the docs "Ordering" page):
- Order is by `seq`, which is assigned when the row is inserted, not when the transaction commits. Two transactions that enqueue for the same key concurrently can commit in the opposite order of their `seq`. If the higher `seq` commits first, it may be claimed before the lower one is visible; once the lower one commits it is the head and can be claimed while the higher one is still in flight, so for that key two messages can be in flight at once and finish out of order. GU-06 therefore covers only messages whose enqueuing transactions did not overlap. Producers that need strict order for concurrent writers must serialise them per key (for example by updating the entity row, `select ... for update`, in the same transaction, which they usually already do).
- Throughput per key is at most one message per (delivery latency + claim latency). Across keys, throughput is unchanged as long as there are more active keys than `concurrency`.
- Head-of-line blocking: a failing head delays its whole key by the backoff; a dead head stops its key until `retryDead(...)` or `skip(id)`. Unkeyed messages and other keys are unaffected.
- Scan cost: the claim walks the pending index in `available_at, seq` order and probes each candidate. When many pending rows are blocked behind a few heads, a claim may inspect many rows before finding `limit` claimable ones. Docs advise watching `stats().dead` in ordering mode and keeping keys fine-grained (per entity, not per tenant).
- All relays must use the same mode (PRD FR-58). One unordered relay breaks ordering for everyone.

### 9.5 Delivery engine

#### 9.5.1 Scheduler (pure, `src/core/relay/scheduler.ts`)

```ts
export interface SchedulerState {
  active: number;                 // claimed, not yet finished delivering
  concurrency: number;
  batchSize: number;
  last: { requested: number; claimed: number } | null;  // previous claim, null before the first
  intervalMs: number;             // current poll interval
  wakePending: boolean;           // a notification or reconnect arrived
  stopping: boolean;
}

export type SchedulerDecision =
  | { kind: 'exit' }
  | { kind: 'wait-slot' }                   // wait until a delivery finishes, a wake-up, or stop
  | { kind: 'claim'; size: number }
  | { kind: 'sleep'; ms: number };          // wait ms, interrupted by a wake-up or stop, then claim

export function decide(s: SchedulerState): SchedulerDecision;
export function nextInterval(prevMs: number, requested: number, claimed: number, poll: { minIntervalMs: number; maxIntervalMs: number }): number;
```

Rules (normative):

1. `stopping` → `exit`.
2. `free = concurrency − active`; `threshold = active === 0 ? 1 : ceil(batchSize / 2)`. If `free < threshold` → `wait-slot`.
3. If `last === null`, or `wakePending`, or `last.claimed === last.requested` → `claim` with `size = min(batchSize, free)`.
4. Otherwise → `sleep` for `intervalMs`.

`nextInterval`:
- `claimed === requested` (full) → `minIntervalMs` (rule 3 claims again without sleeping).
- `0 < claimed < requested` → `minIntervalMs`.
- `claimed === 0` → `min(maxIntervalMs, max(minIntervalMs, prevMs * 2))` when the previous claim was also empty, else `minIntervalMs`.
- A wake-up sets `intervalMs = minIntervalMs` and `wakePending = true`; a claim clears `wakePending`.

Example: an idle relay with defaults sleeps 100, 200, 400, 800, 1600, 2000, 2000, ... ms between empty claims. UT-08 covers each rule with table-driven cases.

#### 9.5.2 Loop (`src/core/relay/loop.ts`, normative behaviour)

```
while true:
  d = decide(state)
  switch d.kind:
    exit:       return
    wait-slot:  await firstOf(slotFreed, wake, stop)
    sleep:      await firstOf(timeout(d.ms), wake, stop)   -- then fall through to a claim
    claim:
      try rows = claim(d.size)                              -- C1/C1T/C2/C2T
      catch err: emit error(phase 'claim'); await firstOf(timeout(errorBackoff.next()), stop); continue
      errorBackoff.reset()
      state.last = { requested: d.size, claimed: rows.length }
      state.intervalMs = nextInterval(...)
      if rows.length > 0: emit claimed; for row of sortBySeq(rows): startDelivery(row)  -- not awaited
```

`errorBackoff` starts at 1000 ms and doubles to 30000 ms; it resets after a successful claim. Errors never escape the loop (FR-38).

#### 9.5.3 Delivery (`src/core/relay/deliver.ts`)

```
startDelivery(row):
  message = mapMessageRow(row); attempt = message.attempts
  active += 1
  controller = new AbortController()
  timer = setTimeout(() => controller.abort(new OutboxError('OUTBOX_HANDLER_TIMEOUT', ...)), handlerTimeoutMs)
  span = tracer?.startSpan('outbox deliver', attrs)
  t0 = performance.now()
  outcome = await race(
      Promise.resolve().then(() => target(message, { signal: controller.signal, attempt, relayId })),
      abortedPromise(controller.signal))
  clearTimeout(timer)
  if forcedShutdown(message.id): return                          -- lease already released (§9.6.3)
  if resolved: flusher.complete({ id, attempt, message, durationMs })
  else:        flusher.fail({ id, attempt, message, error, delayMs, terminal })
  active -= 1; signal slotFreed; span.end()
```

- `target` is `handlers[message.topic]` or `publisher`.
- On timeout the handler's promise is left running (JavaScript cannot cancel it); a `.catch(() => {})` is attached so it cannot cause an unhandled rejection. The slot is freed. Handlers must honour `ctx.signal`; docs show how with `fetch(url, { signal })` and with `pg` query cancellation.
- `terminal = isNonRetryableError(error)`; `delayMs` per §9.3.3.
- This file must not call `adapter.transaction` (NFR-03, guard in §16.6).

#### 9.5.4 Flusher (`src/core/relay/flush.ts`)

- Two buffers: `completes` and `fails`. `complete()` and `fail()` push and call `kick()`.
- `kick()`: if a flush is running, return (the running flush will loop). Otherwise run `flushLoop()`.
- `flushLoop()`: while either buffer is non-empty: take both buffers whole; if `completes` non-empty run 9.3.1; if `fails` non-empty run 9.3.2; emit events from results; repeat.
- On a statement error: emit `error` (phase `flush`), put the taken items back at the front of their buffer, wait with error backoff (1 s doubling to 30 s), retry. Items whose local lease estimate (`claimedAtMonotonic + leaseMs`, measured with `performance.now()`) has passed are dropped with one `error` event listing their ids: their lease has expired and they will be redelivered; writing a stale outcome would be fenced anyway.
- `drain()` resolves when both buffers are empty and no flush is running.

Under load this batches many completions into one statement; when idle, a single completion is written immediately.

### 9.6 Leases

#### 9.6.1 Reclaim (`src/core/sql/lease.ts`)

```sql
-- $1 int4 limit (reclaimBatchSize)
with expired as materialized (
  select m.id
  from "public"."outbox_messages" m
  where m.status = 'in_flight'
    and m.locked_until < "public"."outbox_now"()
  order by m.locked_until
  limit $1::int4
  for update skip locked
)
update "public"."outbox_messages" m
set status = case when m.attempts >= m.max_attempts then 'dead' else 'pending' end,
    available_at = case when m.attempts >= m.max_attempts then m.available_at else "public"."outbox_now"() end,
    dead_at = case when m.attempts >= m.max_attempts then "public"."outbox_now"() else null end,
    last_error = 'OUTBOX_LEASE_EXPIRED: lease held by ' || m.locked_by || ' expired at '
                 || to_char(m.locked_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    locked_by = null,
    locked_until = null
from expired e
where m.id = e.id
  and m.status = 'in_flight'        -- defence in depth (AGENTS.md: every UPDATE repeats its source status)
returning m.id::text as id, m.topic, m.status, m.attempts;
```

- Runs once at `start()`, then every `reclaimIntervalMs` (a `setTimeout` chain, `unref()`ed), and at the start of `runOnce()`. It loops while a statement returns `reclaimBatchSize` rows.
- `SET` expressions read the old row, so `m.locked_by` in `last_error` is the expired holder.
- Any relay may reclaim any expired lease; it does not matter which one does it.
- A reclaimed message is claimable immediately (PRD D-38); the lease already delayed it by `leaseMs`.
- Concurrency with a late complete or fail from the expired holder: whichever statement locks the row first wins. If the completion holds the row lock, reclaim's `skip locked` passes over the row; if the completion committed before reclaim's snapshot, `status = 'in_flight'` no longer matches. If reclaim locked first, the completion waits, then re-checks its WHERE clause against the new version (`status = 'pending'`, `locked_by` null) and matches nothing, so it becomes `leaseLost`. If a relay then re-claims the row, the `attempts` fence still rejects the old outcome even when the new holder has the same `locked_by` (a relay that reclaimed and re-claimed its own expired lease).

#### 9.6.2 Release on shutdown

```sql
-- $1 text relay id, $2 jsonb [{ "id": "<uuid>", "attempt": 3 }, ...]
update "public"."outbox_messages" m
set status       = 'pending',
    attempts     = m.attempts - 1,
    available_at = "public"."outbox_now"(),
    locked_by    = null,
    locked_until = null
from jsonb_to_recordset($2::jsonb) as x(id uuid, attempt int4)
where m.id = x.id
  and m.status = 'in_flight'
  and m.locked_by = $1::text
  and m.attempts = x.attempt
returning m.id::text as id;
```

The attempt is not counted (PRD D-21). The handler may have produced partial effects before it was aborted; that is the same situation as a crash and is covered by at-least-once plus the inbox.

#### 9.6.3 Lifecycle (normative)

`start()`:
1. If `state !== 'idle'` → `OUTBOX_RELAY_STATE`. Set `starting`.
2. Schema check (§9.10). On failure set `stopped` and reject with `OUTBOX_NOT_MIGRATED`.
3. Reclaim once (errors emitted, not fatal).
4. If `listen` is enabled and the adapter supports it: open the listen handle (§10). If opening fails, emit `error` (phase `listen`) and retry in the background with backoff; polling continues.
5. Start the reclaim timer and the loop (not awaited). If `options.signal` is given, `signal.addEventListener('abort', () => stop())`; if already aborted, stop immediately after starting.
6. Set `running` and resolve.

`stop({ drainTimeoutMs = options.drainTimeoutMs })`:
1. If `stopping` or `stopped`, return the first call's promise. If `idle`, set `stopped` and resolve `{ drained: true, released: 0, durationMs: 0 }`.
2. Set `stopping`; the scheduler returns `exit`; interrupt sleeps; close the listen handle; clear the reclaim timer.
3. Wait until `active === 0` and the flusher drained, or `drainTimeoutMs` passed.
4. If deliveries remain: abort each controller with `OUTBOX_SHUTDOWN`, mark them as forced (their outcomes are discarded), and run 9.6.2 for their `(id, attempt)` pairs; `released` = returned rows. Errors are emitted (phase `release`); unreleased leases simply expire.
5. Drain the flusher with up to 3 retries 1 s apart; then give up (leases expire; messages are redelivered).
6. Set `stopped`; resolve `{ drained, released, durationMs }`.

`runOnce()`: only in `idle`; checks the schema version on first use; runs one reclaim pass; claims `min(batchSize, concurrency)`; delivers all claimed messages concurrently; drains the flusher; returns counts. The relay stays `idle` and `runOnce()` can be called again. It never opens LISTEN.

### 9.7 Admin

#### 9.7.1 retryDead

```sql
-- $1 jsonb ids or null, $2 text topic or null, $3 text key or null, $4 int4 limit
with picked as materialized (
  select m.id
  from "public"."outbox_messages" m
  where m.status = 'dead'
    and ($1::jsonb is null or m.id in (select (jsonb_array_elements_text($1::jsonb))::uuid))
    and ($2::text is null or m.topic = $2::text)
    and ($3::text is null or m.key = $3::text)
  order by m.dead_at, m.seq
  limit $4::int4
  for update skip locked
)
update "public"."outbox_messages" m
set status = 'pending', attempts = 0, available_at = "public"."outbox_now"(), dead_at = null
from picked p
where m.id = p.id
  and m.status = 'dead'
returning m.id::text as id;
```

`last_error` is kept. Ids are validated as UUIDs in TypeScript first (invalid → `OUTBOX_INVALID_MESSAGE`). In ordering mode a retried head becomes the head again and its key resumes in order.

#### 9.7.2 skip

```sql
-- $1 uuid
with target as materialized (
  select m.id, m.status as previous_status
  from "public"."outbox_messages" m
  where m.id = $1::uuid
  for update
),
upd as (
  update "public"."outbox_messages" m
  set status = 'skipped', completed_at = "public"."outbox_now"(), dead_at = null
  from target t
  where m.id = t.id and t.previous_status in ('pending', 'dead') and m.status in ('pending', 'dead')
  returning m.id
)
select t.previous_status, exists (select 1 from upd) as skipped
from target t;
```

No row → `OUTBOX_NOT_FOUND`. `skipped = false` → `OUTBOX_NOT_SKIPPABLE` with `previous_status`. A malformed id → `OUTBOX_NOT_FOUND` without SQL. `for update` (without `skip locked`) waits for a concurrent claim statement to finish, then sees the committed status.

#### 9.7.3 purge

```sql
-- P1: done and skipped.  $1 int8 older-than ms, $2 int4 batch size
with doomed as materialized (
  select m.id
  from "public"."outbox_messages" m
  where m.status in ('done', 'skipped')
    and m.completed_at < "public"."outbox_now"() - ($1::int8 * interval '1 millisecond')
  order by m.completed_at
  limit $2::int4
  for update skip locked
),
del as (
  delete from "public"."outbox_messages" m using doomed d where m.id = d.id returning 1
)
select count(*)::int4 as deleted from del;
```

P2 (only with `includeDead`) is identical with `m.status = 'dead'` and `m.dead_at` in place of `completed_at`.

`purge` runs P1 until a statement deletes fewer than `batchSize` rows, then P2 the same way, and returns the total. Each statement is its own transaction, so locks are held briefly and vacuum can keep up. Purging a message ends its deduplication window (its `dedupe_key` can be used again).

#### 9.7.4 listDead

```sql
-- $1 text topic or null, $2 int4 limit (1..1000, default 100)
select <message columns as in C1 RETURNING>
from "public"."outbox_messages" m
where m.status = 'dead' and ($1::text is null or m.topic = $1::text)
order by m.dead_at desc, m.seq desc
limit $2::int4;
```

### 9.8 Inbox (`src/core/sql/inbox.ts`, `src/core/inbox.ts`)

I1 (on the caller's transaction):

```sql
-- $1 text consumer, $2 text message id
insert into "public"."outbox_inbox" (consumer, message_id)
values ($1::text, $2::text)
on conflict (consumer, message_id) do nothing
returning true as inserted;
```

`withInbox(tx, consumer, messageId, fn)`:
1. Validate `consumer` and `messageId` (§5.6).
2. Run I1 on `tx`.
3. One row returned → `result = await fn(tx)` → return `{ status: 'processed', result }`. Errors from `fn` propagate unchanged.
4. No row → return `{ status: 'duplicate' }`; `fn` is not called.

| Situation | Outcome |
|---|---|
| First delivery, transaction commits | Inbox row and effects committed together; `processed` |
| Redelivery after that commit | I1 conflicts → `duplicate`; no effects |
| Two deliveries at once | The second I1 waits on the first's uncommitted row. First commits → second gets `duplicate`. First rolls back → second inserts and processes. |
| `fn` throws, caller lets the transaction roll back | Inbox row rolled back too; a redelivery processes the message |
| `fn` throws, caller catches and commits anyway | Inbox row committed without effects: the message is lost for this consumer. This is misuse; docs show it as the one way to break the guarantee |
| Caller uses Repeatable Read / Serializable | A concurrent conflicting insert raises a serialization failure; the caller retries its transaction |
| Effects outside this database (SMTP, payment API) | Not covered. Docs: pass the message id as the provider's idempotency key, or write an "email to send" row inside `fn` and send it from a second outbox |

purgeInbox:

```sql
-- $1 int8 older-than ms, $2 int4 batch size (default 5000)
with doomed as materialized (
  select i.consumer, i.message_id
  from "public"."outbox_inbox" i
  where i.processed_at < "public"."outbox_now"() - ($1::int8 * interval '1 millisecond')
  order by i.processed_at
  limit $2::int4
  for update skip locked
),
del as (
  delete from "public"."outbox_inbox" i using doomed d
  where i.consumer = d.consumer and i.message_id = d.message_id
  returning 1
)
select count(*)::int4 as deleted from del;
```

Retention rule (docs): keep inbox rows at least as long as a message can still be redelivered. For outbox relays that is the time from first claim to `dead` (about `maxAttempts × (leaseMs + handlerTimeoutMs)` plus the sum of backoff ceilings, under 1 hour with defaults), plus any time an operator may take to `retryDead`. Recommended default: 7 days.

### 9.9 Stats (`src/core/sql/stats.ts`)

S1 (one scalar subquery per partial index, so each count is served by the index whose predicate it repeats; a single scan `where status in ('pending', 'in_flight', 'dead')` is implied by no single partial index and can fall back to a sequential scan of the whole table):

```sql
select
  (select count(*) from "public"."outbox_messages"
     where status = 'pending' and available_at <= "public"."outbox_now"())::int4      as ready,          -- claim_idx
  (select count(*) from "public"."outbox_messages"
     where status = 'pending' and available_at > "public"."outbox_now"())::int4       as scheduled,      -- claim_idx
  (select count(*) from "public"."outbox_messages"
     where status = 'in_flight')::int4                                                 as in_flight,      -- lease_idx
  (select count(*) from "public"."outbox_messages"
     where status = 'in_flight' and locked_until < "public"."outbox_now"())::int4     as expired_leases, -- lease_idx
  (select count(*) from "public"."outbox_messages"
     where status = 'dead')::int4                                                      as dead,           -- dead_idx
  coalesce((
    select extract(epoch from ("public"."outbox_now"() - min(available_at))) * 1000
    from "public"."outbox_messages"
    where status = 'pending' and available_at <= "public"."outbox_now"()
  ), 0)::float8                                                                        as oldest_ready_age_ms,
  (extract(epoch from "public"."outbox_now"()) * 1000)::float8                         as measured_at_ms;
```

All subqueries run in one statement, so they share one snapshot and one value of `outbox_now()` (`stable`). `extract(epoch from ...)` returns `numeric` on PostgreSQL 14+, hence the `::float8` casts.

S2 (only with `includeTerminal: true`):

```sql
select
  count(*) filter (where status = 'done')::int4    as done,
  count(*) filter (where status = 'skipped')::int4 as skipped
from "public"."outbox_messages"
where status in ('done', 'skipped');
```

S1 touches only unfinished rows (served by the partial indexes; INT-37 asserts with `explain (format json)` that its plan has no `Seq Scan` node on the messages table when 100,000 `done` rows are present); S2 scans the purge index and can be slow on large tables, which is why it is opt-in (PRD D-40).

### 9.10 Schema version check

```sql
-- V1: $1 text  'public.outbox_schema_migrations' (unquoted-qualified form for to_regclass, built from validated identifiers)
select to_regclass($1::text) is not null as present;
-- V2 (only when present)
select coalesce(max(version), 0)::int4 as version from "public"."outbox_schema_migrations";
```

`current < REQUIRED_SCHEMA_VERSION` → `OUTBOX_NOT_MIGRATED` with message `outbox schema "public" prefix "outbox_" is at version 0, this library needs 1. Run: npx outbox migrate --schema public --prefix outbox_`. A higher version is accepted (a newer library migrated; additive migrations keep older code working, FR-16).

`stats()` and admin helpers do not run the check on every call; they rely on PostgreSQL's `undefined_table` error (SQLSTATE `42P01`), which is mapped to `OUTBOX_NOT_MIGRATED`.

---

## 10. Wake-up: polling and LISTEN/NOTIFY

### 10.1 Design (normative)

| Aspect | Decision |
|---|---|
| Who notifies | `enqueue`, inside statement E1, when `notify: true` and at least one row was inserted (PRD D-19). No trigger. |
| Channel | `${schema}.${tablePrefix}messages`, e.g. `public.outbox_messages` |
| Payload | Empty string (well under the 8000-byte `pg_notify` payload limit). Identical notifications in one transaction collapse to one; the payload carries nothing the relay needs |
| Who listens | Each relay with `listen` enabled, on one dedicated connection |
| Effect | Wake-up: `intervalMs = minIntervalMs`, `wakePending = true`; if slots are free, claim now; otherwise claim as soon as one frees |
| Debounce | None needed: a wake-up while a claim is running only sets `wakePending`, which causes at most one extra claim |
| Source of truth | Polling. A relay that never receives a notification still delivers everything within `poll.maxIntervalMs` |

### 10.2 Why NOTIFY is only a hint

- A notification is delivered only to sessions listening at commit time. Messages enqueued while no relay listens produce no wake-up; polling finds them.
- LISTEN needs a session that stays connected. Transaction-mode poolers (PgBouncer `pool_mode = transaction`, Supavisor port 6543) hand a different server connection to each transaction, so LISTEN does not work through them. NOTIFY from `enqueue` still works through them (it is part of the transaction). Use `listen: { db: <direct connection> }` or `listen: false`.
- The listen connection can drop. After reconnecting, the relay does one claim immediately (`onReconnect` → wake-up), because notifications sent while it was disconnected are gone.
- PostgreSQL serialises the commit of transactions that executed NOTIFY (a global lock on the notification queue at commit). At thousands of notifying commits per second this becomes a ceiling on enqueue throughput; set `notify: false` and rely on polling with a lower `poll.maxIntervalMs` (docs "Operations"). The notification queue is 8 GB by default; a listener that never reads would eventually fill it, but relays read continuously.

### 10.3 Adapter behaviour

- postgres.js: `sql.listen(channel, onNotify, onListen)`. postgres.js opens a dedicated connection and re-listens after reconnects; `onListen` runs after each (re)connect, and the adapter calls `onReconnect` from the second call onwards (A-03).
- pg: one client from the pool (or from `listen.db`), `listen "<channel>"`, `notification` and `error` handlers, reconnect loop with 1 s → 30 s backoff (§6.3).

INT-50 measures wake-up latency; INT-51 proves polling still delivers with LISTEN off; INT-52 kills the listen backend with `pg_terminate_backend` and checks recovery.

---

## 11. Time and the test clock

### 11.1 Rule

Every timestamp that affects delivery (`available_at`, `locked_until`, `dead_at`, `completed_at`, `created_at`, `processed_at`, purge and stats cutoffs) is computed in SQL from `outbox_now()`. The application never sends a wall-clock time for these, so clock skew between application hosts cannot cause early delivery, premature lease expiry or wrong retention.

`now()` in PostgreSQL is the start time of the current transaction. Relay statements are single autocommit statements, so for them `now()` is effectively statement time. For `enqueue`, it is the start of the caller's transaction (§9.1 notes).

### 11.2 Production function

`outbox_now()` is `select now()`, `stable`, `parallel safe`; the planner inlines it. There is no setting, table or branch to misconfigure in production (PRD D-22).

### 11.3 Test clock (`@firatkill/outbox/testing`)

`testClock(outbox).install()` runs, in one transaction:

```sql
create table if not exists "public"."outbox_test_clock" (
  id        boolean primary key default true check (id),
  offset_ms bigint  not null default 0 check (offset_ms >= 0)
);
insert into "public"."outbox_test_clock" (id) values (true) on conflict (id) do nothing;

create or replace function "public"."outbox_now"() returns timestamptz
  language sql stable
  as $$
    select now() + make_interval(secs => coalesce(
      nullif(current_setting('outbox.test_offset_ms', true), '')::bigint,
      (select c.offset_ms from "public"."outbox_test_clock" c where c.id),
      0
    ) / 1000.0)
  $$;
```

| Method | SQL |
|---|---|
| `set(ms)` | `update "public"."outbox_test_clock" set offset_ms = $1::int8 where id` |
| `advance(ms)` | `update "public"."outbox_test_clock" set offset_ms = offset_ms + $1::int8 where id` |
| `reset()` | `set(0)` |
| `now()` | `select (extract(epoch from "public"."outbox_now"()) * 1000)::float8 as now_ms` |
| `setLocal(tx, ms)` | `select set_config('outbox.test_offset_ms', $1::text, true)` on `tx` (transaction-local) |
| `uninstall()` | `create or replace function ... as $$ select now() $$` (the production body), then `drop table if exists "public"."outbox_test_clock"` |

Why two override mechanisms (consistent with bidlock PRD D-06/D-07, but without a production flag):
- The per-transaction setting (`set_config(..., true)`) affects only the transaction that sets it. It survives transaction-mode poolers because it never outlives the transaction. Tests use it for single-statement checks (for example: "a message with `delayMs: 60000` is not claimable at +59 s and is at +61 s" with the claim executed inside a test-controlled transaction).
- The per-schema row affects every connection and every process using that schema, including relay pools and chaos child processes, which run their own autocommit statements that a test cannot wrap. Tests use it to expire leases and to skip backoff delays.
- Each test file uses its own schema (§15.4), so clocks of parallel test files never interfere.

The test clock moves only `outbox_now()`. PostgreSQL's own `now()`, `statement_timeout` and lock timeouts are unaffected. Offsets are non-negative: time only moves forward.

`install()` changes the function body in place; the migration checksum is unaffected because checksums cover migration templates, not catalog state. Re-running `migrate` does not restore the production body (migrations already applied are not re-run); `uninstall()` does. The testing entry must never be imported by production code; docs say so, and its TSDoc starts with "Test-only."

### 11.4 Allowed uses of the application clock

| Use | Where | Why it is safe |
|---|---|---|
| UUIDv7 48-bit timestamp prefix (`Date.now()`) | `src/core/uuid.ts` | Only affects primary-key locality; ordering uses `seq` |
| `webhook-timestamp` header (seconds) | `src/publishers/webhook.ts` | Required by the signature scheme; receivers compare it with their own clock (tolerance 300 s) |
| Caller-supplied `availableAt` | `enqueue` | The caller chose an absolute instant; docs recommend `delayMs` instead |
| Converting database epoch ms to `Date` (`new Date(ms)`) | `src/core/row.ts` | The value comes from the database |
| `performance.now()` durations, `setTimeout` waits | relay | Monotonic local durations: event `durationMs`, poll sleeps, handler timeout, drain timeout, flush lease estimate; never stored or compared with database time |

The guard in §16.6 fails the build on `Date.now(` or `new Date(` in `src/core/**` or `src/adapters/**` outside `uuid.ts` and `row.ts`.

### 11.5 Clock assumptions (stated on the guarantees page)

- Leases and delays are measured on the database server's clock. If that clock jumps forward (manual change, bad NTP step), leases expire early and messages may be delivered twice; if it jumps backward, leases and delays last longer. Run NTP with slewing.
- After a failover to a replica, `now()` comes from the new primary's clock; keep `leaseMs` much larger than any plausible skew between nodes (seconds, not milliseconds).
- Application clocks may be arbitrarily wrong without affecting any guarantee (except webhook signature verification at the receiver).

---

## 12. Guarantees and failure modes

### 12.1 Guarantees (normative wording, reproduced verbatim on the docs page)

Definitions: a message is *committed* when the transaction that enqueued it commits. A *delivery* is one call of the handler or publisher for one claim. A delivery *succeeds* when the call resolves before the handler timeout. A relay *serves* a topic when it runs with a handler for it (handlers mode) or with a topic filter that includes it, or no filter (publisher mode).

- **GU-01 Atomic enqueue.** The rows written by `enqueue(tx, ...)` become visible to relays if and only if `tx` commits, and the wake-up notification is sent only on commit. Precondition: `tx` is an open transaction handle. Passing the root `sql` or `pool` executes the insert in its own autocommit transaction; the library cannot detect this for postgres.js, and the docs warn about it.
- **GU-02 At-least-once delivery.** If, from some point on, at least one relay that serves the message's topic runs with database access, every committed message eventually reaches `done`, `dead` or (by operator action) `skipped`. A message is `done` only after at least one delivery succeeded. A message can be delivered more than once.
- **GU-03 Bounded attempts.** `attempts <= max_attempts` always holds (CHECK constraint). Each claim increments `attempts`; a claim released by graceful shutdown is not counted. A message is therefore claimed at most `max_attempts` times, plus the claims released by shutdowns, before it becomes `dead`. `retryDead` resets the count.
- **GU-04 No overlapping deliveries while a lease is valid.** At any time at most one relay holds an unexpired lease on a message. Two deliveries of the same message overlap in time only if one of them continued after its lease expired. The relay aborts every delivery after `handlerTimeoutMs`, which is at least 1 s shorter than `leaseMs`, so overlap requires a handler that ignores its abort signal, a relay process paused for longer than the remaining lease (stop-the-world pause, SIGSTOP, VM freeze), or a forward jump of the database clock. In all cases the late relay's outcome is discarded (fencing, `leaseLost`).
- **GU-05 Exactly-once effects with the inbox.** For a consumer name `C` and message id `x`, the effects written by `fn` in `withInbox(tx, C, x, fn)` are committed at most once. Combined with GU-02 and a handler that eventually succeeds, they are committed exactly once. Preconditions: the effects are written through `tx`, in the same database as the inbox table; errors from `fn` are allowed to roll back `tx`; inbox rows are kept longer than the redelivery window (§9.8). Effects outside that database are not covered.
- **GU-06 Per-key ordering in ordering mode.** Let `a` and `b` have the same non-null `key`, and let the transaction that enqueued `a` commit before the transaction that enqueued `b` calls `enqueue`. If every relay on the table uses `ordering: 'key'`, `b` is not claimed until `a` is `done` or `skipped`; in particular `b`'s first delivery starts after `a`'s successful completion was committed. Messages enqueued by overlapping transactions are ordered by `seq` but this order may differ from commit order (§9.4). The GU-04 preconditions also apply: a late, unfenced delivery of `a` can overlap `b`.
- **GU-07 No early delivery.** A message is never claimed while `available_at > outbox_now()`. `delayMs` counts from the start of the enqueuing transaction in database time.
- **GU-08 Bounded discovery latency.** If a relay serving the topic is running and has free delivery slots, a ready message (committed, `available_at` passed, and in ordering mode at the head of its key) is claimed within `poll.maxIntervalMs` plus one claim round trip, whether or not notifications arrive. With LISTEN working it is typically claimed within milliseconds of commit (NFR-11).
- **GU-09 Crash recovery.** If the relay holding a lease stops (crash, kill, lost network), the message returns to `pending` (or `dead` when attempts are exhausted) at the first reclaim after `locked_until`, that is within `leaseMs + reclaimIntervalMs` (plus statement latency) after the claim, provided some relay is running. It is then claimable immediately.

Not guaranteed: exactly-once delivery; any ordering without ordering mode (delivery is roughly oldest-first but concurrent); ordering across different keys; ordering between messages from overlapping transactions; progress while no relay serves a topic; once-only side effects outside the consumer's database.

### 12.2 Crash-point table (normative, reproduced on the docs page)

| # | Crash or failure point | Database state afterwards | What happens next | Outcome |
|---|---|---|---|---|
| 1 | Producer crashes before `COMMIT` | Business rows and message rolled back | Nothing | No data, no message (GU-01) |
| 2 | Producer loses the connection during `COMMIT` | Both committed or neither (commit is atomic); the client does not know which | Client retries the request | With a `dedupeKey`, the retry does not create a second message |
| 3 | Relay crashes while the claim statement runs | Statement rolled back; rows still `pending` | Next claim by any relay | No effect; no attempt counted |
| 4 | Claim committed, relay crashes before calling the handler | `in_flight`, lease held by the dead relay | Reclaim after `locked_until` → `pending` | Delivered later; one attempt consumed; handler never ran, so no duplicate |
| 5 | Relay crashes while the handler runs | `in_flight` | Reclaim → redelivery | Handler may have partly run: duplicate delivery; inbox keeps effects once |
| 6 | Handler succeeded, relay crashes before the complete statement | `in_flight` | Reclaim → redelivery | Duplicate delivery (the defining at-least-once case) |
| 7 | Complete statement sent, crash before it commits | Rolled back → `in_flight` | As 6 | Duplicate delivery |
| 8 | Complete committed, relay crashes before reading the response | `done` | Nothing | No duplicate; the `delivered` event was not emitted (observability only) |
| 9 | Handler failed, relay crashes before the fail statement | `in_flight` | Reclaim → `pending` immediately | Retried after `leaseMs` instead of the computed backoff; `last_error` says `OUTBOX_LEASE_EXPIRED` instead of the handler error |
| 10 | Relay paused (GC, SIGSTOP, partition) longer than its lease, then resumes | Lease reclaimed; another relay may have claimed and delivered | The resumed relay's complete/fail matches no row → `leaseLost` | Possible overlapping deliveries (GU-04 precondition broken); the outcome is recorded once, by the current holder |
| 11 | Connection lost during the claim statement; outcome unknown to the relay | Either still `pending`, or `in_flight` under this relay's id | If claimed: nobody delivers until the lease expires; then reclaim | Delay of up to `leaseMs + reclaimIntervalMs`; one attempt consumed |
| 12 | Connection lost during a complete or fail statement | Either applied or not | Flusher retries; a duplicate apply matches no row (already `done`) and is reported as `leaseLost` | No double transition; a spurious `leaseLost` event is possible |
| 13 | PostgreSQL restarts or fails over | Committed data survives per your durability settings | Relays emit `error`, back off (1 s → 30 s), reconnect, reclaim | With asynchronous replication a failover can lose the last commits, but business rows and their messages are lost together, never one without the other |
| 14 | BullMQ accepted the job, relay crashes before complete | `in_flight` | Redelivery calls `queue.add` with the same job id | BullMQ keeps one job while the first one is still retained (`removeOnComplete` window, §13.1) |
| 15 | Webhook receiver processed the request but the response was lost (timeout) | Fail → `pending` with backoff | Redelivery with the same `webhook-id` | Receiver must deduplicate by `webhook-id` (for example with `withInbox`) |
| 16 | `stop()` drain timeout passes while a handler runs | Lease released → `pending`, attempt not counted | Another relay delivers | Possible duplicate effects if the aborted handler had partly run |
| 17 | Consumer crashes inside `withInbox` before its commit | Inbox row and effects rolled back | Redelivery processes the message | Effects once (GU-05) |
| 18 | Consumer committed, crashes before returning to the relay | Inbox row and effects committed; message still `in_flight` | Redelivery → `withInbox` returns `duplicate` | Effects once (GU-05) |
| 19 | Operator purges the inbox younger than the redelivery window | Inbox row gone | A later redelivery processes again | Duplicate effects; retention rule (§9.8) violated |
| 20 | Handler never settles and ignores the abort signal | Timeout fail recorded; the promise keeps running in the background | Retried with backoff by this or another relay | The slot is freed; the orphaned work may finish later and cause effects outside the inbox |

### 12.3 Guarantee to test mapping

| Guarantee | Tests |
|---|---|
| GU-01 | INT-10, INT-11, INT-19 |
| GU-02 | INT-20, INT-22, INT-29, CHAOS-01, CHAOS-02 (INV-01, INV-02, INV-07) |
| GU-03 | INT-31, INT-34, INT-71, INV-05 |
| GU-04 | INT-22 (zero duplicates without crashes), INT-24 (fencing), INV-03 |
| GU-05 | INT-60..INT-63, INV-06 |
| GU-06 | INT-40..INT-45, CHAOS-02 (INV-08) |
| GU-07 | INT-15, INT-16 |
| GU-08 | INT-50, INT-51, INT-53 |
| GU-09 | INT-23, INT-25, CHAOS-01, CHAOS-02 |

---

## 13. Publishers

### 13.1 BullMQ (`@firatkill/outbox/bullmq`)

```ts
/** Structural subset of a BullMQ Queue. Works with BullMQ 5 (A-06). */
export interface BullQueueLike {
  readonly name: string;
  add(name: string, data: unknown, opts?: Record<string, unknown>): Promise<unknown>;
}

/** Job options. attempts is required: BullMQ retries are configured on the job, not on the Worker. */
export interface BullJobOptions {
  attempts: number;                                          // >= 1
  backoff?: { type: 'fixed' | 'exponential'; delay: number; jitter?: number } | number;
  removeOnComplete?: boolean | number | { age?: number; count?: number };
  removeOnFail?: boolean | number | { age?: number; count?: number };
  priority?: number;
  delay?: number;
  [key: string]: unknown;
}

export interface BullmqPublisherOptions {
  /** One queue for all topics, or a map/function from topic to queue. */
  queue: BullQueueLike | Readonly<Record<string, BullQueueLike>> | ((topic: string) => BullQueueLike | undefined);
  /** Job name. Default: the topic. */
  jobName?: (message: OutboxMessage) => string;
  /** Job options per message. Must include attempts. */
  jobOptions: BullJobOptions | ((message: OutboxMessage) => BullJobOptions);
  /** Job data. Default: { outboxId, topic, key, payload, headers }. */
  jobData?: (message: OutboxMessage) => unknown;
}

export function bullmqPublisher(options: BullmqPublisherOptions): Publisher;
```

Behaviour (normative):
1. Resolve the queue for `message.topic`. No queue → throw `NonRetryableError('no BullMQ queue for topic ...')` (the message goes to `dead`, visible and fixable with `retryDead`).
2. Resolve job options; if `attempts` is not an integer ≥ 1 → throw `NonRetryableError` naming the option. Static options are validated once in `bullmqPublisher()` and throw `OUTBOX_CONFIG` there instead.
3. `await queue.add(name, data, { ...jobOptions, jobId: 'outbox-' + message.id })`. The caller's `jobId` is overwritten; if `jobOptions.jobId` was set, `bullmqPublisher()` throws `OUTBOX_CONFIG` (it would break deduplication). BullMQ rejects custom job ids that are integer strings or that contain `:` (it uses `:` as its Redis key separator); `outbox-` + a lowercase hyphenated UUID is neither, and UT-13 asserts `jobId` matches `^outbox-[0-9a-f-]{36}$`.
4. Errors from `add` (Redis down) propagate and are retried by the outbox with its own backoff.

The classic mistake, called out in TSDoc and on the docs page:

```ts
// Wrong: Worker has no attempts option. Jobs default to attempts: 1, so a failed job is never retried.
new Worker('emails', processor, { connection, attempts: 5 } as never);

// Right: attempts and backoff are job options.
bullmqPublisher({ queue: emailQueue, jobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1000 } } });
```

Two retry layers exist and do different jobs: the outbox retries getting the job into Redis; BullMQ retries processing the job. Docs explain both and recommend `removeOnComplete: { age: 86400 }` or longer: BullMQ ignores an `add` with an existing job id only while that job still exists, so the deduplication window equals job retention. A redelivery after the job was removed creates a second job; consumers should still be idempotent (the job data carries `outboxId` for `withInbox`).

### 13.2 Webhook (`@firatkill/outbox/webhook`)

```ts
export interface WebhookPublisherOptions {
  /** Target URL, fixed or per message. Must be http: or https:. */
  url: string | URL | ((message: OutboxMessage) => string | URL);
  /** Signing secret: raw string (UTF-8 bytes) or Standard Webhooks "whsec_<base64>". At least 16 bytes. */
  secret: string;
  /** Per-request timeout. Default 10_000, 100..120_000. */
  timeoutMs?: number;
  /** Extra headers (cannot override content-type or webhook-*). */
  headers?: Readonly<Record<string, string>> | ((message: OutboxMessage) => Readonly<Record<string, string>>);
  /** Injected fetch for tests. Default globalThis.fetch. */
  fetch?: typeof fetch;
  /** Body builder. Default: §13.2 body. */
  body?: (message: OutboxMessage, attempt: number) => unknown;
}
export function webhookPublisher(options: WebhookPublisherOptions): Publisher;
```

Request (normative):
- `POST <url>` with `redirect: 'manual'`, `signal` = `AbortSignal.any([ctx.signal, AbortSignal.timeout(timeoutMs)])` (both available since Node 20.3, so every supported and best-effort Node version has them). After an abort, the publisher tells the two causes apart by checking `ctx.signal.aborted` first: if the delivery signal aborted, rethrow its `reason` (handler timeout or shutdown, §5.9); otherwise it was the request timeout (`OUTBOX_WEBHOOK_TIMEOUT`).
- Body (UTF-8 JSON, serialised once; the same bytes are signed and sent):

```json
{
  "id": "0192b3c4-...-uuidv7",
  "topic": "order.created",
  "key": "order-42",
  "payload": { "orderId": "42" },
  "headers": { "traceparent": "00-..." },
  "createdAt": "2026-10-21T10:00:00.000Z",
  "attempt": 1
}
```

- Headers:

| Header | Value |
|---|---|
| `content-type` | `application/json` |
| `user-agent` | `@firatkill/outbox/<version>` (`VERSION`, §4.2) |
| `webhook-id` | message id |
| `webhook-timestamp` | integer Unix seconds at send time (application clock, §11.4) |
| `webhook-signature` | `v1,<base64(HMAC-SHA256(key, id + "." + timestamp + "." + body))>` |
| `x-outbox-topic` | topic |
| `x-outbox-attempt` | attempt number |

- `key` bytes: if `secret` starts with `whsec_`, base64-decode the rest (standard base64 with padding; a decode error or fewer than 16 bytes throws `OUTBOX_CONFIG` from `webhookPublisher()`); otherwise the UTF-8 bytes of `secret`. Only the `whsec_` form interoperates with Standard Webhooks libraries (they always base64-decode the secret); the raw form is a convenience for receivers that use `verifyWebhook`. Docs recommend `whsec_` with 32 random bytes (the Standard Webhooks spec asks for 24 to 64).
- Signature bytes are HMAC-SHA256 over the UTF-8 bytes of `${id}.${timestamp}.${body}`, base64-encoded with padding (standard alphabet, not base64url).

Outcome mapping (normative, FR-69):

| Response | Thrown | Outbox result |
|---|---|---|
| 200–299 | nothing | `done` |
| 408 | `RetryableError` (`OUTBOX_WEBHOOK_STATUS`) | retry with backoff |
| 429 | `RetryableError` with `retryAfterMs` from `Retry-After` (seconds or HTTP-date; unparsable → computed backoff) | retry, clamped to `maxDelayMs` |
| other 400–499 | `NonRetryableError` | `dead` |
| 300–399 | `NonRetryableError` (redirects are not followed, PRD D-28) | `dead` |
| 500–599 and any other status | `RetryableError` | retry |
| timeout | `RetryableError` (`OUTBOX_WEBHOOK_TIMEOUT`) | retry |
| network error | `RetryableError` (`OUTBOX_WEBHOOK_NETWORK`) | retry |
| delivery signal aborted (handler timeout or shutdown) | the signal's reason | per §5.9 |

The error's `details` include `status`, `url` (origin and path only, no query string) and the first 500 bytes of the response body. The response body is always consumed or cancelled so sockets are released. The secret never appears in errors or events.

### 13.3 verifyWebhook

```ts
export function verifyWebhook(input: {
  secret: string;
  headers: Headers | Readonly<Record<string, string | string[] | undefined>>;
  body: string | Uint8Array;            // raw body exactly as received
  toleranceSec?: number;                // default 300
  nowSec?: number;                      // default Math.floor(Date.now() / 1000), injectable for tests
}): { id: string; timestamp: number };  // throws NonRetryableError on failure
```

Checks, in order: headers present (looked up case-insensitively for the record form; for a `string[]` value the first element is used); timestamp is a decimal integer within `toleranceSec` of `nowSec` in either direction; at least one `v1,` signature in the space-separated `webhook-signature` list equals the expected one using `crypto.timingSafeEqual` on equal-length buffers (entries with other version prefixes, such as `v1a,`, are ignored). Docs show a receiver in 15 lines that verifies and then calls `withInbox(tx, 'webhook-receiver', id, ...)`. UT-11 includes two fixed test vectors: (1) the worked example published in the Standard Webhooks specification (secret, `webhook-id`, timestamp, body and the expected `v1,` signature, copied verbatim from the spec repository on the implementation date with its URL in a comment, never typed from memory), which must verify and must be reproduced by the signer; (2) our own vector (raw secret) computed once and committed. A-14 records the source.

### 13.4 Custom publishers

A publisher is any `(message, ctx) => Promise<void>`. Docs show a 12-line Amazon SQS sketch (`SendMessageCommand` with `MessageDeduplicationId = message.id` for FIFO queues and `MessageGroupId = message.key`) without adding any dependency to the library, and the rules: resolve only after the broker acknowledged; throw `NonRetryableError` for permanent errors; pass `ctx.signal` to the client.

---

## 14. Observability

### 14.1 Events

Defined in §5.5. Recommended wiring (docs "Operations"):

| Event | Log level | Metric |
|---|---|---|
| `claimed` | debug | counter `outbox_claimed_total`, histogram of `durationMs` |
| `delivered` | debug | counter `outbox_delivered_total{topic}`, histogram of `durationMs` |
| `failed` | warn | counter `outbox_failed_total{topic,willRetry}` |
| `dead` | error | counter `outbox_dead_total{topic}`; alert on any |
| `reclaimed` | warn | counter `outbox_reclaimed_total`; alert if sustained (relays dying or handlers exceeding leases) |
| `leaseLost` | warn | counter; investigate handlers that ignore `signal` |
| `error` | error | counter `outbox_relay_errors_total{phase}` |

The library ships no metrics client; docs show a 20-line `prom-client` mapping as an example only.

### 14.2 Tracer hook (OpenTelemetry-compatible shape, no dependency)

```ts
export interface Tracer {
  startSpan(name: string, attributes: Readonly<Record<string, string | number | boolean>>): Span;
}
export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  recordException(error: unknown): void;
  /** status 'ok' | 'error' */
  end(status: 'ok' | 'error'): void;
}
```

| Span | When | Attributes |
|---|---|---|
| `outbox claim` | around each claim statement | `outbox.relay_id`, `outbox.requested`, then `outbox.claimed` |
| `outbox deliver` | around each delivery | `messaging.system = 'outbox'`, `messaging.operation.type = 'process'`, `messaging.destination.name = topic`, `messaging.message.id = id`, `outbox.attempt`, `outbox.key` (when set) |
| `outbox flush` | around each flush cycle | `outbox.completed`, `outbox.failed`, `outbox.lease_lost` |

A tracer that throws is caught and reported as `error` (phase `listener`). Docs show an adapter from `@opentelemetry/api` (`tracer.startSpan(name, { attributes })` plus `span.setStatus`) and how to continue a trace from `message.headers.traceparent` using `propagation.extract`.

### 14.3 Stats and SQL for dashboards

`stats()` is §9.9. Docs "Operations" adds copy-paste SQL for: backlog by topic, dead by topic, oldest ready message, messages per minute over the last hour (`date_trunc('minute', completed_at)`), table and index sizes, and dead tuples (`pg_stat_user_tables.n_dead_tup`). Suggested alerts: `oldestReadyAgeMs > 60000` for 5 minutes; `dead > 0`; `expiredLeases > 0` for 5 minutes.

---

## 15. Testing

### 15.1 Strategy

| Layer | Tool | Scope | Runs in |
|---|---|---|---|
| Unit (UT-xx) | Vitest, no database | Pure logic: backoff, option parsing, validation, rendering, scheduler, flusher and deliverer with fake executors, signing | `static` CI job, `pnpm test:unit` |
| Integration (INT-xx) | Vitest + real PostgreSQL (+ Redis for INT-85) | Every SQL statement and every relay behaviour, for both adapters | CI matrix Node 22/24 × PostgreSQL 14/16/17/18 (required) plus Node 20 × PostgreSQL 17 (best-effort, PRD D-41, D-42) |
| Chaos (CHAOS-xx) | `tsx` script, child processes, SQL invariants | Crash safety under random SIGKILL | CI `chaos` job (Node 22, PostgreSQL 17) |
| Benchmark (BENCH-01) | `tsx` script | Throughput by batch size | `bench.yml` (manual or monthly), local `pnpm bench` |
| Example (EX-01) | shell smoke test against `docker compose` | The example works end to end | CI `example` job |

Test-writing rules (also in AGENTS.md):
- Default wait for a condition is 3 s (`waitFor(fn, { timeoutMs: 3000 })`). A longer wait is allowed only for something that genuinely takes time (10,000 deliveries, chaos drain), with a comment saying why. Vitest `testTimeout` is 30 s; individual heavy tests set at most 120 s with a comment.
- Never `sleep` to wait for the relay; wait for an event or a database condition. Never wait for real backoff or lease time; move the test clock.
- Every test file creates its own schema (§15.4), so files run in parallel without interfering. No test asserts on data outside its schema.
- Adapter-relevant tests run for both adapters via `describe.each(ADAPTERS)`. A test marked "one adapter" runs with postgres.js only and says why.

### 15.2 Unit tests

| ID | File | Cases |
|---|---|---|
| UT-01 | `backoff.test.ts` | `jitter: 'none'`: attempt 1 = base, attempt 2 = base × factor, cap at max; attempt 2000 (overflow to Infinity) = max; `factor = 1` constant; `base = 0` → 0; full jitter with `random = () => 0` → 0 and `() => 0.999999` → ceiling; output is always an integer in `[0, ceiling]` (property test over 10,000 seeded randoms); invalid attempt (0, 1.5, NaN) and invalid random output (1, −0.1, NaN) throw `RangeError` |
| UT-02 | `relay-options.test.ts` | Defaults resolved exactly as §5.4; every range boundary accepted and boundary ± 1 rejected; `batchSize > concurrency` rejected; `leaseMs < handlerTimeoutMs + 1000` rejected; both or neither of `handlers`/`publisher` rejected; `topics` with `handlers` rejected; unknown option (`maxRetries`, `attempts`, `backoff`) rejected with the name in the message; non-function handler rejected; all issues reported at once in `details.issues` |
| UT-03 | `outbox-config.test.ts` | Defaults; identifier regex and length limits for schema (30) and prefix (20); uppercase, hyphen, quote, empty and leading digit rejected; `maxAttempts` and `maxPayloadBytes` ranges; derived names and channel |
| UT-04 | `render.test.ts` | Snapshot of every rendered statement for defaults and for `app_events`/`ob_`; no `{{` left after rendering; quoting doubles `"`; row mapping (`mapMessageRow`) converts types and throws `OUTBOX_INTERNAL` naming the column for a wrong type |
| UT-05 | `validate.test.ts` | Every rule in §5.2 with a passing and a failing case; error carries `index` and `field`; payload with BigInt, cycle, `undefined` rejected; size limit counts UTF-8 bytes (a payload of 1000 × "ğ" is 2002+ bytes); batch of 1001 rejected; extra property `dedupe_key` rejected; batch dedupe collapsing |
| UT-06 | `uuid.test.ts` | Format `^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`; timestamp prefix of the first id equals the injected clock; 10,000 ids generated while the injected clock stays on one millisecond are unique and strictly increasing as strings (monotonic counter in `rand_a`); after counter overflow the timestamp field advances by 1 ms (RFC 9562 §6.2 method 1), so no id's timestamp is below the clock and none exceeds it by more than `ceil(10000 / 2048)` ms; an injected clock that moves backwards never produces a smaller id |
| UT-07 | `errors.test.ts` | Brand works across two separately loaded copies (simulate by constructing an object with the brand symbol and code); `isRetryableError`/`isNonRetryableError`; classification table in §5.9; `last_error` formatting and truncation at 2000 with `…` |
| UT-08 | `scheduler.test.ts` | Table-driven `decide` for each rule in §9.5.1 (exit, wait-slot thresholds with `active = 0` and `> 0`, claim on first run, on wake, after a full claim, sleep after partial and empty claims); `nextInterval` sequence 100, 200, 400, 800, 1600, 2000, 2000; reset on wake |
| UT-09 | `flush.test.ts` | Fake executor with controllable latency: 50 completions arriving during one slow flush are written in exactly one follow-up statement; complete and fail in one cycle; statement error puts items back and retries with backoff (fake timers); items past their lease estimate are dropped with one `error` event; `drain()` resolves only when empty; missing ids → `leaseLost` events |
| UT-10 | `deliver.test.ts` | Fake timers: handler exceeding `handlerTimeoutMs` gets an aborted signal whose reason has code `OUTBOX_HANDLER_TIMEOUT`, slot is freed, outcome is fail with computed delay; synchronous throw is caught; late resolution after timeout is ignored and causes no unhandled rejection; `NonRetryableError` → terminal; `RetryableError.retryAfterMs` clamped |
| UT-11 | `webhook.test.ts` | Signing test vector; `whsec_` secret decoding; `verifyWebhook` accepts valid, rejects tampered body, wrong secret, missing header, timestamp outside tolerance, and accepts when one of several signatures matches; `Retry-After` parsing (`"3"`, HTTP-date, garbage); status classification table with an injected `fetch`; redirect not followed; secret absent from error messages |
| UT-12 | `cli.test.ts` | Argument parsing for every option; unknown option exit 2; URL password redaction (`postgres://u:secret@h/db` → `postgres://u:***@h/db`); `--print --from 1` output; help text snapshot |
| UT-13 | `bullmq.test.ts` | Fake queue: `jobId = 'outbox-' + id`, matching `^outbox-[0-9a-f-]{36}$` (no `:`, not an integer); job options passed through; missing `attempts` → `OUTBOX_CONFIG` (static) or `NonRetryableError` (per message); user `jobId` rejected; topic map and function resolution; unknown topic → `NonRetryableError` |
| UT-14 | `emitter.test.ts` | Listener isolation (throwing listener does not stop others, produces `error` phase `listener`); `on` returns an unsubscribe function; console fallback when no `error` listener, rate-limited to one line per phase per 10 s (fake timers) |
| UT-15 | `smoke.test.ts` | T-01: exported build-time `VERSION` equals `package.json` version |
| UT-16 | `guards.test.ts` | T-03: one passing and one failing fixture for every G-1..G-8 rule; changeset policy cases from §19.1 |
| UT-17 | `wait.test.ts` | T-02: condition and event waits default to 3 seconds; filter events and unsubscribe after resolution/timeout; deferred resolves/rejects |

### 15.3 Integration tests

Conventions for this table: "both" = runs for postgres.js and pg. `tc` = the test clock from `@firatkill/outbox/testing`, installed in `beforeAll`. "Relay(x)" = `outbox.createRelay` with options `x` and, unless stated, `listen: false`, `poll: { minIntervalMs: 10, maxIntervalMs: 50 }`, `reclaimIntervalMs: 500`, `retry.jitter: 'none'`.

#### Migrations (`tests/integration/migrations.test.ts`)

| ID | Adapters | Setup and steps | Assertions |
|---|---|---|---|
| INT-01 | both | Empty schema; `migrate()`; `migrate()` again | First returns `applied: [{1,'initial'}]`, second `applied: []`; tables, function and the seven named indexes exist (`pg_indexes` names: the six `outbox_messages_*` indexes of §7.3 plus `outbox_inbox_processed_idx`; primary keys not counted); `outbox_schema_migrations` has one row with the checksum of `MIGRATIONS[0]`; `schemaVersion()` = `{ current: 1, required: 1 }` |
| INT-02 | both | Two outboxes in one database: defaults in schema A and `tablePrefix: 'ob_'` in schema B; migrate both; enqueue one message to each; run a relay on A | B's message stays `pending`; channels differ; no object of B is touched by A's statements |
| INT-03 | one adapter (runner logic is driver-independent) | Migrate; `update ... set checksum = 'x'`; migrate | Throws `OUTBOX_MIGRATION_CHECKSUM` with version 1; nothing changed |
| INT-04 | both | Five `migrate()` calls with `Promise.all` on separate connections | All resolve; exactly one result lists version 1 as applied; one version row |
| INT-05 | one adapter | Schema A: execute `migrationSql({ schema: A })` as one script. Schema B: runner | `information_schema.columns`, `pg_constraint` definitions, `pg_indexes.indexdef` (schema name normalised) and version rows are identical |
| INT-06 | both | Empty schema; `relay.start()`; `outbox.stats()` | Both reject with `OUTBOX_NOT_MIGRATED`; message contains `npx outbox migrate --schema` |
| INT-07 | both | Empty schema; `migrate({ dryRun: true })` | Returns SQL containing `create table`; afterwards the schema has no tables (`to_regclass` null) |
| INT-08 | both | T-02 harness: create two unique schemas, create and write a table in one, inspect the other, then clean up the test-owned schemas | Table/data isolation holds for both drivers; cleanup removes only the test-owned schemas; two concurrent harness runs pass independently |

#### Enqueue (`tests/integration/enqueue.test.ts`)

| ID | Adapters | Setup and steps | Assertions |
|---|---|---|---|
| INT-10 | both | In a transaction: insert a business row, enqueue one message with every field set; commit | One row: fields mapped (key, headers, dedupe key, max attempts), `status = 'pending'`, `attempts = 0`, `id` equals the returned UUIDv7, `created_at` within 2 s of `now()`; business row present |
| INT-10b | both | Create role `t_producer_<schema>_<adapter>` (roles are cluster-wide, so the name must be unique per test schema and adapter; dropped in `afterAll` with `drop owned by ... ; drop role ...`) with only `usage` on the schema, `insert, select` on the messages table and `execute` on `outbox_now()`; `set local role` to it inside a transaction; enqueue (A-19) | Insert succeeds without any sequence grant; dedupe lookup (E2) works under the same role |
| INT-11 | both | Listener on the channel (separate connection); transaction inserts a business row, enqueues, then throws | Zero message rows and zero business rows; no notification within 300 ms |
| INT-12 | both | Spy executor; enqueue 1000 messages in one call; then 1001 | Exactly one statement for 1000; `seq` strictly increasing in input order (A-05); results in input order; 1001 rejected with `OUTBOX_INVALID_MESSAGE` before SQL |
| INT-13 | both | (a) Two transactions enqueue `(topic t, dedupeKey d)`; (b) same `d` on topic `u`; (c) one batch containing `d` twice | (a) one row; second result `deduped: true` with the first id; (b) two rows total for `d`; (c) one row, second result references the first id |
| INT-14 | both | Transaction T1 enqueues `d` and holds 300 ms; T2 enqueues `d` concurrently. Variant 1: T1 commits. Variant 2: T1 rolls back | V1: T2 waits, returns `deduped: true` with T1's id (E2 path). V2: T2 inserts, `deduped: false`; one row in both variants |
| INT-15 | both | Enqueue with `delayMs: 60000`; `runOnce()`; `tc.advance(59000)`; `runOnce()`; `tc.advance(2000)`; `runOnce()`. Also: in one transaction `tc.setLocal(tx, 61000)` and run the claim statement C1 directly | `available_at - created_at` = 60 s; first two runs claim 0, third claims 1; the transaction-local claim returns the row while other connections still see it as not ready |
| INT-16 | both | `availableAt = new Date((await tc.now()).getTime() + 5000)`; run, advance 6 s, run | Claimed only after the advance; `available_at` equals the given instant to the millisecond |
| INT-17 | both | Spy executor; each invalid input from UT-05 | Each rejects with `OUTBOX_INVALID_MESSAGE` and the executor saw zero statements |
| INT-18 | both | `maxPayloadBytes: 1024`; payload of 1025 bytes; payload of 1024 bytes | `OUTBOX_PAYLOAD_TOO_LARGE`; exactly-at-limit succeeds |
| INT-19 | both | Listener connection; enqueue in a transaction and wait 200 ms before commit; then an outbox with `notify: false` | Notification arrives after commit, not before; one notification for a 10-message batch; none with `notify: false` and the statement text contains no `pg_notify` call path (spy shows `$2` = null) |

#### Relay basics, concurrency and leases (`relay.test.ts`, `concurrency.test.ts`, `leases.test.ts`)

| ID | Adapters | Setup and steps | Assertions |
|---|---|---|---|
| INT-20 | both | Enqueue one message; Relay(handlers recording calls); start; wait for `delivered`; stop | Handler called once with matching message fields, `ctx.attempt = 1`, `ctx.signal.aborted = false`, `ctx.relayId = relay.id`; row `done`, `completed_at` set, lease columns null, `attempts = 1` |
| INT-21 | both | Enqueue 5; in a separate transaction `select ... where id = <first> for update` and keep it open; `runOnce()` | 4 claimed, the locked one skipped and still `pending`; after releasing the lock the next run claims it |
| INT-22 | both | 10,000 messages over 10 topics. 4 relays, each with its own pool (`max: 4`), `concurrency: 50`, `batchSize: 50`, handler increments `Map<id, count>` and awaits a random 0–2 ms. Wait for all `done` (timeout 60 s, comment: 10,000 real deliveries) | Map has 10,000 keys, every count is 1; table: 10,000 `done`, all `attempts = 1`; each relay delivered ≥ 100; zero `leaseLost`, zero `reclaimed` |
| INT-23 | one adapter (child process uses postgres.js) | Spawn `tests/helpers/relay-child.ts` with `leaseMs: 5000, handlerTimeoutMs: 4000`; its handler inserts into `t_started` then waits forever on its signal. Enqueue 1. Wait for the `t_started` row. `SIGKILL` the child. `tc.advance(6000)`. Start Relay B in-process with a recording handler | B emits `reclaimed` with the id within one reclaim; then `delivered`; row `done`, `attempts = 2`, `last_error` starts with `OUTBOX_LEASE_EXPIRED: lease held by <child relay id>` |
| INT-24 | both | Relay A (`leaseMs: 120000, handlerTimeoutMs: 110000`) whose handler waits on a deferred and ignores its signal. Call `A.runOnce()` without awaiting; wait until A's handler started. `tc.advance(121000)` (the lease is now expired in database time; A's local timeout has not fired). `B.runOnce()`: reclaims, delivers, completes. Then resolve A's deferred and await A's `runOnce()` | B's completion recorded (`locked_by` was B, `attempts = 2`); A then emits `leaseLost { outcome: 'done' }`; A emits no `delivered`; row unchanged by A |
| INT-25 | both | Enqueue 1; run claim statement C1 directly with relay id `ghost` (simulates a relay that died after claiming); `tc.advance(leaseMs + 1)`; Relay B start | Reclaimed, delivered by B; `attempts = 2`; handler ran once |
| INT-26 | both | Relay(`handlerTimeoutMs: 200`, `leaseMs: 1200`, `retry: { baseDelayMs: 1000, jitter: 'none' }`), handler awaits `ctx.signal` abort and records the reason | Reason code `OUTBOX_HANDLER_TIMEOUT`; row `pending`, `available_at - now` ≈ 1000 ms (±150), `last_error` starts with `OUTBOX_HANDLER_TIMEOUT`; `failed { willRetry: true }` emitted |
| INT-27 | both | Messages on topics `a`, `b`, `c`. Relay 1 handlers `{ a }`; `runOnce` ×2. Relay 2 publisher mode `topics: ['b']`; `runOnce` | Relay 1 claims only `a`; relay 2 only `b`; `c` remains `pending` |
| INT-28 | both | 25 messages; `runOnce()` with `batchSize: 10, concurrency: 10` three times; `runOnce()` after `start()` | Results `claimed` 10, 10, 5 with matching `delivered`; calling `runOnce()` on a started relay throws `OUTBOX_RELAY_STATE` |
| INT-29 | both | 2,000 messages; Relay running; every 200 ms for 2 s terminate the relay's backend connections (`pg_terminate_backend` on `application_name` set for the relay pool) | `error` events with phases `claim`/`flush` occur; the relay keeps running; all 2,000 eventually `done` (timeout 30 s, comment: reconnect backoff) |

#### Retries, dead letters and admin (`retries.test.ts`, `admin.test.ts`)

| ID | Adapters | Setup and steps | Assertions |
|---|---|---|---|
| INT-30 | both | Relay(`retry: { baseDelayMs: 1000, factor: 2, jitter: 'none' }`), handler fails twice then succeeds; after each failure read `available_at - outbox_now()` and `tc.advance` past it | Delays ≈ 1000 and 2000 ms (±150); third attempt succeeds; `attempts = 3`; two `failed` events with `retryInMs` 1000 and 2000 |
| INT-31 | both | `maxAttempts: 3` on the message; handler always throws `Error('boom')`; advance the clock between runs | After 3 claims: `dead`, `dead_at` set, `last_error = 'Error: boom'`; events: `failed` ×3 (last `willRetry: false`), `dead` ×1; further `runOnce` claims nothing |
| INT-32 | both | Handler throws `NonRetryableError('bad payload')` | `dead` after 1 attempt; `last_error` starts with `OUTBOX_NON_RETRYABLE` |
| INT-33 | both | Handler throws `RetryableError('later', { retryAfterMs: 5000 })`; then one with `retryAfterMs: 10_000_000` | Delay ≈ 5000 ms; second clamped to `maxDelayMs` |
| INT-34 | both | Message with `maxAttempts: 1`; claim via C1 as `ghost`; advance past lease; reclaim | `dead` (not `pending`), `reclaimed.deadIds` contains it, `dead` event emitted |
| INT-35 | both | 5 dead messages on topics `a` (3) and `b` (2), one with key `k`; `retryDead({ topic: 'a' })`, `retryDead({ ids: [<b1>] })`, `retryDead({ key: 'k' })`, `retryDead({ limit: 1 })` | Correct ids returned; those rows `pending`, `attempts = 0`, `dead_at` null, `last_error` kept; then delivered by a relay |
| INT-36 | both | 1,050 `done` messages completed 8 days ago (advance clock), 10 done now, 5 dead 8 days ago, 5 pending; `purge({ olderThanMs: 7 days, batchSize: 100 })`; then with `includeDead: true` | First deletes 1,050 (11 statements, spy), leaves recent, dead and pending; second deletes the 5 dead; a deleted message's `dedupeKey` can be enqueued again |
| INT-37 | both | Known mix: 3 ready, 2 scheduled, 2 in flight (1 expired), 1 dead, 4 done, 1 skipped; `stats()`, `stats({ includeTerminal: true })`. Then insert 100,000 `done` rows with `generate_series`, `analyze`, and `explain (format json)` the claim | Counts exact; `oldestReadyAgeMs` equals the age of the oldest ready message (±50 ms); terminal counts only when asked; the claim plan uses `outbox_messages_claim_idx`; the S1 plan contains no `Seq Scan` on the messages table |
| INT-38 | both | `skip` a pending, a dead, an in-flight and a done message, and a random UUID | First two → `skipped` with `previousStatus`; in-flight and done → `OUTBOX_NOT_SKIPPABLE` with status; random → `OUTBOX_NOT_FOUND` |
| INT-39 | both | 3 dead on `a`, 2 on `b`; `listDead()`, `listDead({ topic: 'b', limit: 1 })` | Newest first; filter and limit respected; full message shape |

#### Ordering (`tests/integration/ordering.test.ts`)

| ID | Adapters | Setup and steps | Assertions |
|---|---|---|---|
| INT-40 | both | Key `k`: 5 messages in one batch; Relay(`ordering: 'key'`, `concurrency: 10`), handler records order and tracks in-flight count per key | Order equals `seq` order; max in-flight for `k` = 1 |
| INT-41 | both | Own schema created inside the test, without the test clock (INV-08 compares `outbox_now()` with `clock_timestamp()`, so the offset must be 0 even if other tests in the file advanced theirs). 200 keys × 25 messages (5,000) plus 1,000 unkeyed, interleaved; 4 relays with `ordering: 'key'`, `concurrency: 20`, `batchSize: 20`, handler latency random 0–5 ms; wait for all done (timeout 60 s, comment: 6,000 deliveries with per-key serialisation) | For each key, the first-delivery start times follow `seq` order and each starts after the previous message's `completed_at`; max in-flight per key = 1 across all relays; unkeyed all delivered; INV-08 SQL returns 0 rows |
| INT-42 | both | Key `k`: m1, m2. Handler fails m1 once (`baseDelayMs: 10000`); other key `j` has 3 messages | While m1 is in backoff, `runOnce` delivers `j` messages but not m2; after advancing 10 s, m1 then m2 delivered in order |
| INT-43 | both | Key `k`: m1 (NonRetryable → dead), m2, m3. Variant A: `skip(m1)`. Variant B: `retryDead({ ids: [m1] })` with a handler that now succeeds | Before action: 3 runs claim nothing for `k`. A: m2, m3 delivered in order; m1 `skipped`. B: m1 delivered before m2, then m3 |
| INT-44 | both | Key `k` blocked by a dead head; 10 unkeyed and 10 messages on 10 other keys | All 20 delivered; `k` messages untouched |
| INT-45 | both | Key `order-1`: `order.created` then `order.paid` (two transactions, sequential); Relay A handles only `order.paid`, Relay B only `order.created`; A runs first | A claims nothing until B completed `order.created` |

#### Wake-up (`tests/integration/wakeup.test.ts`)

| ID | Adapters | Setup and steps | Assertions |
|---|---|---|---|
| INT-50 | both | Relay(`listen: true`, `poll: { minIntervalMs: 5000, maxIntervalMs: 5000 }`); start; wait 300 ms for idle; 20 times: record `t0 = performance.now()` right after the enqueuing transaction commits, record `t1` at handler start, wait 100 ms | p50 (t1 − t0) ≤ 50 ms, max ≤ 500 ms (NFR-11) |
| INT-51 | both | Relay(`listen: false`, `poll: { minIntervalMs: 50, maxIntervalMs: 300 }`); idle 1 s; enqueue | Delivered within 1 s (`waitFor` 1000 ms) |
| INT-52 | both | Listening relay; find its listen backend (`pg_stat_activity.query ilike 'listen%'`), `pg_terminate_backend`; then enqueue | `error` phase `listen` emitted (pg) or reconnect observed (postgres.js `onListen`); message delivered within 2 s; relay still running |
| INT-53 | both | Relay(`listen: false`, `poll: { minIntervalMs: 100, maxIntervalMs: 1000 }`), spy executor counting claim statements; idle 3 s (comment: measuring idle backoff needs real time) | Claims between 4 and 9 (expected 100+200+400+800+1000... ≈ 6) |
| INT-54 | both | Relay with `db` = pool A and `listen: { db: pool B }` | Listen backend belongs to pool B (`application_name`), statements to pool A; wake-up works |

#### Inbox (`tests/integration/inbox.test.ts`)

| ID | Adapters | Setup and steps | Assertions |
|---|---|---|---|
| INT-60 | both | `withInbox(tx, 'c1', 'm1', fn)` twice (two transactions), then with consumer `c2` | `processed` with `fn`'s result, then `duplicate` (fn not called), then `processed` for `c2` |
| INT-61 | both | Transaction: `withInbox` with `fn` that inserts an effect row then throws; transaction rolls back; retry | No inbox row and no effect after the first; second processes; one effect row |
| INT-62 | both | 10 concurrent transactions (separate connections) each `withInbox(tx, 'c', 'm', fn inserting an effect, sleeping 50 ms)` | Exactly 1 `processed`, 9 `duplicate`; exactly 1 effect row |
| INT-63 | both | Relay handler: `withInbox(tx, 'mailer', msg.id, insert effect)`. Force a redelivery with the INT-24 pattern (A's handler commits its inbox transaction, then A loses its lease; B redelivers) | Two deliveries, one effect row; B's `withInbox` returned `duplicate` |
| INT-64 | both | 3 old inbox rows (advance clock 8 days), 2 recent; `purgeInbox({ olderThanMs: 7 days })` | Deletes 3 |
| INT-65 | both | `createInbox({ db, schema: 'consumer_x' })` in a different schema than the outbox; migrate it; `withInbox` | Row lands in `consumer_x.outbox_inbox`; works without any outbox messages table being used |

#### Lifecycle and observability (`tests/integration/lifecycle.test.ts`)

| ID | Adapters | Setup and steps | Assertions |
|---|---|---|---|
| INT-70 | both | 20 messages; Relay(`concurrency: 20, batchSize: 20`), handlers take 300 ms; after `claimed`, enqueue 10 more and call `stop({ drainTimeoutMs: 5000 })` | Resolves `{ drained: true, released: 0 }` after ≈ 300 ms; 20 `done`; the 10 new messages still `pending` (no claims after stop); no `in_flight` rows |
| INT-71 | both | 5 messages; handlers wait for abort (honouring signal); `stop({ drainTimeoutMs: 200 })` | Resolves in < 1 s with `{ drained: false, released: 5 }`; handlers saw reason `OUTBOX_SHUTDOWN`; rows `pending`, `attempts = 0`, lease columns null |
| INT-72 | both | `start()` twice; `stop()` twice; `start()` after `stop()`; `stop()` on a never-started relay | Second `start` → `OUTBOX_RELAY_STATE`; both `stop` calls return the same result object; start after stop → `OUTBOX_RELAY_STATE`; stop on idle → `{ drained: true, released: 0 }` |
| INT-73 | both | Relay with `signal` from an `AbortController`; start; abort | State becomes `stopped`; in-flight work drained |
| INT-74 | both | Fake tracer recording spans; listeners for every event, one `delivered` listener that throws; deliver 3 (one fails once) | Spans `outbox claim`, `outbox deliver` ×4, `outbox flush` with attributes from §14.2; deliver span for the failure ended with `error` and `recordException`; the throwing listener produced `error` phase `listener`; all 3 delivered |
| INT-75 | one adapter | No `error` listener; terminate connections to force claim errors for 3 s; spy `console.error` | At most one line per phase per 10 s; line format `[outbox] <relayId> claim: ...` |

#### Adapters (`tests/integration/adapters.test.ts`)

| ID | Adapters | Setup and steps | Assertions |
|---|---|---|---|
| INT-80 | pg | `pool.totalCount/idleCount` before and after 50 `transaction()` calls, half throwing | All clients released; pool counts back to baseline; a failing `rollback` destroys the client (`release(err)`) |
| INT-81 | postgres-js | Client created with `prepare: false`; run INT-20 and INT-22 scenarios at reduced size (1,000 messages) | Pass |
| INT-82 | both | Same message read via claim, `listDead`, and `stats` through each adapter | Identical JS values and types (`seq` string, dates `Date`, payload deep-equal, numbers) |
| INT-83 | both | Outbox on pool A; relay with `db: poolB` | Relay statements run on pool B (`application_name`) |

#### Publishers (`tests/integration/bullmq.test.ts`, `webhook.test.ts`)

| ID | Adapters | Setup and steps | Assertions |
|---|---|---|---|
| INT-85 | one adapter | Real Redis (`REDIS_URL`), BullMQ `Queue('emails')`; publisher with `jobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: { age: 3600 } }`; deliver one message, then force a redelivery (INT-25 pattern) | `queue.getJobCounts()` shows 1 job; `job.id = 'outbox-<id>'`; `job.opts.attempts = 5`; `job.data.outboxId` = id |
| INT-86 | one adapter | Local `node:http` server whose response is scripted per request: 200; 500 then 200; 400; 408; 429 with `Retry-After: 3`; 302; sleep 1 s with `timeoutMs: 200` | 200 → `done`; 500 → retried then `done`; 400 → `dead`; 408 → `pending` with backoff; 429 → `available_at - now` ≈ 3000 ms; 302 → `dead`, Location not requested; timeout → `pending`, `last_error` starts with `OUTBOX_RETRYABLE: OUTBOX_WEBHOOK_TIMEOUT` (§5.9 webhook errors) |
| INT-87 | one adapter | The server verifies each request with `verifyWebhook` and the raw body; secret both raw and `whsec_` | Verification passes; `webhook-id` = message id; body bytes signed equal bytes received |

#### CLI (`tests/integration/cli.test.ts`, runs the built `dist/cli.js`)

| ID | Adapters | Setup and steps | Assertions |
|---|---|---|---|
| INT-90 | n/a | `node dist/cli.js migrate --url $URL --schema s1`; `--status`; `--status --check` before and after; `--dry-run` on a fresh schema; `--print` | Exit codes 0, 0, 3 then 0, 0; status output format §8.4; dry run creates nothing; `--print` equals `migrationSql({ schema: 'public' })` |
| INT-91 | n/a | `stats --json`; bad URL; no URL and no `DATABASE_URL`; unknown command | JSON parses to `OutboxStats` keys; exit 1 with password redacted; exit 2; exit 2 |

### 15.4 Test harness

- `tests/global-setup.ts`: connects to `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:54317/outbox_test`), creating database `outbox_test` from `postgres` if missing. Prints the server version.
- `tests/helpers/db.ts`: `createTestSchema()` returns `{ schema, admin, drop }` with `schema = 't_' + randomBytes(4).toString('hex')`; `drop()` runs `drop schema ... cascade` in `afterAll`. Each test file calls it in `beforeAll` and migrates; a test that needs an empty table or a clock offset of 0 (INT-37's exact counts, INT-41) creates an additional schema of its own. Tests that assert exact table-wide counts use a schema no other test in the file writes to.
- `tests/helpers/adapters.ts`: `ADAPTERS` array of `{ name, open(schema) }` returning a uniform harness `{ outbox, tc, withTx(fn), raw(sql, params), newPool(appName), end() }` for postgres.js and pg. `withTx` passes the driver's native transaction handle.
- `tests/helpers/spy.ts`: wraps a `DriverAdapter` to record statement texts and parameters.
- `tests/helpers/wait.ts`: `waitFor(predicate, { timeoutMs = 3000, intervalMs = 20 })`, `waitForEvent(relay, name, filter, timeoutMs = 3000)`, `deferred<T>()`.
- `tests/helpers/relay-child.ts`: a relay in a child process, configured by environment, reporting its `relayId` on stdout as JSON.
- `vitest.config.ts` (normative values):

```ts
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  define: { __OUTBOX_VERSION__: JSON.stringify(version) },   // same as tsdown (§4.2)
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], testTimeout: 10_000 } },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          pool: 'forks',
          maxWorkers: 4,
          fileParallelism: true,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
```

`src/cli.ts` is excluded from coverage because it runs in a child process in INT-90; its pure parts live in `src/core/cli-args.ts` (covered by UT-12).

If the installed Vitest rejects `maxWorkers` or `fileParallelism` inside a project (some versions accept them only at the root, A-17), move them to the root `test` object with the same values; the unit project is unaffected by them. Tests import library code from `src/` by relative path (§4.3); integration tests that need a built artifact (INT-90, INT-91) check that `dist/cli.js` is newer than `src/cli.ts` and run `pnpm build` in `beforeAll` otherwise.

### 15.5 Chaos tests

`pnpm chaos [--ordering] [--duration 30] [--relays 4] [--messages 20000] [--seed <n>] [--url <url>]`

| Parameter | Default | Notes |
|---|---|---|
| `duration` | 30 s | Kill phase length |
| `relays` | 4 | Child processes alive at any time |
| `messages` | 20,000 | 70% keyed over 500 keys, 30% unkeyed; 10% carry a `dedupeKey` and are enqueued twice |
| `kill interval` | uniform 1000–3000 ms | One random live child per kill |
| child relay | `concurrency: 20, batchSize: 20, leaseMs: 2000, handlerTimeoutMs: 500, reclaimIntervalMs: 500, poll: { minIntervalMs: 20, maxIntervalMs: 200 }, retry: { baseDelayMs: 10, factor: 2, maxDelayMs: 200 }`, `listen: true` | Short leases so crashed work is recovered within the run |
| messages `maxAttempts` | 50 | Injected failures and kills cannot exhaust attempts (probability of 50 consecutive failures is negligible) |
| injected failure rate | 5% per delivery, decided by a seeded hash of (message id, attempt) | |
| seed | random, printed | `--seed` reproduces the same message set and kill schedule |

Setup (schema `chaos_<seed>`):

```sql
create table chaos_produced  (message_id uuid primary key, dedupe_key text, enqueued_at timestamptz not null default clock_timestamp());
create table chaos_deliveries (id bigserial primary key, message_id uuid not null, relay_id text not null, attempt int not null,
                               injected_failure boolean not null, started_at timestamptz not null default clock_timestamp());
create table chaos_effects   (message_id uuid not null, relay_id text not null, applied_at timestamptz not null default clock_timestamp());
create table chaos_kills     (relay_id text primary key, killed_at timestamptz not null default clock_timestamp());
```

`chaos_effects` deliberately has no unique constraint, so a duplicate effect would be visible.

Procedure:
1. Migrate the outbox into the schema. Do not install the test clock (INV-08 compares `outbox_now()`-based `completed_at` with `clock_timestamp()`, so `outbox_now()` must equal `now()`). Enqueue 50% of the messages before starting relays (sequential transactions of 100). In the same transaction, insert into `chaos_produced` every result with `deduped: false`; results with `deduped: true` are not inserted (their id is already there) and are instead checked in memory against the id of the first enqueue for that `dedupeKey` (INV-09).
2. Spawn `relays` children (`scripts/chaos/relay-child.ts`, relay ids `r<slot>-g<generation>`). Child handler:
   1. Decide `injected` from the seeded hash.
   2. Insert into `chaos_deliveries` (autocommit) with `injected_failure`.
   3. If injected, throw `Error('injected')`.
   4. Await a random 0–20 ms (seeded).
   5. `sql.begin(tx => outbox.withInbox(tx, 'chaos', msg.id, (tx) => tx\`insert into chaos_effects ...\`))`.
3. Producer: enqueue the remaining 50% during the first 20 s at a steady rate in transactions of 100, one producer process, sequential (so per-key enqueue transactions never overlap, satisfying GU-06's precondition). Messages with a `dedupeKey` are enqueued a second time in a later transaction.
4. Killer: until `duration` ends, every 1–3 s insert the victim into `chaos_kills` first, then `SIGKILL` it, then spawn a replacement with the next generation id.
5. Drain: stop killing; wait until `ready + scheduled + inFlight = 0` (poll `stats()` every 500 ms, timeout 60 s, comment: recovery of the last leases); then `SIGTERM` all children (they call `relay.stop({ drainTimeoutMs: 5000 })` and exit 0); wait up to 10 s.
6. Run `scripts/chaos/invariants.sql`; print a JSON report `{ seed, ordering, durationS, spawned, kills, produced, deliveries, duplicateDeliveries, injectedFailures, violations: { "INV-01": 0, ... } }`; write it to `bench/out/chaos-<seed>.json` (gitignored).
7. Exit 1 if any violation, if `kills < 5` (run too gentle to prove anything), or if the drain timed out.

Invariants (`scripts/chaos/invariants.sql`; each query returns violating rows, the expected count is 0):

| ID | Invariant | Query (abridged; `m` = outbox messages, `d` = deliveries, `e` = effects, `k` = kills, `p` = produced) |
|---|---|---|
| INV-01 | Every produced message is `done` | `select p.message_id from p left join m on m.id = p.message_id where m.id is null or m.status <> 'done'` |
| INV-02 | Every message has a successful delivery | `select m.id from m where not exists (select 1 from d where d.message_id = m.id and not d.injected_failure)` |
| INV-03 | Duplicate deliveries happen only after a crash or an injected failure | `with r as (select d.*, row_number() over (partition by message_id order by started_at desc, id desc) rn from d) select * from r where rn > 1 and not injected_failure and relay_id not in (select relay_id from k)` |
| INV-04 | No leases or in-flight rows remain; lease columns consistent | `select id from m where status = 'in_flight' or locked_by is not null or locked_until is not null` |
| INV-05 | Attempts accounting | `select m.id from m where m.attempts > m.max_attempts or (select count(*) from d where d.message_id = m.id) > m.attempts` |
| INV-06 | Exactly-once effects | `select message_id from e group by message_id having count(*) <> 1 union all select m.id from m where not exists (select 1 from e where e.message_id = m.id)` |
| INV-07 | No lost and no ghost messages | `select id from m where id not in (select message_id from p) union all select message_id from e where message_id not in (select id from m)` |
| INV-08 | (ordering mode) per-key order: each keyed message's first delivery starts after the previous same-key message completed | `with f as (select message_id, min(started_at) first_start from d group by message_id), s as (select id, key, seq, lag(completed_at) over (partition by key order by seq) prev_done from m where key is not null) select s.id from s join f on f.message_id = s.id where s.prev_done is not null and f.first_start <= s.prev_done` |
| INV-09 | Deduplication: one row per `(topic, dedupe_key)` and every second enqueue returned the first id | `select topic, dedupe_key from m where dedupe_key is not null group by 1, 2 having count(*) > 1` plus the producer's in-memory check, reported as a count |

INV-08 compares `completed_at` (`now()` at the start of the complete statement) with `started_at` (`clock_timestamp()` in the handler); both come from the database server's clock. The next message can only be claimed after the complete statement committed, so its delivery starts strictly later.

| Run | Command | CI |
|---|---|---|
| CHAOS-01 | `pnpm chaos --duration 30` | `chaos` job, every push and PR |
| CHAOS-02 | `pnpm chaos --duration 30 --ordering` | same job, second step |

### 15.6 Benchmark (BENCH-01)

`pnpm bench [--driver postgres-js|pg|both] [--messages 20000] [--runs 3] [--url <url>] [--out bench/results]`

Method (normative):
1. Database: PostgreSQL 17, default configuration (`fsync` and `synchronous_commit` on). In CI, the service container; locally `pnpm db:up`.
2. For each driver (default `both`) and each batch size in `[10, 100, 500]`: one warm-up run (discarded) and `runs` measured runs.
3. Each run: new schema; migrate; prefill `messages` messages (10 topics, no keys, payload `{ "n": <i>, "pad": "<190 x's>" }` ≈ 200 bytes) in enqueue batches of 1000; `vacuum analyze` the table; create one relay: driver pool `max: 10`, `concurrency = batchSize`, `batchSize`, `listen: false`, `poll: { minIntervalMs: 10, maxIntervalMs: 50 }`, `reclaimIntervalMs: 60000`, handler `async () => {}`.
4. `t0 = performance.now()`; `relay.start()`; wait until the `delivered` counter reaches `messages`; `t1`; `relay.stop()`. Throughput = `messages / ((t1 − t0) / 1000)`.
5. Record per run: msgs/s, p50 and p99 of `claimed.durationMs`. Report the median msgs/s of the measured runs.
6. Verify after each run: `select count(*) from m where status <> 'done'` = 0; otherwise the run fails (no number is published).

Results file (`bench/results/<YYYY-MM-DD>-<sha7>.json`, copied to `bench/results/latest.json`):

```json
{
  "schemaVersion": 1,
  "date": "2026-11-02T10:00:00.000Z",
  "gitSha": "abc1234",
  "packageVersion": "0.1.0",
  "runner": {
    "kind": "github-actions",
    "label": "ubuntu-24.04",
    "os": "Linux 6.8.0-1015-azure x64",
    "cpuModel": "AMD EPYC 7763 64-Core Processor",
    "cpus": 4,
    "memoryGb": 15.6,
    "imageVersion": "20261020.1.0"
  },
  "node": "v22.20.0",
  "postgres": "17.6",
  "config": { "messages": 20000, "runs": 3, "warmup": 1, "payloadBytes": 200, "listen": false, "poolMax": 10 },
  "results": [
    { "driver": "postgres-js", "batchSize": 10, "concurrency": 10, "runsMsgsPerSec": [0, 0, 0], "medianMsgsPerSec": 0, "claimP50Ms": 0, "claimP99Ms": 0 }
  ]
}
```

The numbers above are placeholders for the shape only; committed files contain only real output (AGENTS.md). `runner` fields come from `os.cpus()`, `os.totalmem()`, `os.release()`, `process.env.ImageVersion` and `RUNNER_OS`; `kind` is `local` outside Actions.

`pnpm bench:readme` rewrites the README block between `<!-- bench:start -->` and `<!-- bench:end -->`:

```markdown
| Batch size | postgres.js (msg/s) | pg (msg/s) |
|---:|---:|---:|
| 10 | <median> | <median> |
| 100 | <median> | <median> |
| 500 | <median> | <median> |

Median of 3 runs, 20,000 messages, one relay, no-op handler, PostgreSQL 17 (default settings) on a GitHub-hosted ubuntu-24.04 runner (4 vCPU AMD EPYC 7763, 16 GB). Source: bench/results/2026-11-02-abc1234.json.
```

---

## 16. CI and workflows (GitHub Actions)

Action versions below were current majors when written; verify each on the implementation date (A-10) and pin to the current major tag. Third-party actions other than `pnpm/action-setup` and `changesets/action` are not used.

### 16.1 `.github/workflows/ci.yml`

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]   # re-run the changeset rule when no-changeset is added

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  static:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    env:
      PR_LABELS: ${{ join(github.event.pull_request.labels.*.name, ',') }}   # read by the changeset rule (§19.1); empty on push
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0   # the changeset rule diffs against origin/main (§19.1)
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm check:guards
      - run: pnpm test:unit
      - run: pnpm build
      - run: pnpm check:package
      - run: pnpm size
      - name: Tarball contents
        run: |
          npm pack --dry-run --json > pack.json
          node -e "
            const files = JSON.parse(require('fs').readFileSync('pack.json','utf8'))[0].files.map(f => f.path);
            const bad = files.filter(p => !/^(dist\/|README\.md$|LICENSE$|CHANGELOG\.md$|package\.json$)/.test(p));
            if (bad.length) { console.error('unexpected files in tarball:', bad); process.exit(1); }
          "
      - run: pnpm docs:check
      - run: pnpm docs:build

  integration:
    needs: static
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    continue-on-error: ${{ matrix.best_effort }}   # best-effort cells never fail the workflow (PRD D-41, D-42)
    strategy:
      fail-fast: false
      matrix:
        node: [22, 24]
        pg: [14, 16, 17, 18]
        best_effort: [false]
        include:
          - node: 20
            pg: 17
            best_effort: true
    services:
      postgres:
        image: postgres:${{ matrix.pg }}
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: outbox_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres -d outbox_test"
          --health-interval 2s
          --health-timeout 5s
          --health-retries 30
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 2s
          --health-timeout 5s
          --health-retries 30
    env:
      TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/outbox_test
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Raise max_connections (service containers cannot take a command)
        run: |
          psql "$TEST_DATABASE_URL" -c "alter system set max_connections = 300"
          docker restart ${{ job.services.postgres.id }}
          for i in $(seq 1 30); do pg_isready -h localhost -U postgres && break; sleep 1; done
      - run: pnpm build
      - name: Integration tests
        if: ${{ !(matrix.node == 22 && matrix.pg == 17) }}
        run: pnpm test:integration
      - name: Unit + integration tests with coverage thresholds
        if: matrix.node == 22 && matrix.pg == 17
        run: pnpm test:coverage
      - if: matrix.node == 22 && matrix.pg == 17
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/
          retention-days: 14

  chaos:
    needs: static
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: outbox_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres -d outbox_test"
          --health-interval 2s
          --health-timeout 5s
          --health-retries 30
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/outbox_test
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: CHAOS-01 unordered
        run: pnpm chaos --duration 30
      - name: CHAOS-02 ordering mode
        run: pnpm chaos --duration 30 --ordering
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: chaos-reports
          path: bench/out/chaos-*.json
          retention-days: 14

  example:
    needs: static
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - name: EX-01
        run: |
          docker compose -f examples/orders/compose.yml up -d --build --wait
          bash examples/orders/scripts/smoke.sh
      - if: always()
        run: |
          docker compose -f examples/orders/compose.yml logs --no-color > example.log || true
          docker compose -f examples/orders/compose.yml down -v
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: example-logs
          path: example.log
```

Coverage thresholds (§15.4) are enforced in the one matrix cell (Node 22, PostgreSQL 17) that runs both Vitest projects with coverage; the other cells run integration tests only. The matrix has 8 required cells (Node 22, 24 × PostgreSQL 14, 16, 17, 18) and 1 best-effort cell (Node 20 × PostgreSQL 17). When PostgreSQL 14 becomes best-effort after its end of life (PRD D-42), move it from `pg` to an `include` entry with `best_effort: true` in the same way. If branch protection is configured, require the `static`, `chaos`, `example` and the 8 required `integration` checks by name, not the best-effort one.

### 16.2 `.github/workflows/bench.yml`

```yaml
name: bench

on:
  workflow_dispatch:
  schedule:
    - cron: '17 4 1 * *'   # 04:17 UTC on the 1st of every month

permissions:
  contents: write
  pull-requests: write

jobs:
  bench:
    runs-on: ubuntu-24.04
    timeout-minutes: 45
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: outbox_bench
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres -d outbox_bench"
          --health-interval 2s
          --health-timeout 5s
          --health-retries 30
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/outbox_bench
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm bench --driver both
      - run: pnpm bench:readme
      - name: Open PR with results
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          branch="bench/$(date -u +%Y-%m-%d)-${GITHUB_SHA::7}"
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git switch -c "$branch"
          git add bench/results README.md
          git commit -m "bench: results $(date -u +%Y-%m-%d) (${GITHUB_SHA::7})"
          git push origin "$branch"
          gh pr create --title "bench: results $(date -u +%Y-%m-%d)" --body "Automated BENCH-01 run on ubuntu-24.04. See bench/results/latest.json." --base main --head "$branch"
```

Requires the repository setting "Allow GitHub Actions to create and approve pull requests" (A-11). Merging the PR is a manual review step.

### 16.3 `.github/workflows/version.yml`

```yaml
name: version

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: version
  cancel-in-progress: false

jobs:
  version:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: changesets/action@v1
        with:
          version: pnpm run version
          commit: 'chore: version packages'
          title: 'chore: version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

No `publish` input: publishing happens only from a GitHub release (§16.4), so a merge to `main` never publishes by accident.

Pull requests opened or updated with `GITHUB_TOKEN` (the version PR here, the results PR of `bench.yml`) do not trigger other workflows, so `ci.yml` does not run on them. This is accepted: the version PR changes only `package.json`, `CHANGELOG.md`, the lockfile and `.changeset/*.md`, and CI runs on `main` after the merge, which release step 3 (§19.2) requires to be green before tagging. If branch protection requires status checks, the owner closes and reopens the PR (a human event) to trigger `ci.yml`. The repository setting "Allow GitHub Actions to create and approve pull requests" must be enabled for both workflows (A-11).

### 16.4 `.github/workflows/publish.yml`

```yaml
name: publish

on:
  release:
    types: [published]

permissions:
  contents: read
  id-token: write   # npm trusted publishing (OIDC) and provenance

jobs:
  publish:
    runs-on: ubuntu-24.04
    environment: npm
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v5
        with:
          ref: ${{ github.event.release.tag_name }}
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Tag matches package.json version
        run: |
          tag="${{ github.event.release.tag_name }}"
          version="v$(node -p "require('./package.json').version")"
          if [ "$tag" != "$version" ]; then echo "tag $tag != package $version"; exit 1; fi
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:unit
      - run: pnpm build
      - run: pnpm check:package
      - run: pnpm size
      - name: Ensure npm supports trusted publishing
        run: npm install -g npm@^11.5.1 && npm --version
      - name: Publish with provenance
        run: npm publish --provenance --access public
        env:
          # Empty once trusted publishing is configured (OIDC needs no token). Set only for the
          # first publish, because npm can configure a trusted publisher only for a package that
          # already exists (A-02, PRD D-44).
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

First publish (0.1.0, normative, PRD D-44): the owner creates a granular npm access token limited to publishing (read and write on packages, scope `@firatkill`, shortest available expiry), stores it as the `npm` environment secret `NPM_TOKEN`, and publishes 0.1.0 through this workflow (never from a local machine, AGENTS.md); provenance is still generated because `id-token: write` is granted. Right after, the owner configures the trusted publisher on npmjs.com (repository `firatkill/outbox`, workflow `publish.yml`, environment `npm`), deletes the `NPM_TOKEN` secret and revokes the token. From then on `NODE_AUTH_TOKEN` resolves to an empty string and npm uses OIDC.

Provenance prerequisites (checked in A-02): the repository is public; `package.json` `repository.url` matches the GitHub repository exactly (`git+https://github.com/firatkill/outbox.git`); the job has `id-token: write`; npm CLI ≥ 11.5.1 (trusted publishing; provenance alone needs ≥ 9.5); the job runs on a GitHub-hosted runner.

Integration tests are not repeated here: a release is cut from a commit whose CI already passed (release checklist). The `npm` GitHub environment restricts the job to the `main` branch tags and can require the owner's approval.

### 16.5 Docs deploy (Vercel)

There is no `docs.yml` workflow. The docs site is built and checked in CI and deployed by Vercel:

- Checks: the `static` job in `ci.yml` (§16.1) runs `pnpm docs:check` and `pnpm docs:build` on every pull request and every push to `main`. A broken docs build fails CI like any other check.
- Deploy: the Vercel project `outbox-docs` is linked to the GitHub repository through the Vercel Git integration. Every push to `main` creates a production deployment; every pull request gets a preview deployment whose URL Vercel posts on the PR. A release needs no extra step, because the release commit is already on `main`.
- Custom domain: `outbox.firatkil.com`, added by the owner in the Vercel project and pointed at Vercel with a DNS `CNAME` record to `cname.vercel-dns.com`.
- Cost and telemetry: Hobby plan, $0 (NFR-50). Vercel Web Analytics and Speed Insights stay off, and the site loads no Vercel scripts.

Build settings are committed in `vercel.json` at the repository root so they are reviewed like code:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vitepress",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm docs:build",
  "outputDirectory": "site/.vitepress/dist"
}
```

`pnpm docs:build` runs `docs:api` first (§4.1), so the TypeDoc reference is generated on every deployment. Vercel picks the pnpm version from the `packageManager` field and the Node.js major from the project setting (22.x, set by the owner). The project has no environment variables and no serverless functions.

The workflows hold no Pages permissions. `id-token: write` appears only in `publish.yml` (§16.4), for npm provenance.

Assumption A-15 covers the Vercel build.

### 16.6 Static guards (`scripts/check-guards.ts`, run in `static`)

Each rule prints the file, line and rule id and the script exits 1 on any hit.

| Rule | Check |
|---|---|
| G-1 | `package.json` `dependencies` is empty or absent |
| G-2 | No `.transaction(` in `src/core/relay/**` (the relay never opens a transaction, NFR-03) |
| G-3 | No `Date.now(` or `new Date(` in `src/core/**` or `src/adapters/**` except `src/core/uuid.ts` (`Date.now(` only) and `src/core/row.ts` (`new Date(` only) (NFR-05) |
| G-4 | No static `import` of `pg` or `postgres` anywhere in `src/` (dynamic `import(` allowed only in `src/cli.ts`) |
| G-5 | No `${` inside files in `src/core/sql/**` and `src/core/migrations/0*.ts` (SQL is never built by interpolation; tokens use `{{ }}`) |
| G-6 | No `console.` in `src/` except `src/core/emitter.ts` and `src/cli.ts` |
| G-7 | Every file in `src/publishers/**` imports only from `../core/errors.js`, `../core/json.js`, `../core/types.js` and `node:crypto` |
| G-8 | No `.only(` in `tests/**` |

### 16.7 Local databases (`compose.yml`)

```yaml
name: outbox
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: outbox_test
    command: ['postgres', '-c', 'max_connections=300']
    ports: ['54317:5432']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d outbox_test']
      interval: 2s
      timeout: 5s
      retries: 30
  postgres16:
    profiles: [matrix]
    image: postgres:16
    environment: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: outbox_test }
    command: ['postgres', '-c', 'max_connections=300']
    ports: ['54316:5432']
    healthcheck: { test: ['CMD-SHELL', 'pg_isready -U postgres'], interval: 2s, timeout: 5s, retries: 30 }
  postgres14:
    profiles: [matrix]
    image: postgres:14
    environment: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: outbox_test }
    command: ['postgres', '-c', 'max_connections=300']
    ports: ['54314:5432']
    healthcheck: { test: ['CMD-SHELL', 'pg_isready -U postgres'], interval: 2s, timeout: 5s, retries: 30 }
  redis:
    image: redis:7-alpine
    ports: ['63790:6379']
    healthcheck: { test: ['CMD', 'redis-cli', 'ping'], interval: 2s, timeout: 5s, retries: 30 }
```

No service mounts a volume. The local matrix follows OWNER-DECISIONS.md (PRD D-54): PostgreSQL 14, 16 and 17. Run the suite against another version with `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54314/outbox_test pnpm test:integration` (54316 for 16). Defaults: `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54317/outbox_test`, `REDIS_URL=redis://localhost:63790`; `pnpm chaos` and `pnpm bench` use `DATABASE_URL`, defaulting to the same Postgres.

---

## 17. Example app (`examples/orders`)

### 17.1 Layout

```
examples/orders/
├── package.json        # "name": "outbox-example-orders", "private": true, deps: "@firatkill/outbox": "workspace:*", "postgres"
├── tsconfig.json
├── Dockerfile          # build context: repository root
├── compose.yml
├── README.md           # how to run, what to look at (allowed: example docs)
├── sql/schema.sql      # orders, sent_emails
├── scripts/smoke.sh    # EX-01
└── src/
    ├── db.ts           # postgres.js client and the outbox instance (shared)
    ├── server.ts       # node:http API
    ├── relay.ts        # relay process
    ├── email.ts        # fake email "provider": inserts into sent_emails inside withInbox
    └── apply-schema.ts # runs sql/schema.sql (used by the compose migrate service)
```

### 17.2 Schema (`sql/schema.sql`)

```sql
create table if not exists orders (
  id               bigint generated always as identity primary key,
  email            text not null check (email ~ '^[^@\s]+@[^@\s]+$'),
  total_cents      bigint not null check (total_cents >= 0),
  idempotency_key  text unique,
  created_at       timestamptz not null default now()
);

create table if not exists sent_emails (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references orders (id),
  to_email    text not null,
  subject     text not null,
  message_id  uuid not null,
  sent_at     timestamptz not null default now()
);
```

### 17.3 API (`src/server.ts`, plain `node:http`, port `PORT` default 3000)

| Route | Behaviour |
|---|---|
| `POST /orders` | Body `{ "email": string, "items": [{ "sku": string, "qty": int ≥ 1, "priceCents": int ≥ 0 }] }` (1..50 items), optional header `Idempotency-Key` (1..100 chars). In one `sql.begin`: if the key exists, return `200` with the existing order; else insert the order and `outbox.enqueue(tx, { topic: 'order.created', key: 'order-<id>', dedupeKey: 'order.created:<id>', payload: { orderId, email, totalCents } })`; return `201 { id, totalCents }`. Invalid body → `400 { error }`. Body over 64 KiB → `413`. |
| `GET /orders/:id` | `200 { id, email, totalCents, createdAt, emailSent }` (`emailSent` = a `sent_emails` row exists) or `404` |
| `GET /emails` | `200 [{ orderId, toEmail, subject, messageId, sentAt }]`, newest first, max 100 |
| `GET /stats` | `200 outbox.stats({ includeTerminal: true })` |
| `GET /healthz` | `200 { ok: true }` after `select 1` |

### 17.4 Relay (`src/relay.ts`)

```ts
const relay = outbox.createRelay({
  handlers: {
    'order.created': async (msg, { signal }) => {
      if (Math.random() < Number(process.env.EMAIL_FAIL_RATE ?? 0)) throw new Error('simulated email provider outage');
      const result = await sql.begin((tx) =>
        outbox.withInbox(tx, 'email-sender', msg.id, (tx) => sendFakeEmail(tx, msg.payload, msg.id, signal)),
      );
      console.log(result.status === 'processed' ? `[email] sent order=${msg.payload.orderId}` : `[email] duplicate ${msg.id} ignored`);
    },
  },
  concurrency: 10,
  batchSize: 10,
  ordering: 'key',
});
relay.on('failed', (e) => console.warn(`[relay] attempt ${e.message.attempts} failed, retry in ${e.retryInMs} ms: ${String(e.error)}`));
relay.on('dead', (e) => console.error(`[relay] dead ${e.message.id}`));
await relay.start();
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.once(sig, async () => { await relay.stop(); await sql.end(); process.exit(0); });
```

`sendFakeEmail` inserts a `sent_emails` row through `tx` (no network). The README explains that a real provider call sits outside the transaction and should pass `msg.id` as the provider's idempotency key.

### 17.5 compose.yml and Dockerfile

```yaml
name: outbox-example
services:
  db:
    image: postgres:17
    environment: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: orders }
    healthcheck: { test: ['CMD-SHELL', 'pg_isready -U postgres -d orders'], interval: 2s, timeout: 5s, retries: 30 }
  migrate:
    build: { context: ../.., dockerfile: examples/orders/Dockerfile }
    environment: { DATABASE_URL: postgres://postgres:postgres@db:5432/orders }
    command: ['sh', '-c', 'node /repo/dist/cli.js migrate && node dist/apply-schema.js']
    depends_on: { db: { condition: service_healthy } }
  api:
    build: { context: ../.., dockerfile: examples/orders/Dockerfile }
    environment: { DATABASE_URL: postgres://postgres:postgres@db:5432/orders, PORT: '3000' }
    command: ['node', 'dist/server.js']
    ports: ['3000:3000']
    depends_on: { migrate: { condition: service_completed_successfully } }
    healthcheck: { test: ['CMD', 'wget', '-qO-', 'http://localhost:3000/healthz'], interval: 2s, timeout: 5s, retries: 30 }
  relay:
    build: { context: ../.., dockerfile: examples/orders/Dockerfile }
    environment: { DATABASE_URL: postgres://postgres:postgres@db:5432/orders, EMAIL_FAIL_RATE: '0' }
    command: ['node', 'dist/relay.js']
    depends_on: { migrate: { condition: service_completed_successfully } }
```

`dist/apply-schema.js` (compiled from `src/apply-schema.ts`) runs `sql/schema.sql` with postgres.js `unsafe`.

```dockerfile
FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build && pnpm --filter outbox-example-orders build
WORKDIR /repo/examples/orders
```

The repository-root `.dockerignore` (§4) keeps host `node_modules` and build output out of the build context, so `pnpm install` inside the image is clean. The API and the relay are separate services from the same image to show that they are independent processes: `docker compose up --scale relay=3` runs three relays.

### 17.6 EX-01 smoke test (`scripts/smoke.sh`)

1. `POST /orders` with `Idempotency-Key: smoke-1` → 201, capture `id`.
2. Poll `GET /orders/:id` every 200 ms until `emailSent: true`, at most 10 s.
3. `POST /orders` again with the same key → 200 and the same `id`.
4. `GET /emails` contains exactly one row for that order.
5. `docker compose -f examples/orders/compose.yml stop relay`; create a second order; check `emailSent: false` after 2 s; `docker compose -f examples/orders/compose.yml start relay`; poll until `emailSent: true` within 15 s (proves the message waited in the outbox).
6. `GET /stats` shows `ready: 0`, `dead: 0`.

The script uses `curl` and `jq` (installed in `ubuntu-24.04` runners) and exits non-zero on the first failure with the response printed.

---

## 18. Docs site (VitePress)

### 18.1 Configuration (`site/.vitepress/config.ts`)

```ts
import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import typedocSidebar from '../api/typedoc-sidebar.json' with { type: 'json' };

export default withMermaid(
  defineConfig({
    title: 'outbox',
    description: 'Transactional outbox, relay and inbox for PostgreSQL',
    lang: 'en-US',
    base: '/',
    cleanUrls: true,
    lastUpdated: true,
    ignoreDeadLinks: false,
    head: [['meta', { name: 'theme-color', content: '#1f2937' }]],
    themeConfig: {
      nav: [
        { text: 'Guide', link: '/guide/why' },
        { text: 'Guarantees', link: '/guide/guarantees' },
        { text: 'API', link: '/api/' },
        { text: 'npm', link: 'https://www.npmjs.com/package/@firatkill/outbox' },
      ],
      sidebar: {
        '/guide/': [
          { text: 'Introduction', items: [
            { text: 'Why an outbox', link: '/guide/why' },
            { text: 'Quick start: postgres.js', link: '/guide/quick-start-postgres-js' },
            { text: 'Quick start: pg', link: '/guide/quick-start-pg' },
            { text: 'Migrations', link: '/guide/migrations' },
          ] },
          { text: 'Concepts', items: [
            { text: 'Lifecycle and statuses', link: '/guide/concepts' },
            { text: 'Guarantees and failure modes', link: '/guide/guarantees' },
            { text: 'Ordering', link: '/guide/ordering' },
            { text: 'Retries and dead letters', link: '/guide/retries' },
            { text: 'Consumers and the inbox', link: '/guide/inbox' },
          ] },
          { text: 'Delivery', items: [
            { text: 'BullMQ and webhooks', link: '/guide/publishers' },
          ] },
          { text: 'Running it', items: [
            { text: 'Operations', link: '/guide/operations' },
            { text: 'Testing your handlers', link: '/guide/testing' },
            { text: 'FAQ', link: '/guide/faq' },
            { text: 'Comparison', link: '/guide/comparison' },
          ] },
        ],
        '/api/': typedocSidebar,
      },
      search: { provider: 'local' },
      socialLinks: [{ icon: 'github', link: 'https://github.com/firatkill/outbox' }],
      editLink: { pattern: 'https://github.com/firatkill/outbox/edit/main/site/:path' },
      footer: { message: 'MIT License', copyright: 'Copyright 2026 Fırat Kıl' },
      outline: [2, 3],
    },
  }),
);
```

### 18.2 API reference (TypeDoc, `typedoc.json`)

```json
{
  "$schema": "https://typedoc-plugin-markdown.org/schema.json",
  "entryPoints": ["src/index.ts", "src/postgres-js.ts", "src/pg.ts", "src/bullmq.ts", "src/webhook.ts", "src/testing.ts"],
  "tsconfig": "tsconfig.build.json",
  "out": "site/api",
  "docsRoot": "./site",
  "plugin": ["typedoc-plugin-markdown", "typedoc-vitepress-theme"],
  "readme": "none",
  "excludePrivate": true,
  "excludeInternal": true,
  "treatWarningsAsErrors": true,
  "validation": { "notExported": true, "invalidLink": true, "notDocumented": true },
  "sort": ["kind", "instance-first", "alphabetical"]
}
```

`site/api/` is generated and gitignored. Every exported symbol needs TSDoc with a summary, `@param`/`@returns` where applicable, defaults as `@defaultValue`, and an `@example` for functions (NFR-41).

### 18.3 Page content requirements

Each page is plain technical prose with code. Samples longer than 3 lines come from `site/snippets/*.ts` via VitePress includes (`<<< @/snippets/<file>.ts`), so they are type-checked (§18.4).

| Page (`site/guide/`) | Must contain |
|---|---|
| `index.md` (site root) | One-paragraph problem statement, install command, quick start of at most 15 non-blank lines (same as README), links to Guarantees and Quick start. No hero images, no feature grid |
| `why.md` | The dual-write problem with a timeline diagram (Mermaid sequence: write, crash, lost event; publish, rollback, ghost event); why "publish inside the transaction" and "publish after commit with retries" both fail; the outbox; why delivery is then at-least-once; the inbox. ≤ 900 words |
| `quick-start-postgres-js.md` / `quick-start-pg.md` | Install; migrate (CLI and `migrationSql`); create the outbox; enqueue in a transaction; start a relay with a handler; graceful shutdown; what to look at in the table; the root-handle warning (GU-01); for pg: pool sizing (`max ≥ 2` per relay) |
| `migrations.md` | CLI reference; `migrationSql`; Knex, Prisma and Drizzle examples (§8.3); upgrade procedure; custom schema and prefix; required privileges |
| `concepts.md` | State diagram (§2.2) and sequence diagram (§2.3); table of statuses (PRD §9); message fields; leases; attempts counting; relay internals (claim sizing, group-commit flush); the manual INSERT for producers that cannot use `enqueue` (`insert into outbox_messages (id, topic, payload) values (gen_random_uuid(), $1, $2)`, plus `select pg_notify(...)`) with its caveats (no validation, UUIDv4 ids) |
| `guarantees.md` | GU-01..GU-09 verbatim (§12.1); "not guaranteed" list; crash-point table verbatim (§12.2); clock assumptions (§11.5); how each guarantee is tested (§12.3) with links to the test files on GitHub |
| `ordering.md` | When to use it; the claim SQL (§9.4) with the correctness argument; the commit-order caveat with a concrete two-transaction timeline; head-of-line blocking and a runbook (`listDead`, `skip`, `retryDead`); throughput math; "all relays must use the same mode" |
| `retries.md` | Backoff formula and the default table (§9.3.3); full jitter rationale; `RetryableError`/`NonRetryableError`; timeouts and abort signals; dead letters; `retryDead`, `skip`, `purge`; choosing `maxAttempts` |
| `inbox.md` | Why consumers must be idempotent; `withInbox` semantics table (§9.8); the one misuse that breaks it; effects outside the database (idempotency keys, second outbox); retention rule; using it with BullMQ jobs and webhooks; `createInbox` for a separate consumer database |
| `publishers.md` | BullMQ publisher; the "retries on the worker" mistake with wrong/right code; two retry layers; job retention vs dedupe window; webhook publisher, payload, headers, signature, outcome table (§13.2); `verifyWebhook` receiver example; custom publisher rules and the SQS sketch |
| `operations.md` | Monitoring (`stats`, events table §14.1, SQL queries §14.3, alerts); purging (cron example with `setInterval` and with `pg_cron` SQL using the purge statement); scaling relays (how many, pool sizing, `concurrency` vs `batchSize`); poolers table (§6.5); `notify` trade-off (§10.2); vacuum and bloat; least-privilege roles (§20); upgrading; disaster scenarios (relay down for hours, database restore) |
| `testing.md` | Test clock (`testClock(outbox)`), `runOnce()` for deterministic handler tests, example Vitest test for a retry path, "never import the testing entry in production" |
| `faq.md` | At least: Why did my handler run twice? Can I get exactly-once delivery? Does it work with PgBouncer / Supabase / Neon? Can I use it with Drizzle, Knex or Prisma transactions? (Drizzle and Knex on postgres.js or pg expose the underlying driver transaction, so pass that; Prisma interactive transactions do not expose a postgres.js or pg handle, so either do the business write and `enqueue` on a pg/postgres.js transaction, or insert the outbox row with `tx.$executeRaw` using the documented manual INSERT from the Concepts page; state the limitation plainly and verify Prisma's current driver-adapter options on the implementation date, A-16) What happens if the relay is down for a day? How big can payloads be? Why UUIDv7? Why are attempts counted at claim? How do I delete everything? Serializable isolation? |
| `comparison.md` | Table and short sections (fair, ≤ 700 words): Debezium / CDC (WAL-based, no polling, needs Kafka Connect and replication-slot operations; Debezium's outbox event router also reads an outbox table); pg-boss and graphile-worker (full Postgres job queues; both can enqueue inside your transaction; graphile-worker named queues give serial execution; choose them if you want a job queue in Postgres); BullMQ alone (not transactional with your database); hand-rolled outbox (common mistakes). States plainly that this library is the outbox plus relay plus inbox, not a general job queue, and that feeding pg-boss, graphile-worker or BullMQ from it is a valid design. Feature claims about other projects are checked against their current docs on the implementation date (A-16) |

### 18.4 Sample checking (`scripts/docs-check.ts`, `pnpm docs:check`)

1. Fail if any ```` ```ts ```` fence in `site/**/*.md` has more than 3 lines (long samples must be snippets).
2. Type-check `site/snippets/**/*.ts` with `tsc -p site/snippets/tsconfig.json --noEmit`. That tsconfig extends the root one, sets `"include": ["./**/*.ts"]`, and maps both the bare name and the subpaths to sources: `"paths": { "@firatkill/outbox": ["../../src/index.ts"], "@firatkill/outbox/*": ["../../src/*.ts"] }`, so it works before `pnpm build`. Snippets may import `postgres`, `pg` and `bullmq` (dev dependencies). `src/env.d.ts` is reachable through the imported sources, so `__OUTBOX_VERSION__` type-checks.
3. Fail if a snippet file is not referenced by any page (dead samples).
4. Fail if `guarantees.md` does not contain the exact GU and crash-table text from TRD §12 (the script extracts both blocks from `docs/TRD.md` and compares after whitespace normalisation).
5. Fail if the TypeScript quick start fenced in `README.md` differs from `site/snippets/readme-quick-start.ts` (byte comparison after normalising line endings), so the README copy is type-checked too.

### 18.5 Deploy

Vercel deploys the site from `main` and builds a preview for each pull request (§16.5); CI runs `docs:check` and `docs:build` first. The site URL is https://outbox.firatkil.com/ and VitePress `base` is `/`, so page links have no path prefix (the API reference is at `/api/`).

### 18.6 README outline (normative)

```markdown
# @firatkill/outbox

[CI badge] [npm version badge] [license badge] [docs badge]

<one paragraph: the dual-write problem, the outbox, the relay, the inbox; "PostgreSQL 14+, Node 22+ (Node 20 best-effort), postgres.js or pg, zero dependencies">

## Quick start
npm i @firatkill/outbox postgres
npx outbox migrate --url "$DATABASE_URL"
<TypeScript sample below, at most 15 non-blank lines>

## Guarantees
<table: GU-01..GU-09 one line each, "Holds when" column; link to the full page>

## Documentation
https://outbox.firatkil.com (quick start for pg, ordering, retries, inbox, BullMQ, webhooks, operations, API)

## Benchmark
<!-- bench:start --> ... generated ... <!-- bench:end -->

## How it is tested
<5 bullets: integration tests on Node 22/24 × PostgreSQL 14/16/17/18 (plus Node 20 best-effort); both drivers; test clock instead of sleeps;
 chaos test killing relay processes with SIGKILL for 30 s then checking 9 SQL invariants; benchmark on every month>

## Compared with other tools
<two sentences + link to comparison page>

## License
MIT © Fırat Kıl
```

The quick start sample (exactly as below: 16 lines, 13 of them non-blank, so "15-line quick start" in PRD G-1/FR-111 means at most 15 non-blank lines; type-checked as `site/snippets/readme-quick-start.ts`):

```ts
import postgres from 'postgres';
import { createOutbox } from '@firatkill/outbox/postgres-js';

const sql = postgres(process.env.DATABASE_URL!);
const outbox = createOutbox({ db: sql });

await sql.begin(async (tx) => {
  const [order] = await tx`insert into orders (email) values (${'ada@example.com'}) returning id`;
  await outbox.enqueue(tx, { topic: 'order.created', key: `order-${order!.id}`, payload: { orderId: order!.id } });
});

const relay = outbox.createRelay({
  handlers: { 'order.created': async (msg) => console.log('deliver', msg.payload) },
});
await relay.start();
process.once('SIGTERM', () => void relay.stop().then(() => sql.end()));
```

Badges: `https://github.com/firatkill/outbox/actions/workflows/ci.yml/badge.svg`, `https://img.shields.io/npm/v/@firatkill/outbox`, `https://img.shields.io/npm/l/@firatkill/outbox`, docs link badge. No other badges.

---

## 19. Release process and versioning

### 19.1 Changesets

`.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config/schema.json",
  "changelog": ["@changesets/changelog-github", { "repo": "firatkill/outbox" }],
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["outbox-example-orders"]
}
```

Every PR that changes anything a user can observe (exports, types, options, defaults, events, error codes, SQL behaviour, schema, CLI, published files) includes a changeset (`pnpm changeset`). PRs that only touch tests, docs site, CI or examples do not. The `static` job fails a PR that changes `src/**` without adding a file in `.changeset/` unless the PR has the label `no-changeset` (implemented in `check-guards.ts` using `git diff --name-only origin/main...HEAD` when `GITHUB_BASE_REF` is set, which needs the full history from `fetch-depth: 0`; the label is read from the comma-separated `PR_LABELS` environment variable set by `ci.yml`, §16.1). Locally, without `GITHUB_BASE_REF`, the rule is skipped.

### 19.2 Release steps

1. Merge feature PRs with changesets into `main`.
2. `version.yml` opens or updates the "chore: version packages" PR (bumps `package.json`, writes `CHANGELOG.md`).
3. Owner reviews and merges it; CI on `main` must be green.
4. Owner creates a GitHub release with tag `v<version>` on that merge commit, release notes copied from `CHANGELOG.md`.
5. `publish.yml` checks the tag, builds, runs package checks and publishes with provenance (`npm publish --provenance --access public`).
6. Vercel has already deployed the site from the release commit on `main` (§16.5); check that https://outbox.firatkil.com shows the new version's changes.
7. Verify: `npm view @firatkill/outbox@<version> dist.attestations` shows a provenance attestation, and the npm page shows the "Provenance" badge linking to the workflow run.

### 19.3 Versioning policy

Semantic versioning. While the major version is 0, a minor bump may contain breaking changes and a patch bump never does. From 1.0.0, breaking changes require a major bump.

| Change | Breaking? |
|---|---|
| Removing or renaming an export, option, method, event, event field or error code | Yes |
| Changing a type so that previously valid code no longer compiles | Yes |
| Changing a default that affects guarantees or timing: `maxAttempts`, `retry.*`, `leaseMs`, `handlerTimeoutMs`, `ordering`, `notify`, `listen`, `maxPayloadBytes` | Yes |
| Changing a throughput default: `batchSize`, `concurrency`, `poll.*`, `reclaimIntervalMs`, `reclaimBatchSize`, `drainTimeoutMs` | No (changeset must call it out) |
| A migration that only adds objects, with `REQUIRED_SCHEMA_VERSION` bumped | No (minor; changeset has a "Migration required: run `npx outbox migrate`" line) |
| A migration that drops, renames or narrows anything | Yes (and only allowed in a major, FR-16) |
| Dropping a supported Node.js or PostgreSQL version (PRD D-41, D-42) | Yes |
| Moving a version from supported to best-effort, or dropping a best-effort version, after its upstream end of life | No (minor; changeset and PRD §14 row) |
| Changing SQL text without changing behaviour | No |
| Changing `last_error` text format or event `durationMs` measurement | No |
| Adding an export, option (with a non-breaking default), event or error code | No (minor) |
| Bug fix that makes behaviour match this document | No (patch), even if someone relied on the bug |

Deprecations: mark with `@deprecated` and a changeset at least one minor release before removal.

0.1.0 is the first published version: the initial changeset is `minor` from `0.0.0`.

---

## 20. Security considerations

- SQL injection: all values are parameters; identifiers are validated and quoted (NFR-04); guard G-5 forbids interpolation in SQL files.
- Least-privilege roles (docs "Operations"):

```sql
-- producer: application role that enqueues
grant usage on schema public to app_producer;
grant insert on public.outbox_messages to app_producer;
grant select on public.outbox_messages to app_producer;          -- needed for ON CONFLICT and the dedupe lookup (E2)
grant execute on function public.outbox_now() to app_producer;
-- relay
grant usage on schema public to app_relay;
grant select, update, delete on public.outbox_messages to app_relay;  -- delete only if the relay runs purge
grant select on public.outbox_schema_migrations to app_relay;
grant execute on function public.outbox_now() to app_relay;
-- consumer
grant usage on schema public to app_consumer;
grant select, insert, delete on public.outbox_inbox to app_consumer;  -- delete for purgeInbox
grant execute on function public.outbox_now() to app_consumer;       -- processed_at default and purgeInbox cutoff
```

  Identity columns do not need a sequence grant for `INSERT` when the value is generated (A-19 verifies on PostgreSQL 14). Migrations run as the owner role.
- Payloads and `last_error` may contain personal data. They live in your database; `purge` controls retention. Handlers should not put secrets in error messages. The library never logs payloads.
- Webhook secrets never appear in logs, errors or events; signature comparison uses `timingSafeEqual`; redirects are not followed (PRD D-28); only `http:` and `https:` URLs are accepted. The library does not block private IP ranges (SSRF): if webhook URLs come from untrusted users, validate them before enqueueing; docs say so.
- CLI redacts passwords in printed URLs (UT-12).
- Supply chain: zero runtime dependencies; no `install`/`postinstall` scripts; `files` whitelist (NFR-23); npm provenance; 2FA on the npm account; GitHub environment protection for publishing.
- Test clock: the testing entry is the only code that changes `outbox_now()`; its TSDoc and the docs mark it test-only.

## 21. Performance notes and trade-offs

- One claim is one statement and one round trip for up to `batchSize` messages; one flush is at most two statements for any number of outcomes. At steady state a relay issues roughly `2 × throughput / batchSize` statements per second plus completions batched by the flusher.
- Batch size trades latency for throughput: larger batches amortise round trips but hold more leases per relay and make one slow handler delay more claimable work only if slots are full. The benchmark (BENCH-01) shows the curve on a CI runner.
- Scaling relays: `SKIP LOCKED` makes concurrent claims cheap; throughput scales with relays until the database CPU or the handlers' downstream limit is reached. More relays than `ready / batchSize` only add empty claims.
- Pool sizing: per relay, one connection for LISTEN (if enabled) plus one or two for claims and flushes; handlers that use the same pool need their own share (`concurrency` connections in the worst case). The docs give `max = 2 + concurrency` as a safe starting point when handlers use the database, otherwise `max = 4`.
- Idle cost: with defaults, an idle relay runs one cheap claim every 2 s (an index probe on an empty partial index) and one reclaim every 10 s.
- Ordering mode costs one index probe per candidate and limits per-key concurrency to one; its worst case is a large backlog blocked behind a few heads (§9.4).
- Table churn: every message is inserted once and updated at least twice; partial indexes, early autovacuum (§7.3) and regular `purge` keep it healthy. A table that is never purged keeps working (claims use partial indexes) but grows without bound.
- NOTIFY commit serialisation is a ceiling only at very high enqueue rates (§10.2).

---

## 22. Assumptions to verify at build time

Each assumption has an owner task. If verification fails, apply the stated fallback and log it in PRD §14.

| ID | Assumption | How to verify | Fallback | Task |
|---|---|---|---|---|
| A-01 | The npm scope `@firatkill` belongs to the owner's npm account and `@firatkill/outbox` is free (GitHub user is `firatkill`) | `npm whoami` (logged in as owner) prints `firatkill`; `npm view @firatkill/outbox` returns 404; `npm access list packages @firatkill` works | Use `@firatkill/outbox` (or an org scope the owner creates); global rename in one commit; PRD §14 row | T-01 |
| A-02 | npm trusted publishing (OIDC from GitHub Actions) requires npm CLI ≥ 11.5.1 and can be configured only for a package that already exists, so the first publish uses a short-lived granular token (§16.4, PRD D-44); provenance is generated for public packages from public repositories when `id-token: write` is granted and `repository.url` matches | npm docs "Trusted publishers" and "Generating provenance statements" on the implementation date; after 0.1.0, configure npmjs.com → package → Settings → Trusted publisher (GitHub Actions, `firatkill/outbox`, `publish.yml`, environment `npm`) | If npm allows configuring a trusted publisher before the first publish, skip the token. If trusted publishing is unavailable, keep a granular token in `NPM_TOKEN` (rotated before expiry) and keep `--provenance` | T-38, T-39 |
| A-03 | postgres.js 3.4+: `unsafe(text, params)` sends string parameters that cast with `$n::jsonb`; `unsafe(text, [])` (empty params) uses the simple query protocol and runs multiple statements (if not, call `.simple()` on the returned query); `listen(channel, fn, onlisten)` quotes the channel, reconnects, and calls `onlisten` after each reconnect; returned rows are array-like | INT-10/12/50/52 with postgres.js; read `postgres` README sections "unsafe" and "listen" | Quote the channel ourselves; wrap multi-statement migrations in a loop over statements split by a `-- statement` marker; implement reconnect detection with a periodic `select 1` on the listen connection | T-08, T-24 |
| A-04 | node-postgres 8.11+: parameter-free `client.query(text)` runs multiple statements; `notification` and `error` events behave as described; type parsers do not alter `::text` / `float8` / `int4` results | INT-01, INT-52, INT-82 with pg | Split migrations as in A-03; set per-query `types` to identity parsers | T-09, T-24 |
| A-05 | `insert ... select ... order by ord` assigns identity values in `ord` order | INT-12 on PostgreSQL 14, 16, 17, 18 | Assign `seq` explicitly: `nextval(pg_get_serial_sequence(...))` in the ordered subquery, or insert row by row inside E1 with `unnest ... with ordinality` and a lateral `nextval` | T-10 |
| A-06 | BullMQ 5: custom `jobId` must not be an integer string and must not contain `:`; `add` with an existing job id returns the existing job without error while it is retained; `attempts` and `backoff` are job options and `Worker` has no `attempts` option | BullMQ docs "Job Ids" and "Retrying failing jobs"; INT-85 | Adjust the id prefix format (still deterministic from the message id); update docs | T-28 |
| A-07 | tsup 8 is maintained enough to use, and `splitting: true` works for CJS output | `pnpm view tsup time` (last release date); run `pnpm build && pnpm check:package`; `require('@firatkill/outbox/pg')` in a CJS smoke script | `splitting: false` for CJS; if tsup is unmaintained or broken, switch to tsdown with the same entry map and output names (PRD §14 row) | T-01, T-33 |
| A-08 | `@size-limit/preset-small-lib` measures min + brotli and honours `ignore` for `node:*` built-ins | `pnpm size` output lists the six entries with sizes | Use `@size-limit/esbuild` with `"platform": "node"` via a `modifyEsbuildConfig` hook | T-33 |
| A-09 | VitePress 1.x is the current stable line (or 2.x is stable); `vitepress-plugin-mermaid` supports it; `typedoc-vitepress-theme` and `typedoc-plugin-markdown` match the installed TypeDoc major | `pnpm view vitepress dist-tags`; plugin READMEs; `pnpm docs:build` | Render Mermaid with a small custom markdown-it plugin that emits `<pre class="mermaid">` and loads `mermaid` on the client; generate TypeDoc markdown without the VitePress theme and write the sidebar by hand | T-34 |
| A-10 | Action majors: `actions/checkout@v5`, `actions/setup-node@v5`, `pnpm/action-setup@v4`, `actions/upload-artifact@v4`, `changesets/action@v1` | Each action's releases page on the implementation date | Use the current major of each; keep inputs the same | T-03, T-32, T-34, T-38 |
| A-11 | GitHub-hosted `ubuntu-24.04` runners for public repositories have 4 vCPUs and 16 GB RAM; `GITHUB_TOKEN` can open PRs once the repository setting is enabled | GitHub docs "GitHub-hosted runners" (reference table); run `bench.yml` once | Record the actual spec from the JSON; push results to a branch and open the PR manually | T-31 |
| A-12 | Node 20 is past end of life (since April 2026) but `actions/setup-node` still installs it; `postgres:14` images stay available after PostgreSQL 14's end of life (November 2026); `postgres:18` is a released stable image; whether PostgreSQL 19 is released on the implementation date | Run the matrix; `docker pull postgres:18`; postgresql.org versioning page | Node 20 or PostgreSQL 14 cell unavailable: keep the last green run as evidence, remove the best-effort cell and log it in PRD §14 (§19.3). PostgreSQL 19 released: it is a Could for the matrix after 0.1.0 (PRD D-42), not added before release | T-32 |
| A-13 | `postgres:14`, `postgres:16`, `postgres:17`, `postgres:18` service containers support `alter system` + `docker restart` to raise `max_connections` | CI step in §16.1 | Lower `maxWorkers` for integration to 2 and pool sizes in tests | T-32 |
| A-14 | Standard Webhooks signature scheme: signed content `id.timestamp.body`, HMAC-SHA256, header `v1,<base64>` (space-separated list for several signatures), secrets `whsec_<base64>` (24 to 64 bytes recommended), timestamps in integer seconds, 5-minute tolerance, and the spec publishes a worked example vector | https://www.standardwebhooks.com and its spec repository (`spec/standard-webhooks.md`); copy the example vector into UT-11 with its URL; cross-check our raw-secret vector against the reference library in a one-off script (not a dependency, not committed) | Keep HMAC-SHA256 over the same content and document the exact scheme as our own | T-29 |
| A-15 | The Vercel Hobby plan builds the pnpm workspace (install, TypeDoc through `docs:api`, VitePress with Mermaid) from `vercel.json` within the Hobby build limits (build time, memory, output size) and serves `site/.vitepress/dist` at `outbox.firatkil.com` | First production deployment: build log shows `pnpm docs:build` exit 0 and its duration; preview deployment appears on a test PR; `/` and `/api/` load on the custom domain; page footers show plausible "Last updated" dates (Vercel clones with limited history) | If the build exceeds a limit, build in the `ci.yml` `static` job and deploy the prebuilt output with `vercel deploy --prebuilt` from a workflow using a `VERCEL_TOKEN` secret, still on Hobby; if dates are wrong only, set `lastUpdated: false` | T-34 |
| A-16 | Feature statements about pg-boss, graphile-worker and Debezium on the comparison page are current | Read each project's docs on the implementation date | Remove any claim that cannot be verified | T-35 |
| A-17 | Vitest version supports `test.projects` (Vitest 3.2+); Changesets CLI 2 and `@changesets/changelog-github` current | `pnpm vitest --version`; config runs both projects | Use `vitest.workspace.ts` on older Vitest | T-01 |
| A-18 | `attw --pack . --profile node16` checks node16 CJS/ESM and bundler resolutions and ignores node10 | `pnpm check:package` output | Use `--ignore-rules no-resolution` for node10 only | T-33 |
| A-19 | `INSERT` into a table with a `generated always as identity` column works for a role without privileges on the identity sequence | INT test in T-10 with a role that has only `insert, select` on the table | Add `grant usage on sequence` to the docs role SQL | T-10 |
| A-20 | PostgreSQL re-checks the WHERE clause of a row that was updated by a concurrent committed transaction before locking it with `FOR UPDATE SKIP LOCKED` in Read Committed (so a row claimed by another relay is skipped) | INT-22 and INT-41 (zero duplicates without crashes); PostgreSQL docs "Concurrency control: Read Committed" | None needed: the claim UPDATE already repeats `m.status = 'pending'` as defence in depth (§9.2); if INT-22 ever shows a duplicate without a crash, stop and investigate before release | T-13 |
