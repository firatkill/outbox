# M2 Relay and leases — QA report

Date: 2026-10-21. Scope: T-12 through T-18. Prepared using qa-milestone-docs with repository overrides; [review](m2-review.md).

## Evidence and result

All 35 designed M2 cases (TC-068..TC-102) have results and are resolved. The final local suite passes 184 unit tests and 113 integration tests on Node 22. All 113 integration tests also pass on PostgreSQL 14.24, 16.15 and 17.11 with postgres.js and node-postgres. Full runs have no todos or skipped tests. The former INT-15/16 delay todos are implemented and passing.

INT-22 delivers 10,000 messages across four independent relay pools for each driver: each id is handled once, every row finishes with attempts=1, each relay delivers at least 100, and no leaseLost/reclaimed events occur. Both runs meet the specified 60-second bound. INT-29 terminates only test-named relay connections every 200ms for two seconds; all 2,000 messages finish within the 30-second recovery allowance and claim/flush errors are observed. These are acceptance-test results, not published throughput benchmarks.

Lint, strict typecheck, guards, build, publint, attw and size checks pass for the implemented M2 paths. Latest package measurements from T-17: core 10.97kB/12kB, postgres-js 10.63kB/12kB, pg 10.69kB/12kB, testing 1.15kB/2kB (minified and Brotli-compressed). Publisher entries remain placeholders; their current sizes do not verify their future implementations. T-18 changes tests and documentation only.

Task implementation commits: T-12 32b8e51; T-13 eb65f3e; T-14 1a0b70f; T-15 558b4b5; T-16 72222d0; T-17 9aaed86; T-18 f548dfa. Each task has its own PR and was pushed; required authorship and the commit hook remain enabled. [T-18 implementation CI](https://github.com/firatkill/outbox/actions/runs/39596449111) passes; final report-commit checks are enforced on [PR #18](https://github.com/firatkill/outbox/pull/18) before merge.

## Resolved

Each case is linked by tc_reference to the [append-only ledger](test-results.json); requirement references and detailed steps are in [test-cases.md](test-cases.md).

| Case   | Title                                                   | TRD evidence                                                              | Status                           |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| TC-068 | Backoff ceilings and overflow                           | UT-01.                                                                    | Passed; resolved within M2 scope |
| TC-069 | Full jitter and input errors                            | UT-01.                                                                    | Passed; resolved within M2 scope |
| TC-070 | Relay defaults and numeric boundaries                   | UT-02.                                                                    | Passed; resolved within M2 scope |
| TC-071 | Delivery mode and option validation                     | UT-02.                                                                    | Passed; resolved within M2 scope |
| TC-072 | Claims skip locked rows                                 | INT-21; TRD 9.2.                                                          | Passed; resolved within M2 scope |
| TC-073 | Claim and outcome statement contracts                   | INT-94; TRD 9.2/9.3.                                                      | Passed; resolved within M2 scope |
| TC-074 | Fail statements retry or become dead                    | INT-95; TRD 9.3.2.                                                        | Passed; resolved within M2 scope |
| TC-075 | Reclaim and release statements                          | INT-96; INT-97; TRD 9.6.1/9.6.2.                                          | Passed; resolved within M2 scope |
| TC-076 | Scheduler and polling backoff                           | UT-08.                                                                    | Passed; resolved within M2 scope |
| TC-077 | Group commit and drain                                  | UT-09.                                                                    | Passed; resolved within M2 scope |
| TC-078 | Flush retry and expired outcomes                        | UT-09.                                                                    | Passed; resolved within M2 scope |
| TC-079 | Delivery classification and timeout                     | UT-10.                                                                    | Passed; resolved within M2 scope |
| TC-080 | End-to-end handler delivery                             | INT-20.                                                                   | Passed; resolved within M2 scope |
| TC-081 | Topic and outbox isolation                              | INT-27; INT-02.                                                           | Passed; resolved within M2 scope |
| TC-082 | Single-batch runOnce                                    | INT-28.                                                                   | Passed; resolved within M2 scope |
| TC-083 | Relay honors delayed availability                       | INT-15; INT-16.                                                           | Passed; resolved within M2 scope |
| TC-084 | Timeout abort and stored failure                        | INT-26; UT-10.                                                            | Passed; resolved within M2 scope |
| TC-085 | Process crash recovery                                  | INT-23.                                                                   | Passed; resolved within M2 scope |
| TC-086 | Late completion fencing                                 | INT-24.                                                                   | Passed; resolved within M2 scope |
| TC-087 | Claim-before-delivery crash recovery                    | INT-25.                                                                   | Passed; resolved within M2 scope |
| TC-088 | Relay schema prerequisite                               | INT-06.                                                                   | Passed; resolved within M2 scope |
| TC-089 | Graceful drain stops claims                             | INT-70.                                                                   | Passed; resolved within M2 scope |
| TC-090 | Forced shutdown releases attempts                       | INT-71.                                                                   | Passed; resolved within M2 scope |
| TC-091 | Single-use lifecycle and idempotent stop                | INT-72.                                                                   | Passed; resolved within M2 scope |
| TC-092 | External signal stops relay                             | INT-73.                                                                   | Passed; resolved within M2 scope |
| TC-093 | Concurrent relays divide deliveries                     | INT-22.                                                                   | Passed; resolved within M2 scope |
| TC-094 | Database reconnect resilience                           | INT-29.                                                                   | Passed; resolved within M2 scope |
| TC-095 | Unprepared postgres.js queries                          | INT-81.                                                                   | Passed; resolved within M2 scope |
| TC-096 | Driver-neutral claim mapping                            | INT-82.                                                                   | Passed; resolved within M2 scope |
| TC-097 | Relay pool override                                     | INT-83.                                                                   | Passed; resolved within M2 scope |
| TC-098 | Synchronous listener isolation and subscription cleanup | UT-14 (event subscriptions only); TRD 5.5. Console fallback remains T-27. | Passed; resolved within M2 scope |
| TC-099 | Capacity-bound delivery and released claim locks        | INT-98; TRD 9.5.1–9.5.3.                                                  | Passed; resolved within M2 scope |
| TC-100 | runOnce reports confirmed failure and dead counts       | INT-99; TRD 9.3.2/9.6.3.                                                  | Passed; resolved within M2 scope |
| TC-101 | Periodic full-batch reclaim and dead reporting          | INT-100; TRD 9.6.1.                                                       | Passed; resolved within M2 scope |
| TC-102 | Bounded shutdown flush retries                          | INT-101; UT-19; TRD 9.6.3 step 5.                                         | Passed; resolved within M2 scope |

## Pending decision

None. D-66 approves staged concurrency/chaos gates and splits INT-82's claim/admin coverage across its implementation tasks. D-67 approves integer relay counts/milliseconds with fractional retry.factor. D-69 approves only the core size limit increase to 12kB. D-61 continues the docs-gate deferral until T-34. D-68 and D-70 record internal scheduling and test-harness clarifications without changing production defaults.

## Manual test required

None within M2. Docs site and example live checks are future work. No browser UI exists in this milestone, and no manual check is represented as an automated pass.

## Regressions and root cause groups

No case has an unresolved regression reference. Group `t13-postgresql-recovery` contains four resolved SQL cases (TC-072..075): an initial local PostgreSQL backend restart interrupted the tests, then unchanged targeted and full retests passed. The underlying host restart cause remains unverified.

Group `postgres-js-terminated-test-pool-cleanup` contains TC-094. Diagnostics confirmed all 2,000 rows were done and relay.stop had resolved before postgres.js end() hung on a test-owned pool after backend termination. Explicit test-pool cleanup after awaited work fixed teardown; targeted, full PG17 and PG14/16 retests passed. The earlier default-lease explanation was a hypothesis and is superseded in the ledger. Production adapters still leave pool ownership to callers.

## Audit trail

No cases or failed attempts were deleted or retracted. Test-fixture corrections include structural adapter typing, single-message enqueue return shape, public versus resolved config input, and timestamp mapping from stored database values. INT-26 measures its retry delay in a schema-owned trigger at the update, preserving the specified ±150ms tolerance despite CI runner scheduling. No assertion or timeout was relaxed to hide a defect.

The three historical TC-094 failures were separated by a passing diagnostic run; they were not three consecutive failures. Shared advisories TC-005 (eight failures across earlier tooling work) and TC-067 (four historical size-gate failures, including the owner-approved D-69 correction) remain resolved. Every failure has an observed later pass. No benchmark or chaos output was fabricated.

## Requirement coverage

| Requirement / acceptance area  | Verification                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M2 acceptance in PRD §10       | INT-20..29, INT-70..73, INT-81..83, relay INT-15/16 and startup INT-06 all pass. INT-82 admin portions remain T-20/T-21 under D-66.                                                                                                                                |
| FR-30/31/34/39/40              | Options, per-relay concurrency, batching, scheduler, one-batch runOnce, handler/publisher topic filters and independent pools verified.                                                                                                                            |
| FR-32/33; GU-04/09             | Status/holder/attempt fences, same-holder stale attempts, SIGKILL recovery, ghost claims, late completion rejection, periodic full-batch reclaim and dead reporting verified. Full chaos proof remains T-30.                                                       |
| FR-35/36/37                    | Timeout reason and slot reuse; startup schema checks; graceful drain; forced shutdown abort and release without consuming attempts; discarded late outcomes; idempotent stop; external/already-aborted signals; bounded final flush retries and recovery verified. |
| FR-38; GU-01/02                | Connection-loss recovery and 10,000-message crash-free delivery counts verified. Crash recovery deliberately permits redelivery; no exactly-once-delivery claim is made.                                                                                           |
| FR-45/47/48                    | Backoff and error classification, stored errors, basic retry/dead transitions and exhaustion verified. Comprehensive retry/admin scenarios remain M3.                                                                                                              |
| FR-04; FR-15/16                | Both driver mappings, prepare:false delivery/concurrency, relay pool override, missing-schema rejection and additive-newer schema acceptance verified.                                                                                                             |
| GU-07; NFR-03                  | Database-time delays and actual no-early relay delivery pass; row locks can be acquired during handlers, and transaction/static guards pass.                                                                                                                       |
| FR-65/80                       | Current delivery/failure/lease/reclaim event paths and listener isolation pass. Tracer and rate-limited fallback behavior remain T-27.                                                                                                                             |
| NFR-01 and package constraints | Concurrency acceptance and current package/static limits pass. Published benchmark and full release-quality gates are not yet verified.                                                                                                                            |

## Verification limits

Both chaos modes remain unimplemented/unrun until T-30 by D-66. INT-41 ordering and INT-62 inbox concurrency gates start at T-23/T-26. LISTEN/NOTIFY reconnect and latency remain T-24/T-25. INT-82 listDead/stats comparisons remain T-20/T-21; comprehensive retries/dead-letter administration are M3. The full Node 20/22/24 CI matrix, global coverage thresholds, release smoke checks, published benchmark, docs checks/build, examples and deployment remain later tasks. Only Node 22 was used here. No npm publication or Vercel deployment occurred. The T-13 local PostgreSQL restart cause is still unverified.
