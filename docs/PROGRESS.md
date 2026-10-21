# Progress

Local repository setup completed on 2026-10-21. Implementation has not started.

- Read AGENTS.md and all four specification documents from start to finish.
- Verified the required Git author and committer identity; enabled the executable `.githooks/commit-msg` hook.
- Initial specifications and existing authorship settings committed as `cda0acf`.
- GitHub repository creation and the initial push await owner approval.
- At every milestone boundary, stop and report completed work and unverified acceptance criteria.

## Tasks

A completion commit is recorded only after the task meets its acceptance criteria. A dash means no completion commit exists.

| Task | Milestone | Description | Status | Completion commit |
|---|---|---|---|---|
| T-01 | M0 | Repository and tooling | todo | — |
| T-02 | M0 | Local databases and test harness | todo | — |
| T-03 | M0 | CI static job, guards and Changesets | todo | — |
| T-04 | M1 | Identifiers, config, errors and rendering | todo | — |
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
- Application tests, build, database checks and CI have not run: tooling is introduced in T-01..T-03.
- QA bug standards have been read. Before M0 code, use qa-test-case-design; log task results with qa-test-run-loop and perform its ledger check, applying the repository overrides.

## Open questions for the owner

- Approve creation of the public GitHub repository `firatkill/outbox`, adding it as `origin`, and pushing the local setup commits?
