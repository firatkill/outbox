# Progress

Local repository setup completed on 2026-10-21. M0 (T-01..T-03) and M1 (T-04..T-11) are complete. Owner authorized M2; T-12 is complete; T-13 is complete; T-14 is complete; T-15 is complete. Stop at the end of M2 for owner review.

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
| T-04 | M1 | Identifiers, config, errors and rendering | done | e07f5cd |
| T-05 | M1 | Migration 0001 and runner | done | 16010ec |
| T-06 | M1 | migrationSql and CLI migrate | done | 80c67b2 |
| T-07 | M1 | Message validation, JSON and UUIDv7 | done | be11b48 |
| T-08 | M1 | postgres.js adapter and createOutboxCore skeleton | done | a5955a3 |
| T-09 | M1 | pg adapter | done | 595ea7d |
| T-10 | M1 | enqueue | done | 818de4d |
| T-11 | M1 | Test clock and delays | done | 82f0d56 |
| T-12 | M2 | Relay options and backoff (pure) | done | 32b8e51 |
| T-13 | M2 | Claim, complete, fail and lease SQL | done | eb65f3e |
| T-14 | M2 | Relay engine: scheduler, loop, deliverer, flusher | done | 1a0b70f |
| T-15 | M2 | Handler timeout and abort | done | 558b4b5 |
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

- T-04: config, naming, rendering and error tests pass (57 unit / 6 integration in the available suite); [PR static CI](https://github.com/firatkill/outbox/actions/runs/39566952773) passes.

- T-05: schema, checksums, concurrent migrations, rollback and dry-run checks pass (59 unit / 12 integration locally); [static and integration CI](https://github.com/firatkill/outbox/actions/runs/39568478372) pass.

- T-06: CLI and printed-SQL catalog equivalence pass (64 unit / 18 integration locally); package checks and staged size limits pass; [static and integration CI](https://github.com/firatkill/outbox/actions/runs/39570779407) pass.

- T-07: validation, UTF-8 byte limits, dedupe collapse and UUID monotonicity pass (108 unit / 18 integration locally); [static and integration CI](https://github.com/firatkill/outbox/actions/runs/39572052918) pass. Final review also tests trailing-newline rejection.

- T-08: real postgres.js adapter, public migration factories and row decoding pass (124 unit / 18 integration locally); build/package/declaration/size gates and [CI](https://github.com/firatkill/outbox/actions/runs/39573697097) pass. A-03 JSON casts corrected with owner D-64; LISTEN remains T-24.

- T-09: 124 unit / 32 integration tests pass; both adapter createOutbox size checks, package/declaration checks and [CI](https://github.com/firatkill/outbox/actions/runs/39578249950) pass. Notification payload type corrected per owner D-65.

- T-10: 124 unit / 50 integration tests pass on PG17; all 18 enqueue cases pass on PG14/16 with both drivers. Atomicity, dedupe races, least privilege and batching verified; [CI](https://github.com/firatkill/outbox/actions/runs/39579342226) and package/size gates pass.

- T-11 / M1: final suite passes 126 unit tests and 58 integration tests on PG17, with four explicit T-14 relay todos. All 58 integration tests also pass on PG14/16 with both drivers. Package, declaration, size and [implementation CI](https://github.com/firatkill/outbox/actions/runs/39580611281) pass. Final report/test commit checks are enforced on [PR #11](https://github.com/firatkill/outbox/pull/11) before merge. [M1 report](../qa/m1-report.md) and [review](../qa/m1-review.md) document coverage and limitations.

- T-12: backoff and relay-option acceptance passes with 100% targeted lines/branches/functions/statements; 160 unit and 58 PG17 integration tests pass (four T-14 relay todos remain). Lint, typecheck, guards, build, package and size pass. [PR CI](https://github.com/firatkill/outbox/actions/runs/39585043181) passes; final documentation commit checks are enforced before merge. D-66/D-67 approved; docs gates remain deferred per D-61.

- T-13: all 12 statement tests pass for both drivers; full suite 160 unit / 70 PG17 integration pass with four existing T-14 relay todos. Static checks and [PR CI](https://github.com/firatkill/outbox/actions/runs/39586706280) pass; final documentation commit checks required before merge. Initial postgres-js checks failed during a local PostgreSQL restart; recovered retest passed unchanged. Underlying host cause remains unverified and is retained in the QA ledger. Future concurrency/chaos checks follow D-66.

- T-14: engine implemented; 183 unit / 84 PG17 integration tests pass, including all former delay todos. Lint, types, guards, build and package checks pass. Owner approved the 12kB core limit (D-69); size gate passes. [PR CI](https://github.com/firatkill/outbox/actions/runs/39591920124) passes; final documentation checks required before merge.

- T-15: INT-26 passes with both drivers; timeout reason, stored error, retry delay and slot reuse verified. Full suite 183 unit / 86 PG17 integration and static checks pass. [PR CI](https://github.com/firatkill/outbox/actions/runs/39593104193) passes. A schema-owned trigger captures delay at the failure update to avoid CI scheduling consuming the tolerance; assertions unchanged. Final documentation checks required before merge.

## Open questions for the owner

None. Owner approved the [12kB core limit](CORE-SIZE-PROPOSAL.md) (D-69).

Owner approved the [M2 proposal](M2-APPROVAL-PROPOSAL.md): staged future verification gates (D-66) and integer relay counts/milliseconds (D-67). The owner approved the pg optional payload type correction (D-65); T-09 checks pass.

Owner approved the A-03 text-first JSON cast correction (D-64); implementation and verification are complete for T-08.

Docs gates are deferred until T-34 (D-61). Both adapter size checks were restored to createOutbox imports in T-08/T-09, as required by D-63.

Previous decisions resolved: The owner resolved A-01 and approved A-07’s fallback (D-56); M0 local and static CI acceptance is complete.
