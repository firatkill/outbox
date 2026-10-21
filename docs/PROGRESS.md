# Progress

Local repository setup completed on 2026-10-21. M0 (T-01..T-03) is complete. The owner approved continuing; M1 is underway.

- Read AGENTS.md and all four specification documents from start to finish.
- Verified the required Git author and committer identity; enabled the executable `.githooks/commit-msg` hook.
- Initial specifications and existing authorship settings committed as `cda0acf`.
- Owner approved GitHub creation and the initial push (PRD D-55). Public repository: https://github.com/firatkill/outbox; origin/main contains the setup commits.
- At every milestone boundary, stop and report completed work and unverified acceptance criteria.

## Tasks

A completion commit is recorded only after the task meets its acceptance criteria. A dash means no completion commit exists.

| Task | Milestone | Description | Status | Completion commit |
|---|---|---|---|---|
| T-01 | M0 | Repository and tooling | done | 99f3421 |
| T-02 | M0 | Local databases and test harness | done | d1a70eb |
| T-03 | M0 | CI static job, guards and Changesets | done | 1f50dd1 |
| T-04 | M1 | Identifiers, config, errors and rendering | doing | — |
| T-05 | M1 | Migration 0001 and runner | todo | — |
| T-06 | M1 | migrationSql and CLI migrate | todo | — |
| T-07 | M1 | Message validation, JSON and UUIDv7 | todo | — |
| T-08 | M1 | postgres.js adapter and createOutboxCore skeleton | todo | — |
| T-09 | M1 | pg adapter | todo | — |
| T-10 | M1 | enqueue | todo | — |
| T-11 | M1 | Test clock and delays | todo | — |
| T-12 | M2 | Relay options and backoff (pure) | todo | — |
| T-13 | M2 | Claim, complete, fail and lease SQL | todo | — |
| T-14 | M2 | Relay engine: scheduler, loop, deliverer, flusher | todo | — |
| T-15 | M2 | Handler timeout and abort | todo | — |
| T-16 | M2 | Reclaim, fencing and crash recovery | todo | — |
| T-17 | M2 | Lifecycle: start, stop, drain, signal | todo | — |
| T-18 | M2 | Concurrency and resilience | todo | — |
| T-19 | M3 | Retries and dead transitions | todo | — |
| T-20 | M3 | Admin helpers | todo | — |
| T-21 | M3 | stats and CLI stats | todo | — |
| T-22 | M4 | Ordering-mode claim | todo | — |
| T-23 | M4 | Ordering under concurrency | todo | — |
| T-24 | M4 | NOTIFY and LISTEN in adapters | todo | — |
| T-25 | M4 | Wake-up scheduling and latency | todo | — |
| T-26 | M5 | Inbox | todo | — |
| T-27 | M5 | Events, tracer and console fallback | todo | — |
| T-28 | M5 | BullMQ publisher | todo | — |
| T-29 | M5 | Webhook publisher and verifyWebhook | todo | — |
| T-30 | M6 | Chaos script | todo | — |
| T-31 | M6 | Benchmark | todo | — |
| T-32 | M6 | Full CI matrix | todo | — |
| T-33 | M6 | Package quality gates | todo | — |
| T-34 | M7 | Docs site skeleton, TypeDoc and deploy | todo | — |
| T-35 | M7 | Docs content | todo | — |
| T-36 | M7 | Example app | todo | — |
| T-37 | M7 | README | todo | — |
| T-38 | M7 | Publish and version workflows | todo | — |
| T-39 | M7 | Release 0.1.0 | todo | — |

## Specification precedence

- OWNER-DECISIONS.md lists Node 20/22/24 and PostgreSQL 14/16/17. Later PRD D-41/D-42 and the TRD describe a different support matrix. The owner-decisions file takes precedence; this conflict is recorded in PRD D-54 and must be reconciled in the affected implementation tasks.
- OWNER-DECISIONS.md fixes the npm account and scope as `firatkill` / `@firatkill`; TRD A-01’s expected `npm whoami` spelling `firatkil` conflicts with that decision. Verify against the owner-approved identity in T-01 without changing the package name.

## Verification

- Setup checks passed: required Git identity, hook syntax, executable hook, staged whitespace check, and first commit through the enabled hook.
- T-01 local install, lint, typecheck, smoke test, build and ESM/CJS artifact checks pass. Database harness and static CI are now verified.
- M0 test cases are in `qa/test-cases.md`; preflight results are in `qa/test-results.json`, using qa-test-case-design and qa-test-run-loop with repository overrides.
- Docker is available. npm package lookup returned the expected E404, and authenticated ownership now verifies as firatkill. A-07 failed because tsup is no longer actively maintained; the owner approved tsdown (D-56).
- npm metadata initially hit an existing root-owned user-cache entry. Read-only registry checks use a repository-local cache under `.git/npm-cache`; the shared cache was not changed.
- T-01 tooling and T-02 harness pass locally. PostgreSQL 14/16/17 and Redis are healthy; both drivers and two concurrent harness processes pass. The T-03 static CI job passes.

- T-03: 26 unit tests and 4 PostgreSQL integration checks pass locally. The expected missing-changeset failure and label-triggered green rerun are verified in [CI](https://github.com/firatkill/outbox/actions/runs/39565227105).
- Milestone evidence and verification limits: [M0 report](../qa/m0-report.md) and [QA review](../qa/m0-review.md). Package quality, documentation, chaos and the full runtime CI matrix belong to later tasks and are not verified here.

## Open questions for the owner

None. The owner resolved A-01 and approved A-07’s fallback (D-56); M0 local and static CI acceptance is complete.
