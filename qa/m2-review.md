# M2 QA milestone review

Date: 2026-10-21. Reviewed after [the milestone report](m2-report.md), using qa-milestone-review and AGENTS.md repository overrides.

| Review item             | Verdict and evidence                                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ledger integrity        | PASS. All 102 cases overall and all 35 M2 cases are resolved, with passing latest attempts. The integrity gate passes; historical advisories are retained.                                                                                                                                             |
| Coverage                | PASS for staged M2. Compared all 35 designed cases with ledger entries: none missing or extra. All referenced UT/INT IDs have automation. Partial/future requirements are explicitly identified in the report.                                                                                         |
| Automation              | PASS. Vitest unit/integration tests exercise real PostgreSQL, both drivers, isolated schemas, child-process SIGKILL, connection termination, and the database test clock. All full PG14/16/17 suites pass without skips/todos.                                                                         |
| Real retesting          | PASS. Every failed case has a later observed pass. INT-26 retains its timing tolerance; TC-094 diagnostics distinguished delivery/shutdown success from pool teardown before fixing the test-owned cleanup.                                                                                            |
| Escalations             | PASS under repository override. No unresolved owner decisions or manual-required cases. D-66/D-67/D-69 record the applicable owner approvals. No Slack/ClickUp messages were sent.                                                                                                                     |
| Manual tests            | PASS for scope. No M2 manual cases; docs/example live checks remain scheduled, not silently passed.                                                                                                                                                                                                    |
| Audit trail             | PASS. No removed cases, attempts or retractions. Superseded hypotheses, test corrections, environment failures and approvals remain documented.                                                                                                                                                        |
| Attempts advisory       | Reviewed TC-005, TC-067 and TC-094. The first two are shared historical tooling/size cases. TC-094 had three failures separated by a pass, then a confirmed teardown diagnosis and passing retests on all three PostgreSQL versions. No three-consecutive-failure checkpoint was crossed in this work. |
| Agent/skill improvement | Recommendations below. No installed skill change or weakened test is warranted.                                                                                                                                                                                                                        |

## Agent improvements

- Distinguish delivery, relay shutdown and caller-owned pool teardown when a fault-injection test times out. Add diagnostic milestones before attributing a timeout to lease recovery; preserve corrections to earlier hypotheses.
- Capture database-relative timing at the write when asserting a narrow SQL delay tolerance. CI runner scheduling must not consume the measured delay before the assertion.
- Follow the public fixture contracts: single-message enqueue returns one result; resolved configuration is not public constructor input. Run strict typing early.
- Bound cleanup of test-owned resources after all tested work is awaited. Do not transfer ownership of caller pools into production adapters to solve test teardown.
- Keep stage-specific guarantees explicit. Passing concurrency and SIGKILL tests is not evidence that future ordering/inbox/chaos or benchmark checks have run.

## Closure verdict

M2 is ready to close. T-18 implementation CI passes; final report-commit CI is enforced on PR #18 before merge. The staged acceptance tests pass locally on PostgreSQL 14/16/17 with both drivers; 184 unit tests pass on Node 22. The report lists all remaining verification limits, including the unexplained historical host restart. Stop before T-19 for the owner's milestone review.
