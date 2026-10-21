# M4 QA milestone report

Date: 2026-10-21. Scope: T-22..T-25, ordering and LISTEN. Prepared with qa-milestone-docs and repository overrides. Sources: [case definitions](test-cases.md), [append-only results](test-results.json), PRD/TRD and PRs [22](https://github.com/firatkill/outbox/pull/22), [23](https://github.com/firatkill/outbox/pull/23), [24](https://github.com/firatkill/outbox/pull/24), [25](https://github.com/firatkill/outbox/pull/25).

## Resolved

All 13 M4 cases have observed passing latest attempts. All 128 project ledger cases are resolved; this does not imply that future tasks or every earlier external availability check were rerun.

| Case   | Behavior                                   | Status   |
| ------ | ------------------------------------------ | -------- |
| TC-116 | Serial delivery per key                    | resolved |
| TC-117 | Backoff blocks only its key                | resolved |
| TC-118 | Dead head requires skip or retry           | resolved |
| TC-119 | Blocked keys do not block other work       | resolved |
| TC-120 | Ordering spans topic filters               | resolved |
| TC-121 | Ordering across four concurrent relays     | resolved |
| TC-122 | Transactional enqueue notification         | resolved |
| TC-123 | Listener reconnect recovery                | resolved |
| TC-124 | Separate listen pool                       | resolved |
| TC-125 | Notification wake latency                  | resolved |
| TC-126 | Polling without notifications              | resolved |
| TC-127 | Idle polling backoff                       | resolved |
| TC-128 | Listener opening failure and shutdown race | resolved |

## Verification evidence

- T-22 proves single-key serialization, backoff and dead-head blocking, skip/retry recovery, unkeyed progress, and ordering across topic filters with both drivers.
- T-23 INT-41 passed three consecutive dedicated runs with both drivers: 5,000 keyed plus 1,000 unkeyed messages across four independent relay pools, each workload under 60 seconds. First delivery starts follow sequence order, maximum active handlers per key is one, all messages complete once, and the reusable INV-08 query returns zero violations. No test clock is installed in this scenario.
- T-24 proves notifications occur after commit, batching produces one notification, notify:false suppresses notifications, listeners reconnect, statements/listening use their selected pools, initial opening failures recover, and stop closes a late-opened handle. Retry backoff caps at 30 seconds and stop cancels pending retries. INT-52 retains the two-second delivery deadline.
- T-25 INT-50/51/53 passed three consecutive complete acceptance runs with both drivers. Each INT-50 checks 20 samples with p50 <=50ms and maximum <=500ms at a five-second polling interval. Polling-only delivery is within one second; the specified three-second idle observation has 4..9 claims. No thresholds or workloads were relaxed.
- Final standard `pnpm test`: 187 unit and 169 PostgreSQL 17.11 integration tests passed on local Node 22, with no skipped tests, todos or unhandled errors. Integration took 39.70 seconds with the unchanged project configuration. INT-22/24/41 are included.
- Lint, typecheck, guards and ledger integrity pass. T-24 build, package/declaration and unchanged size checks pass: core rounds to 13.00kB, postgres-js 12.70kB, pg 12.95kB. Core has very little remaining budget. T-25 changes tests and reports only.
- CI: T-22 final run 39635274003, T-23 final run 39636242870 and T-24 final run 39662263714 passed. T-25 [implementation CI](https://github.com/firatkill/outbox/actions/runs/39663538826) passed static and integration. Final report-commit CI must pass before merge.

## Pending decisions

None. D-73 moves relay LISTEN/wake wiring into T-24 to satisfy its acceptance dependencies. D-74 approves the precisely documented postgres.js cleanup limitation in [the proposal](../docs/M4-LISTEN-PROPOSAL.md). No external service or upstream issue was created.

## Manual test required

None in M4's library scope. Docs-site and example live QA belong to later milestones. This report does not claim those checks passed.

## Regressions and audit trail

No M4 case is marked as a regression of a previously fixed product defect. No cases or attempts were deleted or retracted.

- TC-118 initially expected retryDead to return an array rather than its normative object. TC-119 inspected sequence values in lexical rather than numeric order, then encountered lint/format issues. Fixture corrections follow the spec; later runs pass.
- TC-123 exposed a real driver cleanup problem. A driver-only reproduction verified that postgres.js 3.4.9's original unlisten handle retains the replacement subscription after reconnect. Owner-approved D-74 changes that cleanup contract explicitly: closed adapters suppress callbacks and call unlisten, but deterministic server cleanup requires the caller to end a dedicated listen pool. pg still fully unsubscribes. Recovery/deadline assertions are unchanged.
- TC-128 encountered static closure-flow/style issues and a core size result of 13,005 bytes against 13,000. Removing redundant retry state restored the existing limit; no budget increase or behavior relaxation occurred. Unit and integration retests pass.
- TC-125's first run had one postgres.js maximum latency of 830.53ms. The unchanged targeted retest, three consecutive full acceptance runs and final full suite passed. Host load was about 30 during investigation, but causation is unconfirmed. The failed sample remains in the ledger; this is not a claim that the threshold holds under arbitrary host load.

## Root cause groups

No new multi-case root-cause group was established in M4. The driver cleanup reproduction is confirmed; the latency outlier is not assigned a speculative cause. Older M2/M3 groups remain in the ledger and their reports.

## Requirement coverage

| Requirement                | Evidence and limits                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-55..FR-57; GU-06        | TC-116..TC-121 verify ordering behavior and concurrency. GU-06 retains the non-overlapping enqueue-transaction precondition. Chaos evidence remains scheduled for T-30. |
| FR-26                      | TC-122 verifies transaction-bound notifications and suppression.                                                                                                        |
| FR-60                      | TC-127 and existing scheduler unit cases verify idle-backoff behavior.                                                                                                  |
| FR-61; NFR-11              | TC-124/125 verify wake-up, separate pools and the specified latency experiment; the initial failed sample remains disclosed.                                            |
| FR-62; GU-08               | TC-126 verifies polling without LISTEN; TC-123/128 verify reconnect/opening-failure recovery with polling retained.                                                     |
| FR-63                      | TC-123/124/128 and UT-21 verify reconnect, separate listen pools and retry behavior, subject to D-74's cleanup exception.                                               |
| NFR-12                     | The planned INT-53 backoff-count scenario passes. A separate steady-state benchmark using default intervals and LISTEN enabled was not performed.                       |
| NFR-02                     | Partial: INT-22/41 and ordering INV-08 pass. All chaos invariants and fault modes await T-30.                                                                           |
| FR-58 and operational docs | The all-relays-same-mode rule and D-74 pool guidance are in the TRD. Published documentation and its checks remain scheduled for T-34/T-35.                             |

## Verification limits

- postgres.js 3.4.9 may retain a server subscription and callback closure after reconnect until its caller-owned pool ends. Closed relay callbacks are suppressed. Repeated relays on a shared long-lived pool can accumulate retained callbacks; use a dedicated listen pool and close it after stop for deterministic cleanup, or pg / listen:false.
- The prior D-72 postgres.js type-discovery fault limitation remains: INT-29 disables fetch_types only on its test-owned worker. No broad claim is made about default driver-internal discovery during backend termination.
- M4 was verified locally and in the current CI on Node 22 / PostgreSQL 17. PostgreSQL 14/16 were not rerun for M4, and the full Node/database matrix awaits T-32.
- No chaos, inbox-concurrency, benchmark, global coverage-threshold, docs deployment or example readiness is claimed. D-66/D-61 govern the deferred gates.
- M4 closure requires the final T-25 report-commit CI. Stop before T-26 for owner review; this is not release readiness.
