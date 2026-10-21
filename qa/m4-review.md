# M4 QA milestone review

Date: 2026-10-21. Performed after [the milestone report](m4-report.md), using qa-milestone-review and AGENTS.md overrides.

| Review item       | Verdict and evidence                                                                                                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger integrity  | PASS. Checker passes with 128 cases and append-only attempt history. All latest attempts are passing.                                                                                                                                                                             |
| Coverage          | PASS for planned M4 acceptance. Mechanical comparison finds 13 designed cases, 13 ledger entries and 13 automated cases, with none missing. The report distinguishes planned checks from the separate unmeasured default steady-state rate and future chaos/docs/matrix evidence. |
| Automation        | PASS. Vitest covers both drivers against isolated PostgreSQL schemas. INT-41 uses independent pools and real database timestamps without a test clock.                                                                                                                            |
| Real retesting    | PASS. Fixture/static/size failures have observed passing retests. The latency outlier passed an unchanged targeted retest, three consecutive complete acceptance runs and the final standard suite. No status-only resolution.                                                    |
| Escalations       | PASS under repository override. D-73 and D-74 record explicit owner decisions. The driver cleanup test changed only after D-74 approved the documented exception; fault and delivery thresholds were retained. No pending decision, external ticket or message remains.           |
| Manual checks     | PASS for library scope. No manual-only M4 case; docs-site and example checks remain later work.                                                                                                                                                                                   |
| Audit trail       | PASS. No removed cases, attempts or unexplained retractions. Confirmed driver behavior is distinguished from the unconfirmed latency-outlier cause.                                                                                                                               |
| Attempts advisory | Reviewed historical TC-005 (8), TC-067 (6), TC-094 (5), plus M4 TC-119 (3 fixture/static failures) and TC-128 (3 static/size failures). All have later passing attempts. Passes separated the M4 failures, so no case crossed three consecutive failures.                         |
| CI and task gates | Local acceptance and standard suite pass. T-22..T-24 final PR checks pass. T-25 implementation CI 39663538826 passed static and integration. Final report-commit CI remains required before merge.                                                                                |

## Product-quality findings

- The postgres.js cleanup limitation is a real resource-ownership caveat, not a successful server-unsubscribe result. Closed callbacks are suppressed; dedicated caller-owned listen pools should be ended after stop when deterministic cleanup matters. pg retains full unsubscribe coverage.
- The initial 830.53ms latency sample remains a failed observation. Later passing samples do not establish its cause or a universal latency guarantee under arbitrary contention.
- Core is close to its existing 13kB size budget. Future features must continue to run that gate.
- Future chaos/inbox, full matrix, default steady-state benchmark, coverage thresholds, docs and examples are not implied by this review.

## Agent improvements

- Read public return shapes and qualify numeric SQL ordering before constructing assertions; do not infer them from a familiar API shape or a cast output alias.
- Reproduce driver lifecycle assumptions with the driver's public API when integration observations disagree with the spec. Avoid private-internal workarounds or ending caller-owned pools.
- Validate callback-mutated state against both asynchronous behavior and static control-flow analysis; retain tests for stop/open races and retry cancellation.
- Retain timing failures and state uncertainty honestly. Do not raise deadlines or attribute failures to host load merely because load was high.
- Measure bundle impact after final code cleanup; small changes can cross a nearly full budget. No QA skill changes or weaker assertions are needed.

## Closure verdict

M4's planned local acceptance is complete with D-74's approved limitation. Implementation CI passes. Closure is conditional on final report-commit CI passing. Stop before T-26 for owner review.
