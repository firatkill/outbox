# Outbox: Implementation Plan

Ordered tasks for building `@firatkill/outbox` end to end. Each task is sized for one focused agent session (roughly 1–4 hours) and ends in a state where every listed acceptance command passes. Do tasks in order unless the dependency line allows otherwise.

References: [PRD.md](./PRD.md) (FR, NFR, GU, decisions), [TRD.md](./TRD.md) (section numbers below as "TRD §x"), [../AGENTS.md](../AGENTS.md) (rules).

Conventions for every task:

- Work on a branch `t-NN-short-name`; open a PR titled `T-NN: <goal>`; CI must be green before merge. During M0 bootstrap, T-01/T-02 remain stacked drafts until T-03 validates the combined tree (PRD D-58).
- "Acceptance" commands must pass locally (with `pnpm db:up` running) and in CI. A task is not done until the tests it names exist and pass (AGENTS.md "Definition of done").
- Every behaviour change adds or updates an integration test in the same PR. Every change to the public API or observable behaviour adds a changeset (from T-03 on).
- If an assumption from TRD §22 fails, apply its fallback in that task and add a row to PRD §14.
- Run only the tests you touched while iterating (`pnpm vitest run tests/integration/enqueue.test.ts -t "INT-13"`), then the full `pnpm test` once before opening the PR.

## Overview

| Milestone | Tasks | Exit criteria |
|---|---|---|
| M0 Setup | T-01..T-03 | Tooling, compose Postgres, test harness, CI `static` job, Changesets |
| M1 Schema, enqueue, migrations | T-04..T-11 | DDL, runner, `migrationSql`, CLI migrate, both adapters, enqueue, test clock; INT-01..INT-18 (INT-15/INT-16 non-relay parts), INT-80, INT-82 (enqueue and migration reads), INT-90 |
| M2 Relay and leases | T-12..T-18 | Options, claim/complete/fail/reclaim, engine, timeouts, fencing, lifecycle; INT-20..INT-29, INT-70..INT-73, INT-81..INT-83, relay parts of INT-15/INT-16 |
| M3 Retries, dead letters, admin | T-19..T-21 | Backoff, dead, `retryDead`, `skip`, `purge`, `listDead`, `stats`, CLI stats; INT-30..INT-39, INT-91 |
| M4 Ordering and LISTEN | T-22..T-25 | Ordering claim and tests, NOTIFY, LISTEN, wake-up; INT-19, INT-40..INT-54 |
| M5 Inbox and publishers | T-26..T-29 | Inbox, events/tracer, BullMQ, webhook; INT-60..INT-65, INT-74, INT-75, INT-85..INT-87 |
| M6 Chaos, bench, CI matrix | T-30..T-33 | CHAOS-01/02, BENCH-01, full matrix, package gates |
| M7 Docs, example, release | T-34..T-39 | Site live, example + EX-01, README, publish workflow, 0.1.0 on npm |

---

## M0 Setup

### T-01 Repository and tooling

- Goal: an empty but complete TypeScript library project with strict tooling and passing lint, typecheck, unit test and build.
- Files: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.nvmrc`, `.gitignore`, `.prettierignore`, `.dockerignore` (contents in TRD §4), `LICENSE`, `README.md` (stub: title and "work in progress"), `tsconfig.json`, `tsconfig.build.json`, `tsdown.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `prettier.config.mjs`, `src/env.d.ts` (TRD §4.2), `src/index.ts` exporting `VERSION` (TRD §5.7) and the five other entry files exporting nothing yet but a placeholder `export {}`, `src/cli.ts` (prints `__OUTBOX_VERSION__` for `--version`), `tests/unit/smoke.test.ts` (asserts `VERSION` equals `package.json` `version`).
- Steps:
  1. Do not run `git init` if the repository already exists. Verify A-01 first: `npm whoami` and `npm view @firatkill/outbox` (expect 404). If the scope is not available, apply the fallback before writing `package.json`.
  2. `package.json` exactly as TRD §4.1 (name, exports, bin, files, peers, scripts). Resolve current versions of every dev dependency (TRD §3) and pin them exactly (`pnpm add -D -E ...`): `typescript`, `tsdown`, `vitest`, `@vitest/coverage-v8`, `eslint`, `typescript-eslint`, `prettier`, `tsx`, `@types/node`, `postgres`, `pg`, `@types/pg`, `publint`, `@arethetypeswrong/cli`, `size-limit`, `@size-limit/preset-small-lib`, `@changesets/cli`, `@changesets/changelog-github`. Apply the owner-approved A-07 fallback (D-56); verify A-17 and note the versions in the PR description.
  3. `tsconfig.json` and `tsconfig.build.json` as TRD §4.3; `tsdown.config.ts` as TRD §4.2; `vitest.config.ts` as TRD §15.4 (the integration project may have no files yet; use `--passWithNoTests` only on its script until T-02 (Vitest 4 accepts this option at run level, not in ProjectConfig)).
  4. ESLint flat config: `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`, `@typescript-eslint/no-explicit-any: error`, `@typescript-eslint/no-non-null-assertion: error` for `src/**`, `no-restricted-imports` per TRD §4.5, Prettier compatibility, and a global `ignores` entry for `dist/`, `coverage/`, `site/api/`, `site/.vitepress/dist/`, `site/.vitepress/cache/`, `bench/out/` and `examples/**/dist/` (flat config does not read `.gitignore`). Type-aware linting uses `parserOptions.projectService: true`; files outside `tsconfig.json` (`site/**`, `examples/**`, `*.mjs`) get `tseslint.configs.disableTypeChecked`. Prettier: `printWidth: 120`, `singleQuote: true`, `trailingComma: 'all'`; `.prettierignore` keeps it off `docs/` (the specs are not reformatted), `CHANGELOG.md`, the lockfile and generated output.
  5. `LICENSE`: MIT, "Copyright (c) 2026 Fırat Kıl".
- Acceptance: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build` exit 0; `node dist/cli.js --version` prints the same string as `node -p "require('./package.json').version"`; `ls dist` shows `index.js index.cjs index.d.ts index.d.cts` and the same four files for `postgres-js`, `pg`, `bullmq`, `webhook`, `testing`, plus `cli.js`; `node dist/cli.js --version` prints the version; `node -e "require('./dist/pg.cjs')"` and `node --input-type=module -e "await import('./dist/pg.js')"` exit 0.
- Depends on: none. Covers: FR-01, FR-07 (skeleton), NFR-40.

### T-02 Local databases and test harness

- Goal: Postgres and Redis run locally; integration tests get an isolated schema per file and helpers for both adapters.
- Files: `compose.yml` (TRD §16.7), `tests/global-setup.ts`, `tests/helpers/db.ts`, `tests/helpers/wait.ts`, `tests/helpers/spy.ts` (stub until T-08), `tests/integration/harness.test.ts`.
- Steps:
  1. Write `compose.yml` exactly as TRD §16.7; scripts `db:up`, `db:up:all`, `db:down`, `db:psql` from TRD §4.1.
  2. `global-setup.ts` creates database `outbox_test` if missing (connect to `postgres` database with postgres.js), prints `server_version`.
  3. `createTestSchema()`, `waitFor`, `waitForEvent` (typed later), `deferred` per TRD §15.4.
  4. `harness.test.ts`: creates a schema, creates a table in it, asserts isolation from another schema, drops it.
- Acceptance: `pnpm db:up && pnpm test:integration` passes; `docker compose ps` shows `postgres` and `redis` healthy; `pnpm db:up:all` additionally starts `postgres14` and `postgres16` healthy, and integration passes with `TEST_DATABASE_URL` pointing to ports 54314 and 54316 (owner matrix, D-54); running `pnpm test:integration & pnpm test:integration; wait` (two runs in parallel) passes, proving schema isolation.
- Depends on: T-01. Covers: FR-92 (local part).

### T-03 CI static job, guards and Changesets

- Goal: every PR runs the static checks; the guard script and Changesets are in place.
- Files: `.github/workflows/ci.yml` (only the `static` job for now, as TRD §16.1 including the `pull_request` types, `PR_LABELS` env and `fetch-depth: 0`, minus the `docs:*`, `check:package`, `size` and tarball steps, which are added in T-33/T-34), `scripts/check-guards.ts` (rules G-1..G-8, TRD §16.6, plus the changeset rule from TRD §19.1), `.changeset/config.json` (TRD §19.1), `.changeset/README.md` (Changesets default).
- Steps:
  1. Implement each guard as a small function over `git ls-files` output; print `G-n file:line message`.
  2. Unit-test the guards against fixture strings in `tests/unit/guards.test.ts` (each rule has one passing and one failing fixture).
  3. Verify A-10 action majors and pin them.
- Acceptance: `pnpm check:guards` exits 0 on the repo; adding `import pg from 'pg'` to `src/core/x.ts` makes it exit 1 with `G-4`; `pnpm vitest run tests/unit/guards.test.ts` passes; CI `static` job green on the PR; on a test PR that changes a file in `src/` without a changeset the job fails with the changeset rule, and adding the `no-changeset` label re-runs it green.
- Depends on: T-01. Covers: NFR-03 and NFR-05 (enforcement), FR-96 (Changesets part).

---

## M1 Schema, enqueue, migrations

### T-04 Identifiers, config, errors and rendering

- Goal: the pure foundation: outbox config parsing, identifier validation, error classes, SQL template rendering.
- Files: `src/core/identifiers.ts`, `src/core/config.ts`, `src/core/errors.ts`, `src/core/types.ts`, `src/core/sql/render.ts`, `tests/unit/outbox-config.test.ts` (UT-03), `tests/unit/errors.test.ts` (UT-07), `tests/unit/render.test.ts` (UT-04, rendering part).
- Steps:
  1. `parseOutboxConfig` per TRD §5.1 (defaults, ranges, unknown keys rejected, all issues collected).
  2. `quoteIdent`, `validateIdentifier`, derived names and channel per TRD §7.1 and PRD D-32.
  3. Error classes, brand, codes and helpers exactly as TRD §5.9, including `formatLastError`.
  4. `render(template, names)` replacing `{{schema}}`, `{{messages}}`, `{{inbox}}`, `{{migrations}}`, `{{test_clock}}`, `{{now}}`, `{{p}}`; throw `OUTBOX_INTERNAL` if any `{{` remains.
- Acceptance: `pnpm test:unit -t "UT-03|UT-04|UT-07"` passes; `pnpm check:guards` passes.
- Depends on: T-01. Covers: FR-10 (naming), NFR-04, PRD D-29, D-32.

### T-05 Migration 0001 and runner

- Goal: `migrate()` creates the full schema of TRD §7 safely and idempotently.
- Files: `src/core/migrations/0001_initial.ts`, `src/core/migrations/index.ts`, `src/core/migrations/runner.ts`, `src/adapters/types.ts` (TRD §6.6), `tests/helpers/adapters.ts` (postgres.js only for now, pg added in T-09), `tests/integration/migrations.test.ts` (INT-01, INT-03, INT-04, INT-06 with a temporary direct `schemaVersion` check, INT-07).
- Steps:
  1. Copy the DDL from TRD §7.2/§7.3 into the template with tokens; LF line endings; no `${`.
  2. Checksum per TRD §8.1.
  3. Runner per TRD §8.2: advisory lock per transaction, bootstrap, checksum verification, one transaction per migration, dry run.
  4. `schemaVersion()` per TRD §9.10 (used by INT-06 now, by the relay in T-17).
  5. Temporary minimal postgres.js adapter inside the test helper until T-08 provides the real one (or do T-08 first; both orders are fine).
- Acceptance: `pnpm vitest run tests/integration/migrations.test.ts` passes INT-01, INT-03, INT-04, INT-06, INT-07; `psql` shows the six indexes with `\di outbox_*` in the test schema during a debug run.
- Depends on: T-02, T-04. Covers: FR-10..FR-13, FR-15, FR-16 (rules documented in code comments).

### T-06 migrationSql and CLI migrate

- Goal: users can print the SQL and run migrations from the command line.
- Files: `src/core/migrations/sql.ts`, `src/core/cli-args.ts`, `src/cli.ts`, `tests/unit/cli.test.ts` (UT-12), `tests/integration/migrations.test.ts` (add INT-02 later in T-09, INT-05 now), `tests/integration/cli.test.ts` (INT-90).
- Steps:
  1. `migrationSql()` output format exactly as TRD §8.3.
  2. CLI per TRD §8.4 with `node:util` `parseArgs`; dynamic driver import; exit codes; password redaction; `--print`, `--from`, `--status`, `--check`, `--dry-run`. `stats` subcommand may print "not implemented" and exit 2 until T-21.
  3. INT-90 runs `node dist/cli.js`, so the test runs `pnpm build` in `beforeAll` if `dist/cli.js` is older than `src/cli.ts`.
- Acceptance: `pnpm test:unit -t UT-12` and `pnpm build && pnpm vitest run tests/integration/cli.test.ts -t INT-90` pass; `node dist/cli.js migrate --print | head -3` shows the header lines of TRD §8.3; INT-05 passes.
- Depends on: T-05. Covers: FR-14, FR-86.

### T-07 Message validation, JSON and UUIDv7

- Goal: every enqueue input is validated before SQL; ids are UUIDv7.
- Files: `src/core/validate.ts`, `src/core/json.ts`, `src/core/uuid.ts`, `tests/unit/validate.test.ts` (UT-05), `tests/unit/uuid.test.ts` (UT-06).
- Steps:
  1. Rules exactly as the TRD §5.2 table; errors with `index`, `field`, `reason`.
  2. `encodeJson(value, maxBytes)` returning the string and byte length, throwing `OUTBOX_PAYLOAD_TOO_LARGE`.
  3. UUIDv7 with injectable clock and random source per PRD D-51: 12-bit counter in `rand_a` starting at a random value in 0..2047 on each new millisecond, incremented per id; on overflow the timestamp field advances by 1 ms; the emitted timestamp never goes below the previous one even if the clock moves back. Use `globalThis.crypto.getRandomValues` (allowed by G-3; it is not a clock).
  4. In-batch dedupe collapsing helper (used by T-10).
- Acceptance: `pnpm test:unit -t "UT-05|UT-06"` passes.
- Depends on: T-04. Covers: FR-21, FR-22 (ids), FR-25.

### T-08 postgres.js adapter and createOutboxCore skeleton

- Goal: `createOutbox` from `@firatkill/outbox/postgres-js` returns an `Outbox` with `migrate` and `schemaVersion` working.
- Files: `src/adapters/postgres-js.ts`, `src/postgres-js.ts`, `src/core/outbox.ts`, `src/core/row.ts`, `tests/helpers/adapters.ts`, `tests/helpers/spy.ts`, `tests/unit/render.test.ts` (row-mapping cases of UT-04).
- Steps:
  1. Adapter per TRD §6.2 with structural types only (guard G-4 and the "no driver types" rule).
  2. `createOutboxCore(adapter, config)` wiring: resolved config, rendered statements cached per instance, `migrate`, `schemaVersion`; other methods throw `OUTBOX_INTERNAL('not implemented')` until their tasks.
  3. `mapMessageRow` and type mapping per TRD §6.4.
  4. Verify A-03 (multi-statement `unsafe`, parameter casting); record the result in the PR.
- Acceptance: migration tests from T-05 now run through the real adapter and pass; `pnpm test:unit -t UT-04` passes; `pnpm build` then `grep -REn "from ['\"](pg|postgres|bullmq)['\"]|import\(['\"](pg|postgres|bullmq)['\"]\)" dist/*.d.ts dist/*.d.cts` prints nothing, proving the declarations need no driver types (uninstalling a driver is not used as the check, because `tests/helpers` legitimately import both drivers).
- Depends on: T-05. Covers: FR-02, FR-04 (postgres.js), FR-05 (`createOutboxCore`).

### T-09 pg adapter

- Goal: the same `Outbox` through node-postgres.
- Files: `src/adapters/pg.ts`, `src/pg.ts`, `tests/helpers/adapters.ts` (add pg), `tests/integration/adapters.test.ts` (INT-80, INT-82 skeleton), `tests/integration/migrations.test.ts` (INT-02).
- Steps:
  1. Adapter per TRD §6.3 (transaction with rollback and destroy-on-failed-rollback, structural types).
  2. Make every existing integration test `describe.each(ADAPTERS)` where TRD §15.3 says "both".
  3. Verify A-04.
- Acceptance: `pnpm test:integration` passes for both adapters; INT-02 and INT-80 pass; the T-08 `dist/*.d.ts` grep still prints nothing.
- Depends on: T-08. Covers: FR-03, FR-04 (pg).

### T-10 enqueue

- Goal: `outbox.enqueue(tx, message | messages)` per TRD §9.1, including dedupe.
- Files: `src/core/sql/enqueue.ts`, `src/core/outbox.ts`, `tests/integration/enqueue.test.ts` (INT-10..INT-14, INT-17, INT-18; INT-19 notify part may be written now and enabled in T-24).
- Steps:
  1. Statements E1 and E2 exactly as TRD §9.1; `$2` is the channel when `notify` is true (the notify branch is part of E1 from the start).
  2. Steps 1–5 of TRD §9.1; results in input order.
  3. Overloads and generics per TRD §5.3 (`MessageInput<Topics>`); add a type-level test file `tests/unit/types.test-d.ts` using `expectTypeOf` (Vitest) for topic/payload checking (FR-27).
  4. Verify A-05 (seq order) and A-19 (role with only `insert, select`) with INT-10b as specified in TRD §15.3 (the role name includes the test schema and adapter because roles are cluster-wide; drop it in `afterAll`).
- Acceptance: `pnpm vitest run tests/integration/enqueue.test.ts` passes INT-10, INT-10b, INT-11..INT-14, INT-17, INT-18 for both adapters; `pnpm typecheck` passes the type tests (the file contains at least one `// @ts-expect-error` line for a wrong payload type, so a regression in `MessageInput` fails the typecheck).
- Depends on: T-07, T-09. Covers: FR-20..FR-27, GU-01.

### T-11 Test clock and delays

- Goal: `@firatkill/outbox/testing` and delayed messages.
- Files: `src/testing.ts`, `src/core/testing/clock.ts`, `tests/integration/enqueue.test.ts` (INT-15, INT-16), `tests/integration/test-clock.test.ts` (install, set, advance, setLocal isolation between two connections, uninstall restores `select now()` body checked with `pg_get_functiondef`).
- Steps:
  1. SQL exactly as TRD §11.3; `install()` idempotent; offsets non-negative. `createOutboxCore` (and later `createInbox`) attach the internal symbol property of TRD §5.8 (PRD D-50) that `testClock()` reads.
  2. INT-15 uses claim statement C1 directly for the transaction-local case; the relay-based part of INT-15 and INT-16 is completed in T-14 (mark those `it.todo` until then and list them in the PR).
- Acceptance: `pnpm vitest run tests/integration/test-clock.test.ts` passes; INT-15's direct-claim part and INT-16's `available_at` assertion pass; `pnpm size` is not yet required.
- Depends on: T-10. Covers: FR-17, FR-18, FR-24, GU-07 (partial).

---

## M2 Relay and leases

### T-12 Relay options and backoff (pure)

- Goal: `parseRelayOptions` and `computeBackoffMs`, fully unit-tested.
- Files: `src/core/relay/options.ts`, `src/core/backoff.ts`, `tests/unit/relay-options.test.ts` (UT-02), `tests/unit/backoff.test.ts` (UT-01).
- Steps: implement TRD §5.4 (every default, range and cross-field rule) and TRD §9.3.3 verbatim.
- Acceptance: `pnpm test:unit -t "UT-01|UT-02"` passes; coverage of both files 100% lines (`pnpm vitest run --project unit --coverage --coverage.include=src/core/backoff.ts --coverage.include=src/core/relay/options.ts`).
- Depends on: T-04. Covers: FR-34, FR-35 (validation), FR-45.

### T-13 Claim, complete, fail and lease SQL

- Goal: all relay statements exist as rendered templates with typed wrappers.
- Files: `src/core/sql/claim.ts` (C1, C1T; C2/C2T added in T-22), `src/core/sql/outcome.ts`, `src/core/sql/lease.ts`, `tests/integration/sql.test.ts`.
- Steps:
  1. Copy SQL from TRD §9.2, §9.3.1, §9.3.2, §9.6.1, §9.6.2 exactly.
  2. Wrappers take typed inputs, build the JSON parameter, call the executor, map rows.
  3. `sql.test.ts`: claim returns rows with lease columns set and `attempts + 1`; complete with wrong relay id or attempt updates nothing; fail moves to `pending` with delay or `dead` when terminal or exhausted; reclaim and release behave as specified (use the test clock). These are statement-level tests; relay-level INT tests follow.
  4. INT-21 (skip locked) runs here at statement level.
- Acceptance: `pnpm vitest run tests/integration/sql.test.ts` passes for both adapters; INT-21 passes.
- Depends on: T-11, T-12. Covers: FR-31, FR-32, FR-33 (SQL), PRD D-13, D-17, D-31.

### T-14 Relay engine: scheduler, loop, deliverer, flusher

- Goal: a relay that claims, delivers to handlers and records outcomes with group-commit flushing.
- Files: `src/core/relay/scheduler.ts`, `src/core/relay/loop.ts`, `src/core/relay/deliver.ts`, `src/core/relay/flush.ts`, `src/core/relay/relay.ts`, `src/core/emitter.ts` (events only; console fallback in T-27), `tests/unit/scheduler.test.ts` (UT-08), `tests/unit/flush.test.ts` (UT-09), `tests/unit/deliver.test.ts` (UT-10), `tests/integration/relay.test.ts` (INT-20, INT-27, INT-28), completes INT-15/INT-16 relay parts.
- Steps:
  1. `decide` and `nextInterval` exactly as TRD §9.5.1.
  2. Loop per TRD §9.5.2 with error backoff; deliverer per §9.5.3 (no `transaction(` in `src/core/relay/**`, guard G-2); flusher per §9.5.4.
  3. Handlers mode topic list → C1T; publisher mode with or without `topics`.
  4. `runOnce()` per TRD §9.6.3 (the full lifecycle is T-17; `start()` may be minimal here: no LISTEN, no schema check yet).
- Acceptance: `pnpm test:unit -t "UT-08|UT-09|UT-10"` passes; `pnpm vitest run tests/integration/relay.test.ts` passes INT-20, INT-27, INT-28 for both adapters; INT-15 and INT-16 fully pass.
- Depends on: T-13. Covers: FR-30, FR-34, FR-39, FR-40, FR-65, NFR-03.

### T-15 Handler timeout and abort

- Goal: per-message timeouts with abort signals, failure classification and stored errors.
- Files: `src/core/relay/deliver.ts`, `tests/integration/relay.test.ts` (INT-26).
- Steps: abort reasons and classification exactly as TRD §5.9 and §9.5.3; orphaned promises get a `.catch`; slots freed on timeout.
- Acceptance: `pnpm vitest run tests/integration/relay.test.ts -t INT-26` passes for both adapters; UT-10 still passes.
- Depends on: T-14. Covers: FR-35, FR-47 (classification), FR-48.

### T-16 Reclaim, fencing and crash recovery

- Goal: expired leases are reclaimed; late outcomes are fenced.
- Files: `src/core/relay/reclaim.ts`, `src/core/relay/flush.ts` (leaseLost), `tests/helpers/relay-child.ts`, `tests/integration/leases.test.ts` (INT-23, INT-24, INT-25).
- Steps:
  1. Reclaim timer per TRD §9.6.1 (`unref`, loop while full, `reclaimed` event with `deadIds`).
  2. `leaseLost` events for ids missing from complete/fail results.
  3. `relay-child.ts` per TRD §15.4; INT-23 spawns it with `tsx`.
- Acceptance: `pnpm vitest run tests/integration/leases.test.ts` passes INT-23 (postgres.js), INT-24 and INT-25 (both adapters).
- Depends on: T-14. Covers: FR-32 (fencing), FR-33, GU-04, GU-09.

### T-17 Lifecycle: start, stop, drain, signal

- Goal: the full relay lifecycle of TRD §9.6.3.
- Files: `src/core/relay/relay.ts`, `tests/integration/lifecycle.test.ts` (INT-70..INT-73), `tests/integration/migrations.test.ts` (INT-06 via `relay.start()`).
- Steps: state machine `idle → starting → running → stopping → stopped`; schema check; initial reclaim; drain with timeout; abort with `OUTBOX_SHUTDOWN`; release statement; idempotent `stop`; `signal` option; single use.
- Acceptance: `pnpm vitest run tests/integration/lifecycle.test.ts -t "INT-70|INT-71|INT-72|INT-73"` and INT-06 pass for both adapters.
- Depends on: T-16. Covers: FR-15, FR-36, FR-37, PRD D-21, D-33.

### T-18 Concurrency and resilience

- Goal: prove many relays deliver everything exactly once without crashes and survive dropped connections.
- Files: `tests/integration/concurrency.test.ts` (INT-22, INT-29), `tests/integration/adapters.test.ts` (INT-81, INT-82 complete, INT-83).
- Steps: implement the tests exactly as TRD §15.3; set `application_name` on test pools so INT-29 can terminate only the relay's connections; INT-22 timeout comment.
- Acceptance: `pnpm vitest run tests/integration/concurrency.test.ts tests/integration/adapters.test.ts` passes for both adapters; INT-22 finishes in under 60 s locally.
- Depends on: T-17. Covers: FR-31, FR-38, GU-02, GU-04, NFR-01 (partial).

---

## M3 Retries, dead letters, admin

### T-19 Retries and dead transitions

- Goal: backoff applied, `RetryableError`/`NonRetryableError`, attempts exhaustion, reclaim to dead.
- Files: `src/core/relay/deliver.ts`, `src/core/relay/flush.ts`, `tests/integration/retries.test.ts` (INT-30..INT-34).
- Steps: delay selection per TRD §9.3.3; events per §9.3.2 (`failed`, `dead`).
- Acceptance: `pnpm vitest run tests/integration/retries.test.ts` passes INT-30..INT-34 for both adapters.
- Depends on: T-18. Covers: FR-45..FR-48, GU-03.

### T-20 Admin helpers

- Goal: `retryDead`, `skip`, `purge`, `listDead`, `purgeInbox` (SQL only; inbox behaviour in T-26).
- Files: `src/core/sql/admin.ts`, `src/core/admin.ts`, `tests/integration/admin.test.ts` (INT-35, INT-36, INT-38, INT-39).
- Steps: SQL exactly as TRD §9.7; batching loop for purge; id validation; error codes.
- Acceptance: `pnpm vitest run tests/integration/admin.test.ts` passes INT-35, INT-36, INT-38, INT-39 for both adapters.
- Depends on: T-19. Covers: FR-49..FR-52.

### T-21 stats and CLI stats

- Goal: `stats()` and `outbox stats`.
- Files: `src/core/sql/stats.ts`, `src/core/admin.ts`, `src/cli.ts`, `tests/integration/admin.test.ts` (INT-37), `tests/integration/cli.test.ts` (INT-91).
- Steps: S1/S2 per TRD §9.9 (S1 as scalar subqueries, PRD D-48); `42P01` mapping to `OUTBOX_NOT_MIGRATED`; CLI output per TRD §8.4.
- Acceptance: INT-37 (including both `EXPLAIN` assertions: claim uses the claim index, S1 has no `Seq Scan` on the messages table) and INT-91 pass; `node dist/cli.js stats --json --url "$TEST_DATABASE_URL"` prints valid JSON after a migrate.
- Depends on: T-20. Covers: FR-81, FR-87.

---

## M4 Ordering and LISTEN

### T-22 Ordering-mode claim

- Goal: `ordering: 'key'` with the claim of TRD §9.4.
- Files: `src/core/sql/claim.ts` (C2, C2T), `src/core/relay/relay.ts`, `tests/integration/ordering.test.ts` (INT-40, INT-42..INT-45).
- Steps: render C2/C2T; choose the claim variant at construction; keep the four variants in one table keyed by `(ordering, hasTopicFilter)`.
- Acceptance: `pnpm vitest run tests/integration/ordering.test.ts -t "INT-40|INT-42|INT-43|INT-44|INT-45"` passes for both adapters.
- Depends on: T-21. Covers: FR-55..FR-57.

### T-23 Ordering under concurrency

- Goal: prove per-key order with 4 relays.
- Files: `tests/integration/ordering.test.ts` (INT-41), `scripts/chaos/invariants.sql` (INV-08 query first version, reused by T-30).
- Steps: INT-41 exactly as TRD §15.3; run INV-08's query against the test schema as an extra assertion.
- Acceptance: INT-41 passes for both adapters in under 60 s locally, run three times in a row.
- Depends on: T-22. Covers: GU-06, NFR-02 (partial).

### T-24 NOTIFY and LISTEN in adapters

- Goal: enqueue notifies; both adapters can listen and reconnect.
- Files: `src/adapters/postgres-js.ts`, `src/adapters/pg.ts`, `tests/integration/enqueue.test.ts` (INT-19 enabled), `tests/integration/wakeup.test.ts` (INT-52, INT-54).
- Steps: adapter `listen` per TRD §6.2, §6.3, §10.3; verify A-03 and A-04 listen behaviour; `listen: { db }` override.
- Acceptance: INT-19, INT-52 and INT-54 pass for both adapters.
- Depends on: T-17. Covers: FR-26, FR-61, FR-63.

### T-25 Wake-up scheduling and latency

- Goal: relays wake on notifications, back off when idle, and still deliver without notifications.
- Files: `src/core/relay/loop.ts`, `src/core/relay/relay.ts`, `tests/integration/wakeup.test.ts` (INT-50, INT-51, INT-53).
- Steps: wire `onNotify`/`onReconnect` into `wakePending`; reset interval on wake; the LISTEN step of `start()`.
- Acceptance: INT-50 (p50 ≤ 50 ms, max ≤ 500 ms), INT-51 and INT-53 pass for both adapters, run three times in a row.
- Depends on: T-24. Covers: FR-60..FR-62, GU-08, NFR-11, NFR-12.

---

## M5 Inbox and publishers

### T-26 Inbox

- Goal: `withInbox`, `createInbox`, `purgeInbox`.
- Files: `src/core/sql/inbox.ts`, `src/core/inbox.ts`, adapter entries export `createInbox`, `tests/integration/inbox.test.ts` (INT-60..INT-65).
- Steps: I1 and purge SQL exactly as TRD §9.8; validation of consumer and message id; `createInbox` shares the migration runner.
- Acceptance: `pnpm vitest run tests/integration/inbox.test.ts` passes INT-60..INT-65 for both adapters.
- Depends on: T-21. Covers: FR-75..FR-78, GU-05.

### T-27 Events, tracer and console fallback

- Goal: complete observability per TRD §5.5 and §14.
- Files: `src/core/emitter.ts`, `src/core/relay/tracing.ts`, `src/core/relay/*.ts`, `tests/unit/emitter.test.ts` (UT-14), `tests/integration/lifecycle.test.ts` (INT-74, INT-75).
- Steps: listener isolation; tracer spans and attributes exactly as TRD §14.2; rate-limited `console.error` fallback.
- Acceptance: UT-14, INT-74 and INT-75 pass.
- Depends on: T-19. Covers: FR-80, FR-82..FR-84.

### T-28 BullMQ publisher

- Goal: `@firatkill/outbox/bullmq` per TRD §13.1.
- Files: `src/publishers/bullmq.ts`, `src/bullmq.ts`, `tests/unit/bullmq.test.ts` (UT-13), `tests/integration/bullmq.test.ts` (INT-85). Dev dependency `bullmq` (and `ioredis` if required) pinned exactly.
- Steps: structural types only (no `bullmq` import in `src/`, guard G-7); job id `outbox-<uuid>`; `attempts` required and validated; the wrong/right TSDoc example; verify A-06.
- Acceptance: UT-13 passes; with `pnpm db:up` (Redis on 63790) INT-85 passes; `grep -r "from 'bullmq'" src` returns nothing.
- Depends on: T-19. Covers: FR-66, FR-67.

### T-29 Webhook publisher and verifyWebhook

- Goal: `@firatkill/outbox/webhook` per TRD §13.2 and §13.3.
- Files: `src/publishers/webhook.ts`, `src/webhook.ts`, `tests/unit/webhook.test.ts` (UT-11), `tests/integration/webhook.test.ts` (INT-86, INT-87).
- Steps: signing and headers exactly as specified; outcome mapping table; error shape per TRD §5.9 "Webhook errors" (PRD D-45); Retry-After parsing; signal combination with `AbortSignal.any` (TRD §13.2); body consumed or cancelled; secret never in errors; verify A-14 and commit both test vectors (the Standard Webhooks spec example copied from the spec repository with its URL, and our raw-secret vector).
- Acceptance: UT-11, INT-86 and INT-87 pass.
- Depends on: T-19. Covers: FR-68..FR-70.

---

## M6 Chaos, bench, CI matrix

### T-30 Chaos script

- Goal: CHAOS-01 and CHAOS-02 per TRD §15.5.
- Files: `scripts/chaos/run.ts`, `scripts/chaos/relay-child.ts`, `scripts/chaos/invariants.sql`, `scripts/chaos/seeded.ts` (seeded PRNG and hash).
- Steps: setup tables; producer; killer with kill-record-first; drain; invariants INV-01..INV-09; JSON report; exit codes; `--seed` reproduces the run (same message set and kill schedule).
- Acceptance: `pnpm build && pnpm chaos --duration 30` and `pnpm chaos --duration 30 --ordering` exit 0 locally with `kills ≥ 5` and all violations 0; re-running with the printed `--seed` produces the same `produced` count and kill count; temporarily breaking fencing (remove `and m.attempts = x.attempt` from complete in a scratch branch) makes INV-03 or INV-06 report violations (record the output in the PR, do not commit the break).
- Depends on: T-26 (inbox), T-25. Covers: FR-93, NFR-02.

### T-31 Benchmark

- Goal: BENCH-01 per TRD §15.6 and the README table generator.
- Files: `scripts/bench/run.ts`, `scripts/bench/readme.ts`, `scripts/bench/schema.ts` (results JSON type with a runtime validator), `.github/workflows/bench.yml` (TRD §16.2), `bench/results/.gitkeep`.
- Steps: method exactly as specified; result validation before writing; `bench:readme` replaces only the marked block; verify A-11 by running `bench.yml` once via `workflow_dispatch` after merge.
- Acceptance: `pnpm bench --driver postgres-js --runs 1 --out bench/out` completes locally and writes a valid JSON file (do not commit local results); after merge, the workflow opens a PR with `bench/results/<date>-<sha>.json`, `latest.json` and the README table; merging it is a manual review. If NFR-10 targets are missed, add a PRD §14 row with the measured numbers.
- Depends on: T-25. Covers: FR-94, NFR-10.

### T-32 Full CI matrix

- Goal: `ci.yml` complete per TRD §16.1: integration matrix of 8 required cells (Node 22, 24 × PostgreSQL 14, 16, 17, 18) plus the best-effort Node 20 × PostgreSQL 17 cell, chaos job, example job (enabled in T-36), coverage thresholds.
- Files: `.github/workflows/ci.yml`.
- Steps: add `integration` with services and the `max_connections` step (verify A-13), `chaos`, and an `example` job guarded by `if: hashFiles('examples/orders/compose.yml') != ''` until T-36; enforce coverage in the Node 22 / PostgreSQL 17 cell; `continue-on-error` from `matrix.best_effort`; verify A-12 (Node 20, PostgreSQL 14 and 18 availability) and A-13.
- Acceptance: all 8 required integration cells and `chaos` are green on the PR; the Node 20 cell has run (its result is recorded in the PR description; a red Node 20 cell does not block, but its cause is noted); coverage ≥ thresholds in TRD §15.4; the PR description links the run; `actionlint` (as in T-38) reports no errors for `ci.yml`.
- Depends on: T-30, T-29. Covers: FR-92, FR-93 (CI), NFR-30, NFR-31, NFR-42.

### T-33 Package quality gates

- Goal: publint, attw, size-limit and tarball checks in CI.
- Files: `.size-limit.json` (TRD §4.4), `ci.yml` (`check:package`, `size`, tarball steps), `tests/smoke/cjs.cjs` and `tests/smoke/esm.mjs` (require/import every entry from `dist`).
- Steps: verify A-07 (CJS splitting), A-08, A-18; fix any `publint` warning; make sizes fit NFR-20 (if a limit cannot be met without harming clarity, record a PRD §14 row with the measured size; do not raise silently).
- Acceptance: `pnpm build && pnpm check:package && pnpm size && node tests/smoke/cjs.cjs && node tests/smoke/esm.mjs` exit 0; CI `static` green.
- Depends on: T-29. Covers: FR-95, NFR-20..NFR-23, NFR-33.

---

## M7 Docs, example, release

### T-34 Docs site skeleton, TypeDoc and deploy

- Goal: VitePress site builds with the full sidebar, generated API reference and Mermaid, deployed to Vercel at https://outbox.firatkil.com.
- Files: `site/.vitepress/config.ts` (TRD §18.1), `site/index.md`, one placeholder page per sidebar entry, `typedoc.json` (TRD §18.2), `site/snippets/tsconfig.json`, `scripts/docs-check.ts` (TRD §18.4), `vercel.json` (TRD §16.5); add `docs:check` and `docs:build` steps to `ci.yml`. Dev dependencies `vitepress`, `vitepress-plugin-mermaid`, `mermaid`, `typedoc`, `typedoc-plugin-markdown`, `typedoc-vitepress-theme` pinned exactly.
- Steps: verify A-09 and A-15; TSDoc on every public export (TypeDoc `notDocumented` makes missing docs fail); owner creates the Vercel project `outbox-docs` (Hobby) linked to the repository, sets Node.js 22.x, keeps Analytics and Speed Insights off, and adds the domain `outbox.firatkil.com` with a `CNAME` to `cname.vercel-dns.com`.
- Acceptance: `pnpm docs:check && pnpm docs:build` exit 0 with zero warnings; the PR has a Vercel preview deployment; after merge, https://outbox.firatkil.com/ serves the site and `/api/` lists all six entry points.
- Depends on: T-33. Covers: FR-100 (structure), FR-102, FR-103, NFR-41, NFR-45.

### T-35 Docs content

- Goal: every page written to the requirements of TRD §18.3.
- Files: `site/guide/*.md`, `site/snippets/*.ts`.
- Steps: write pages in the order guarantees, concepts, quick starts, migrations, ordering, retries, inbox, publishers, operations, testing, FAQ, comparison, why; copy GU and crash-table text verbatim from TRD §12 (checked by `docs:check`); verify A-16 for the comparison page; no marketing language, no emoji (NFR-46).
- Acceptance: `pnpm docs:check && pnpm docs:build` pass; every page in TRD §18.3 exists and contains each "must contain" item (checklist in the PR description, one line per item); a reviewer (owner) signs off in the PR.
- Depends on: T-34. Covers: FR-100, FR-101, FR-104, FR-108, NFR-45, NFR-46.

### T-36 Example app

- Goal: `examples/orders` per TRD §17 with EX-01 in CI.
- Files: everything in TRD §17.1; `ci.yml` `example` job enabled.
- Steps: implement routes, relay, schema, Dockerfile and compose; `scripts/smoke.sh` per §17.6; README for the example (how to run, what to observe, `--scale relay=3`, `EMAIL_FAIL_RATE=0.3` to watch retries).
- Acceptance: `docker compose -f examples/orders/compose.yml up -d --build --wait && bash examples/orders/scripts/smoke.sh` exits 0 locally; CI `example` job green.
- Depends on: T-26. Covers: FR-110.

### T-37 README

- Goal: README per TRD §18.6.
- Files: `README.md`, `site/snippets/readme-quick-start.ts`.
- Steps: exact outline; quick start is exactly the TRD §18.6 snippet (16 lines, 13 non-blank) and is type-checked; the README's fenced copy is byte-identical to the snippet file (add this comparison to `scripts/docs-check.ts`); guarantees table matches PRD §7; benchmark block filled by `pnpm bench:readme` from the merged results of T-31 (never typed by hand); badges as specified.
- Acceptance: `pnpm docs:check` passes (README snippet included in checks); `grep -cv '^[[:space:]]*$' site/snippets/readme-quick-start.ts` prints a number ≤ 15; the benchmark block names a file that exists in `bench/results/`.
- Depends on: T-31, T-35. Covers: FR-111.

### T-38 Publish and version workflows

- Goal: release automation per TRD §16.3, §16.4 and §19.
- Files: `.github/workflows/version.yml`, `.github/workflows/publish.yml`.
- Steps: create the `npm` GitHub environment restricted to tags `v*`, with the owner as required reviewer; verify A-02; because the package does not exist yet, the trusted publisher cannot be configured now: the owner creates the short-lived granular token and stores it as the `npm` environment secret `NPM_TOKEN` for the first publish (TRD §16.4, PRD D-44); the trusted publisher is configured in T-39 right after 0.1.0 is published; enable "Allow GitHub Actions to create and approve pull requests" for `version.yml` and `bench.yml`. Steps that need the owner's npm or GitHub settings are listed in the PR description as a checklist for the owner; the agent does not handle tokens.
- Acceptance: merging a PR with a changeset makes `version.yml` open "chore: version packages"; `actionlint` (run locally via `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest`) reports no errors for all five workflows; `publish.yml` references `secrets.NPM_TOKEN` only through `NODE_AUTH_TOKEN` in the publish step.
- Depends on: T-32. Covers: FR-96.

### T-39 Release 0.1.0

- Goal: `@firatkill/outbox@0.1.0` on npm with provenance, docs live, README complete.
- Files: `.changeset/initial-release.md` (`'@firatkill/outbox': minor`, summary of features), `CHANGELOG.md` (generated).
- Steps: follow the release checklist below; then TRD §19.2 steps 1–7; then the owner configures the npm trusted publisher (repository `firatkill/outbox`, workflow `publish.yml`, environment `npm`), deletes the `NPM_TOKEN` environment secret and revokes the token (TRD §16.4).
- Acceptance: `npm view @firatkill/outbox@0.1.0 version` prints `0.1.0`; the npm package settings show the trusted publisher and the `npm` environment has no `NPM_TOKEN` secret; the npm page shows provenance; `npx -y @firatkill/outbox@0.1.0 migrate --print | head -1` prints the header; a fresh directory with `npm i @firatkill/outbox postgres` runs the README quick start against `pnpm db:up` Postgres after `npx outbox migrate`.
- Depends on: T-34..T-38. Covers: G-1..G-6.

---

## Traceability: FR to tasks and tests

| FR | Tasks | Tests |
|---|---|---|
| FR-01..FR-07 | T-01, T-08, T-09, T-28, T-29, T-11, T-06 | T-01 acceptance, INT-82, smoke CJS/ESM (T-33) |
| FR-10..FR-16 | T-05, T-06, T-17 | INT-01..INT-07, INT-90 |
| FR-17, FR-18 | T-11, T-03 (guard) | test-clock tests, INT-15, G-3 |
| FR-20..FR-27 | T-10, T-11, T-24 | INT-10..INT-19, type tests |
| FR-30..FR-40 | T-13..T-18 | INT-20..INT-29, INT-70..INT-73, UT-02, UT-08..UT-10 |
| FR-45..FR-52 | T-12, T-19, T-20 | UT-01, INT-30..INT-39 |
| FR-55..FR-58 | T-22, T-23 | INT-40..INT-45, INV-08 |
| FR-60..FR-63 | T-24, T-25 | INT-19, INT-50..INT-54 |
| FR-65..FR-70 | T-14, T-28, T-29 | INT-20, UT-11, UT-13, INT-85..INT-87 |
| FR-75..FR-78 | T-26 | INT-60..INT-65 |
| FR-80..FR-84 | T-14, T-21, T-27 | UT-14, INT-37, INT-74, INT-75 |
| FR-86, FR-87 | T-06, T-21 | UT-12, INT-90, INT-91 |
| FR-90..FR-96 | T-02, T-03, T-30..T-33, T-38 | CI jobs, CHAOS-01/02, BENCH-01 |
| FR-100..FR-111 | T-34..T-37 | `docs:check`, `docs:build`, EX-01 |

## Release checklist (0.1.0)

Name and accounts:
- [ ] A-01 rechecked on release day: `npm view @firatkill/outbox` returns 404 (first publish) and `npm whoami` is the owner.
- [ ] npm account has 2FA enabled; short-lived granular `NPM_TOKEN` stored as an `npm` environment secret for the first publish (A-02, PRD D-44); trusted publisher to be configured right after publishing.
- [ ] GitHub repository is public; Vercel project `outbox-docs` is linked and serves `outbox.firatkil.com`; `npm` environment exists.

Quality:
- [ ] CI on the release commit: `static`, the 8 required integration cells, `chaos` (both runs), `example` all green; Node 20 best-effort cell result noted in the release notes if red.
- [ ] Coverage ≥ thresholds (TRD §15.4).
- [ ] `pnpm check:package`, `pnpm size` pass; `npm pack --dry-run` lists only allowed files.
- [ ] `bench/results/latest.json` is ≤ 30 days old and came from a GitHub runner; NFR-10 met or a PRD §14 row explains the gap.
- [ ] Every assumption A-01..A-20 has been verified and any fallback is recorded in PRD §14.

Docs:
- [ ] https://outbox.firatkil.com/ is live; every sidebar page loads; API reference lists six entry points.
- [ ] Guarantees page matches TRD §12 (`docs:check`).
- [ ] README: problem paragraph, quick start (≤ 15 non-blank lines), guarantees table, docs link, benchmark table with runner spec, how it is tested, comparison pointer, license.
- [ ] README badges render: CI, npm version, license, docs.
- [ ] One external tester completed the quick start in ≤ 15 minutes (NFR-47); result recorded in PRD §14.

Publish:
- [ ] Version PR merged; `CHANGELOG.md` has the 0.1.0 entry.
- [ ] GitHub release `v0.1.0` created on the version commit.
- [ ] `publish.yml` succeeded; `npm view @firatkill/outbox@0.1.0 dist.attestations` is present; npm page shows provenance.
- [ ] Trusted publisher configured on npmjs.com; `NPM_TOKEN` secret deleted and the token revoked.
- [ ] Fresh-install check from T-39 acceptance passed with both drivers (`npm i @firatkill/outbox pg` variant too).
- [ ] Repository description, topics (`outbox`, `postgres`, `transactional-outbox`, `typescript`) and website link set.
