# Progress

Local repository setup completed on 2026-10-21. M0 (T-01..T-03), M1 (T-04..T-11), M2 (T-12..T-18), M3 (T-19..T-21) and M4 (T-22..T-25) are complete. M5 started with owner approval; T-26 inbox implementation and verification are complete; T-27 is next.

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
| T-16 | M2 | Reclaim, fencing and crash recovery | done | 72222d0 |
| T-17 | M2 | Lifecycle: start, stop, drain, signal | done | 9aaed86 |
| T-18 | M2 | Concurrency and resilience | done | f548dfa |
| T-19 | M3 | Retries and dead transitions | done | ff9b685 |
| T-20 | M3 | Admin helpers | done | c194e74 |
| T-21 | M3 | stats and CLI stats | done | 5f96956 |
| T-22 | M4 | Ordering-mode claim | done | 3bcaf44 |
| T-23 | M4 | Ordering under concurrency | done | 1ffbea3 |
| T-24 | M4 | NOTIFY and LISTEN in adapters | done | e84095c |
| T-25 | M4 | Wake-up scheduling and latency | done | 695b2c3 |
| T-26 | M5 | Inbox | done | `8d40d59` |
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

- T-16: SIGKILL recovery, stale completion fencing, startup reclaim and periodic batch/dead events pass (seven targeted checks). Full suite 183 unit / 93 PG17 integration, static/package/size gates pass. INT-24 passes; future concurrency/chaos gates follow D-66. [PR CI](https://github.com/firatkill/outbox/actions/runs/39593697735) passes; final documentation checks required before merge.

- T-17: startup schema checks, graceful/forced drain, late outcome suppression, release attempt accounting, idempotence and abort signals pass. Bounded flush retry failure remains recoverable. Full suite 184 unit / 103 PG17 integration, static/package/size gates pass (core 10.97kB). [PR CI](https://github.com/firatkill/outbox/actions/runs/39594729822) passes; final documentation checks required before merge.

- T-18: both 10000-message/four-relay workloads, connection-loss recovery, prepare:false, claim mapping and pool override checks pass. Full suite: 184 unit; 113 integration on each of PG14.24/16.15/17.11 with both drivers. Static gates pass. Fault-test teardown now explicitly closes caller-owned postgres.js pools after drain; D-70 records test configuration and cleanup. [PR CI](https://github.com/firatkill/outbox/actions/runs/39596449111) passes; final report-commit checks required before merge.

- M2 evidence and limits: [milestone report](../qa/m2-report.md) and [QA review](../qa/m2-review.md). All 35 M2 cases are resolved. No chaos, ordering/inbox concurrency, full Node matrix, benchmark, docs or example readiness is claimed beyond the scheduled scope.

- T-19: all ten retry/dead-transition checks pass for both drivers; full suite 184 unit / 123 PG17 integration passes. Lint, typecheck, guards and QA ledger pass. [PR CI](https://github.com/firatkill/outbox/actions/runs/39605620125) passes, including package/size checks; final documentation commit CI required before merge. No production changes were needed.

- T-20: admin implementation and acceptance pass on PG14/16/17 with both drivers. D-71/D-72 approvals are applied; targeted fault recovery and approved size gates pass. Full suite passes 186 unit / 133 PG17 integration tests. [PR CI](https://github.com/firatkill/outbox/actions/runs/39629253196) passes; final documentation commit checks required before merge.

- T-21 / M3: stats, missing-schema handling and built CLI pass. Final standard suite: 186 unit / 139 PG17 integration tests; M3 acceptance also passes on PG14/16, including both index-plan assertions. Static/build/package/size/ledger gates pass. [Implementation CI](https://github.com/firatkill/outbox/actions/runs/39631946088) passes; final report-commit CI is enforced before merge. [M3 report](../qa/m3-report.md) and [review](../qa/m3-review.md) retain the known driver limitation, unconfirmed local timeout history and deferred gates.

- T-22: C2/C2T and all five ordering scenarios pass with both drivers. Full suite: 186 unit / 151 PG17 integration; static, build, package and size gates pass. [PR CI](https://github.com/firatkill/outbox/actions/runs/39634998508) passes; final documentation checks enforced before merge. INT-41 follows in T-23; later gates follow D-66/D-61.

- T-23: INT-41 passed three consecutive runs with both drivers, each under 60 s; reusable INV-08 reports zero violations. Full suite: 186 unit / 153 PG17 integration. Static and ledger gates pass. [PR CI](https://github.com/firatkill/outbox/actions/runs/39635909129) passes; final documentation checks enforced before merge.

- T-24: notification commit/suppression, reconnect, separate listen pools and lifecycle races pass with both drivers. Full suite: 187 unit / 163 PG17 integration. Static/build/package/size/ledger pass. [PR CI](https://github.com/firatkill/outbox/actions/runs/39661905308) passes; final documentation CI enforced before merge. D-74 explicitly retains the postgres.js server-subscription cleanup limitation.

- T-25 / M4: all six latency/polling checks passed three consecutive runs with both drivers. Full suite: 187 unit / 169 PG17 integration. Static/ledger gates and [implementation CI](https://github.com/firatkill/outbox/actions/runs/39663538826) pass; final report-commit CI enforced before merge. [M4 report](../qa/m4-report.md) and [review](../qa/m4-review.md) disclose the approved driver cleanup limitation, the initial latency outlier and deferred gates.

- T-26: 204 unit / 183 PG17 integration tests pass, including INT-22/24/41/62. Static/build/package/approved size gates pass. Initial INT-70 fixture race corrected against the shutdown requirement; initial INT-23 startup timeout did not recur, cause unconfirmed. Initial PR CI exposed INT-29 terminating idle pg sockets without a claim/flush error; deterministic active-statement fault injection now passes. A subsequent local full run had five timeouts and a driver cleanup rejection; all targeted checks and the final 204/183 full run pass unchanged. [Implementation PR CI](https://github.com/firatkill/outbox/actions/runs/39932699712) passes; final documentation commit CI is enforced before merge. Docs gates remain deferred to T-34 and chaos to T-30.

## Open questions for the owner

- T-26: owner approved the [M5 size proposal](M5-SIZE-PROPOSAL.md), recorded as D-75. No open owner decision; task verification continues.


None. Owner approved the [postgres.js reconnect cleanup workaround](M4-LISTEN-PROPOSAL.md), recorded as D-74; the approved contract passes verification.

Owner approved moving relay LISTEN/wake wiring into T-24; D-73 records the decision.

Owner approved [M3 gate corrections](M3-GATE-PROPOSAL.md), recorded as D-72; verification passes.

Owner approved [M3 admin validation](M3-APPROVAL-PROPOSAL.md), recorded as D-71.

Owner approved the [12kB core limit](CORE-SIZE-PROPOSAL.md) (D-69).

Owner approved the [M2 proposal](M2-APPROVAL-PROPOSAL.md): staged future verification gates (D-66) and integer relay counts/milliseconds (D-67). The owner approved the pg optional payload type correction (D-65); T-09 checks pass.

Owner approved the A-03 text-first JSON cast correction (D-64); implementation and verification are complete for T-08.

Docs gates are deferred until T-34 (D-61). Both adapter size checks were restored to createOutbox imports in T-08/T-09, as required by D-63.

Previous decisions resolved: The owner resolved A-01 and approved A-07’s fallback (D-56); M0 local and static CI acceptance is complete.
