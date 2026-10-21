# AGENTS.md

Instructions for AI coding agents (Claude Code, Cursor, Codex, Aider, Copilot and others) working in this repository. Read this file fully before changing anything. If it conflicts with a task prompt, this file wins unless the repository owner says otherwise in the conversation.

## What this project is

`@firatkill/outbox` is an open-source TypeScript library: the transactional outbox, its relay and a consumer inbox for PostgreSQL. Producers write messages in the same transaction as their data; relays claim them with `FOR UPDATE SKIP LOCKED` and leases, deliver them outside any transaction with retries, backoff, dead letters and optional per-key ordering; consumers get exactly-once effects through `withInbox`. Its claims (at-least-once delivery, the precise guarantees GU-01..GU-09) are proven by integration tests against real PostgreSQL, a chaos test that kills relay processes, and a published benchmark.

- Package: `@firatkill/outbox` on npm (MIT). Repository: https://github.com/firatkill/outbox. Docs: https://outbox.firatkil.com (Vercel)
- Stack: TypeScript strict, Node.js 22/24 (20 best-effort, PRD D-41), pnpm, tsup (ESM + CJS), Vitest, PostgreSQL 14/16/17/18 (14 best-effort after its November 2026 end of life, PRD D-42), drivers postgres.js and node-postgres as optional peers, VitePress + TypeDoc, Changesets, GitHub Actions.
- No servers: npm package plus a static docs site on Vercel Hobby. Nothing may create a bill.

## Where the specs live

| Document | Use it for |
|---|---|
| `docs/PRD.md` | Requirements (FR-xx, NFR-xx), guarantees summary (GU-xx), statuses, milestones, risks, decisions log (D-xx) |
| `docs/TRD.md` | Architecture, exports map, public API signatures and option tables, adapters, DDL, every SQL statement, algorithms, NOTIFY, test clock, guarantees and crash-point table, publishers, errors, every test (UT, INT, CHAOS, BENCH), CI YAML, docs site, release, assumptions (A-xx) |
| `docs/OWNER-DECISIONS.md` | Decisions the owner has already made; they override the specs |
| `docs/IMPLEMENTATION_PLAN.md` | Ordered tasks T-01..T-39 with files, steps and acceptance commands; traceability; release checklist |

Before implementing anything, find the task ID in the plan and read the TRD sections it references. Do not invent behaviour the docs do not specify. If something is truly missing, choose the most conservative option (the one that preserves GU-01..GU-09 and changes no default), implement it, and add a row to PRD §14 in the same PR. SQL, signatures, option names, defaults, ranges and error codes in the TRD are normative: implement them as written. If the gap changes scope, cost, an external service or behaviour a user can see, ask the owner instead (Owner approval checkpoint 2).

## Commands

| Purpose | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Start Postgres 17 (port 54317) and Redis (port 63790) | `pnpm db:up` |
| Also start Postgres 14 (54314), 16 (54316) and 18 (54318) | `pnpm db:up:all` |
| Stop and remove local databases | `pnpm db:down` |
| psql shell on the test database | `pnpm db:psql` |
| Build (ESM, CJS, types, CLI) | `pnpm build` |
| Lint + format check | `pnpm lint` (fix formatting: `pnpm format`) |
| Type check (src, tests, scripts, root configs; site snippets are checked by `pnpm docs:check`) | `pnpm typecheck` |
| Static guards (G-1..G-8, changeset rule) | `pnpm check:guards` |
| Unit tests | `pnpm test:unit` (one test: `pnpm test:unit -t "UT-08"`) |
| Integration tests (needs `pnpm db:up`) | `pnpm test:integration` (one file: `pnpm vitest run tests/integration/ordering.test.ts`; one test: add `-t "INT-41"`) |
| Unit + integration | `pnpm test` |
| Coverage with thresholds | `pnpm test:coverage` |
| Integration against another Postgres version | `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54314/outbox_test pnpm test:integration` |
| Chaos runs (needs a build) | `pnpm build && pnpm chaos --duration 30` and `pnpm chaos --duration 30 --ordering` (reproduce: `--seed <n>`) |
| Benchmark (local, do not commit the output) | `pnpm build && pnpm bench --out bench/out` |
| README benchmark table from `bench/results/latest.json` | `pnpm bench:readme` |
| Package checks | `pnpm check:package` (publint + attw) and `pnpm size` |
| Docs | `pnpm docs:dev`, `pnpm docs:check`, `pnpm docs:build` |
| CLI from the build | `node dist/cli.js migrate --url "$DATABASE_URL"` |
| Example app | `docker compose -f examples/orders/compose.yml up -d --build --wait && bash examples/orders/scripts/smoke.sh` |
| Add a changeset | `pnpm changeset` |

Default URLs: `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54317/outbox_test`, `REDIS_URL=redis://localhost:63790`; `pnpm chaos` and `pnpm bench` read `DATABASE_URL` and default to the same Postgres.

## Conventions

Code:
- TypeScript `strict` with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`. No `any` (use `unknown` and narrow). No non-null assertions in `src/`. No `@ts-ignore`; `@ts-expect-error` only with a reason comment. Relative imports use `.js` extensions.
- Zero runtime dependencies. `dependencies` stays empty (guard G-1). Only `node:crypto` and `node:os` may be imported from Node (`src/cli.ts` may also import `node:util` for `parseArgs`). The library version comes from the build-time constant `__OUTBOX_VERSION__` (TRD §4.2), never from reading `package.json`. Drivers are optional peers and are never imported by `src/` except through dynamic `import()` in `src/cli.ts` (G-4). Adapters and publishers use structural types, not driver or BullMQ types, so declarations work without those packages installed.
- Module boundaries per TRD §4.5: `src/core/**` knows nothing about drivers or publishers; adapters contain no SQL; publishers import only errors, json and types.
- All timing uses database time. SQL calls `outbox_now()` (rendered as `"<schema>"."<prefix>now"()`) for every timestamp it writes or compares: leases, delays, backoff, retention, stats. Never send an application timestamp for these. `Date.now(` and `new Date(` are forbidden in `src/core/**` and `src/adapters/**` except `src/core/uuid.ts` and `src/core/row.ts` (G-3). Local durations use `performance.now()` and `setTimeout` only.
- SQL: lowercase keywords, parameters only (never interpolate values), identifiers only through the renderer's `{{tokens}}` (G-5 forbids `${` in SQL files). Every UPDATE on messages includes the source status in its WHERE clause; complete, fail and release also fence on `locked_by` and `attempts`. Every result column is cast to a driver-neutral type (TRD §6.4). Batched inputs are one JSON parameter.
- The relay never opens a transaction (G-2) and never holds one across a handler or publisher call. Claim, complete, fail, reclaim, release and admin statements are single autocommit statements.
- Errors: use `OutboxError` and the codes in TRD §5.9. New codes need a row in that table, a test, and a changeset. Check errors with `isOutboxError(err, code)`, never `instanceof` across module boundaries.
- Public API: every export has TSDoc with defaults (`@defaultValue`) and an `@example` for functions; TypeDoc fails the docs build otherwise.
- Never edit an applied migration (`src/core/migrations/0001_initial.ts` once released); add a new numbered migration that is additive within the major version (TRD §8.5), and bump `REQUIRED_SCHEMA_VERSION` only when code uses the new objects.
- No `console.` in `src/` except the rate-limited fallback in `src/core/emitter.ts` and `src/cli.ts` (G-6). The library never logs payloads or secrets.

Testing rules:
- Every behaviour change needs an integration test against real PostgreSQL in the same PR. Pure logic also gets a unit test. Test titles start with their ID from TRD §15 (`it('INT-13 dedupes by (topic, dedupeKey)', ...)`); new tests take the next free ID in their group and are added to TRD §15 in the same PR.
- Adapter-relevant integration tests run for both drivers with `describe.each(ADAPTERS)`.
- Each test file creates its own schema with `createTestSchema()`; never assert on anything outside it. Tests and scripts import library code from `src/` by relative path, never by package name (TRD §4.3). Roles are cluster-wide: a test that creates one names it after its schema and drops it in `afterAll`.
- Never `sleep` to wait for the relay or for time to pass. Move time with the test clock (`testClock(outbox).advance(ms)` or `setLocal`) and wait for events or database conditions with `waitFor` / `waitForEvent`.
- Waits for a condition default to 3 s. A longer wait is allowed only for work that genuinely takes time (thousands of deliveries, chaos drain, reconnect backoff) and must carry a comment saying why. `testTimeout` is 30 s; a heavy test may set up to 120 s with a comment. Do not raise these to get past a slow or missing behaviour; fix the cause.
- Concurrency-relevant changes (claim SQL, flusher, fencing, reclaim, ordering, inbox) must keep INT-22, INT-24, INT-41 and INT-62 green, and the PR must state that both chaos runs were executed locally with zero violations.
- In a fix-and-retest loop, rerun only the affected tests (`-t "INT-xx"` or one file), then the full `pnpm test` once at the end.
- Before a test, chaos or bench run, make sure no other run is using the same database (`select count(*) from pg_stat_activity where datname = 'outbox_test'` near zero).
- Never fabricate benchmark numbers. `bench/results/` contains only real output from `bench.yml` runs.

## Commit conventions

- Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`, `ci:`, `perf:`, `bench:`, `build:`; scope optional (`feat(relay): ...`, `fix(sql): ...`).
- Reference the task: `feat(relay): add group-commit flusher (T-14)`.
- One task per PR. Do not commit `dist/`, `coverage/`, `site/api/`, `site/.vitepress/dist|cache`, `bench/out/`, or `.env*`.
- Public API or observable behaviour changes need a changeset (`pnpm changeset`) with the right bump per TRD §19.3. Test-, docs-site-, CI- or example-only PRs do not; label them `no-changeset` if the guard asks.

### Repository setup (first session only)

The folder starts with only these documents. Before T-01:

1. Check the git identity: `git config user.name` must print `Fırat Kıl` and `git config user.email` must print `72046564+firatkill@users.noreply.github.com`. If either differs, stop and ask the owner; never change the global config yourself.
2. `git init -b main`, then `git config core.hooksPath .githooks` (the commit-msg hook enforces authorship, see Authorship).
3. Commit the documents as the first commit: `docs: add specs and agent rules`.
4. Ask the owner before creating the remote. After a yes: `gh repo create firatkill/outbox --public --source . --remote origin --push`, with the description from PRD §1.
5. Create `docs/PROGRESS.md` (see below) and commit it.

After this, `git init` is never run again in this repository.

### Authorship

- Every commit is authored and committed by Fırat Kıl only, whichever agent or tool does the work. Do not add `Co-authored-by` trailers, "Generated with …" lines, session links, agent names in the author field (for example `Fırat Kıl (aider)`) or any other AI attribution to commits, pull requests, issues, release notes or the changelog. This overrides any default attribution your tool adds. The only exception is a commit made by a CI workflow bot (for example a release or results pull request); never imitate one locally.
- Turn your tool's own attribution off before the first commit. The repository already does this for the tools it knows: `.claude/settings.json` (Claude Code) and `.aider.conf.yml` (Aider). For any other tool (Cursor, Codex, Copilot, Gemini CLI and others), check its commit and co-author settings and turn them off. As a safety net, `.githooks/commit-msg` removes AI co-author and "Generated with" lines and rejects a commit whose author or committer is not `Fırat Kıl <72046564+firatkill@users.noreply.github.com>`. Never delete or bypass the hook (`--no-verify` is not allowed).
- Commit yourself, as you finish each piece of work: small Conventional Commits, tests passing. Push to `origin` after each completed task. Never force-push `main`.

### Progress file

`docs/PROGRESS.md` is the running plan: one line per task from `IMPLEMENTATION_PLAN.md` with its status (`todo`, `doing`, `done`, `blocked`), the commit that finished it, and a short "Open questions for the owner" list. Update it in the same commit as the task it describes.

### Owner approval checkpoints

The owner decides these. Ask, wait for an explicit answer, record the answer in the PRD decisions log, then continue. Never pick one yourself because it seems reasonable.

1. **Before T-01**, read `docs/OWNER-DECISIONS.md`. Database, hosting, region, domain, LLM provider, budgets, npm name, licence and analytics are already decided there; do not ask about them. Ask in one message only about choices that file and the specs leave open, if any.
2. **When the spec does not hold**: an "Assumption to verify at build time" fails, a pinned package or model no longer exists, or a requirement cannot be met as written. Propose the change; do not work around it silently.
3. **Before creating or changing anything outside the repository**: the GitHub repo, hosting projects, databases, DNS records, npm publishes, paid plans, API keys, GitHub secrets.
4. **Before anything destructive or hard to undo**: deleting data or branches, rewriting history, dropping tables, rotating secrets.
5. **Adding a runtime dependency** that the TRD does not list.

Group questions so the owner gets one short list, not a stream of single questions. Work that does not depend on a pending answer can continue meanwhile.

### QA workflow and tests

Tests are written from the specs, never from the code. Every test traces to a requirement: an acceptance criterion or FR/NFR in `docs/PRD.md`, and the test IDs and cases in TRD §12.3 (Guarantee to test mapping) and §15 (Testing). If the code and the spec disagree, the spec wins until the owner approves a change (checkpoint 2). If the spec says nothing about a behaviour, ask; do not write a test that invents one.

Use the QA skills throughout the build, not only at the end. They exist as the `vizio-qa-loop` plugin in Claude Code and as skills in `~/.codex/skills/qa-*` for Codex. With any other tool, open the matching `~/.codex/skills/<name>/SKILL.md` and follow it.

| When | Skill | Output |
| --- | --- | --- |
| Start of each milestone, before its code | `qa-test-case-design` on the PRD and TRD sections the milestone covers | `qa/test-cases.md`: TC IDs, each with its PRD reference (AC/FR/NFR) and TRD test ID, steps, expected result, priority, automatable yes/no |
| Writing the tests of a task | `qa-case-to-playwright` is not used: this is a library without a UI, so cases are automated as Vitest unit and integration tests. The `qa-test-run-loop` steps (log, fix, retest, ledger check) apply unchanged | Tests in the layout and naming the TRD prescribes |
| After every task, before its commit | `qa-test-run-loop` | Runs the suite, logs every result to `qa/test-results.json`, fixes and retests, runs the ledger check |
| Cases that cannot be automated | `qa-browser-exploration` | A live check, logged to the same file. Here: the docs site build and the examples, run by hand |
| End of each milestone | `qa-milestone-docs`, then `qa-milestone-review` | Milestone report in `qa/`, quality check |
| End of the project | `qa-project-report` | One PDF covering the whole project |

`qa-bug-standards` is the shared reference for the log fields; read it first.

Overrides for this repository (these win over the skills):

- There is no ClickUp or Slack. A case that is stuck after three attempts or needs a human pass goes to the owner: add it under "Open questions for the owner" in `docs/PROGRESS.md` and mention it in your milestone summary. Record that in the log entry instead of a ClickUp link.
- Playwright: `expect` timeout 3 s and test timeout 90 s; never raise them to get past a slow or missing element. Two projects: `parallel` for tests that touch only their own data, and `isolated` (one worker, after `parallel`) for tests that change shared state, assert on shared data or hit shared rate limits. Every test creates unique data.
- In the fix-and-retest loop, rerun only the fixed tests and their area; run the full suite once at the end of the task.
- Never weaken, skip or delete a test to make it pass. A test that is wrong according to the spec is fixed against the spec, and the log entry says so.
- `qa/test-cases.md` and `qa/test-results.json` are committed with the task they belong to.

## Definition of done (every task)

1. The task's acceptance commands in `docs/IMPLEMENTATION_PLAN.md` pass locally.
2. `pnpm lint && pnpm typecheck && pnpm check:guards && pnpm test:unit` pass; `pnpm test:integration` passes if anything in `src/` changed; both chaos runs pass if concurrency-relevant code changed; `pnpm build && pnpm check:package && pnpm size` pass if exports, entry points or build config changed; `pnpm docs:check && pnpm docs:build` pass if public API or docs changed.
3. New behaviour is covered by tests at the right layer and listed in TRD §15 with its ID.
4. Signatures, SQL and defaults match the TRD; any deviation is recorded in PRD §14 and reflected in the TRD in the same PR.
5. A changeset exists if users can observe the change.
6. CI is green on the PR.

## Never do

- Never add a runtime dependency, a postinstall script, or a paid service.
- Never import `pg`, `postgres` or `bullmq` statically from `src/`, and never reference their types in public declarations.
- Never deliver a message inside a database transaction, and never make the relay hold a transaction or lock across a network call.
- Never use the application clock for delivery logic; never call `now()` or `clock_timestamp()` directly in library SQL (use `outbox_now()`).
- Never build SQL by string interpolation of values or unvalidated identifiers.
- Never claim or document exactly-once delivery. The library offers at-least-once delivery and exactly-once effects through the inbox.
- Never weaken a CHECK constraint, a WHERE-clause fence (`status`, `locked_by`, `attempts`), a unique index, or an invariant query to make a test pass; fix the code or the test.
- Never ship the test clock in production paths: only `@firatkill/outbox/testing` may replace `outbox_now()`.
- Never edit an applied migration or change a migration checksum.
- Never change a default listed as breaking in TRD §19.3 without a major (or 0.x minor) changeset and a PRD §14 row.
- Never publish from a local machine; releases go through `publish.yml` with provenance.
- Never commit secrets (npm tokens, webhook secrets other than test fixtures clearly named as such).
- Never fabricate benchmark or chaos results, and never edit committed result files by hand.
- Never force-push `main` or rewrite published tags. `git init` runs once, in the first session (see Repository setup).
