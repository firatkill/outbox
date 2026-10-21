# M1 QA milestone review

Date: 2026-10-21. Reviewed after [the milestone report](m1-report.md), using qa-milestone-review and the AGENTS.md library/repository overrides.

| Review item             | Verdict and evidence                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger integrity        | PASS. The ledger contains 67 cases overall; all 43 M1 cases are resolved and latest attempts pass. The final integrity gate passed before commit.                                                                    |
| Coverage                | PASS for the staged M1 scope. An ID comparison found 43 designed cases and 43 ledger entries, no missing or extra M1 cases. Requirement coverage and deferred portions are explicit in the report.                   |
| Automation              | PASS. Cases map to Vitest unit/integration tests, CLI/process checks, typecheck fixtures or package/static commands. Tests use real PostgreSQL, both drivers and owned schemas. No browser UI exists in M1.          |
| Real retesting          | PASS. Every M1 failure has a later observed pass. No status-only resolutions were found. Failed assumptions were corrected only after owner approval; INT-12's query was fixed against the bigint-order requirement. |
| Escalations             | PASS under repository override. No unresolved owner decisions or external ticket references remain on M1 cases. D-61/D-63/D-64/D-65 record approvals. No Slack/ClickUp message was sent.                             |
| Manual tests            | PASS for scope. No M1 case is manual-required. Docs/example live checks are future work, not silently marked complete.                                                                                               |
| Audit trail             | PASS. No retractions or removed attempts. The size-note correction and regex-claim clarification remain visible. Four explicit relay-delay todos are authorized by the task plan, not disabled failing tests.        |
| Attempts advisory       | Reviewed. TC-005 is a shared tooling case originating in M0; its separated failures cover setup/configuration and new-file formatting, with passing retests. No M1 case reached three consecutive failures.          |
| Agent/skill improvement | Recommendations below. No evidence requires changing the installed QA plugin or weakening tests.                                                                                                                     |

## Agent improvements

- Probe installed driver behavior and strict structural assignability early. The JSON serializer and optional-property mismatches were found by real tests and resolved through the required owner checkpoint.
- Derive SQL snapshots from the normative TRD and sort on source column types. Projecting a bigint as text must not accidentally change the test's ordering expression.
- Preserve exact metrics from tool output rather than transcribing from memory. Keep corrections append-only and distinguish a new run from an audit clarification.
- Verify language/runtime claims before describing a defensive test as a bug fix. The topic-regex clarification is recorded transparently in TC-041.
- Format generated reports before running the full gate sequence. This avoids counting a routine new-file formatting correction as a product test failure.

## Closure verdict

M1 is ready to close once the final report/test commit passes CI. Its implementation checks and all task-scoped tests pass. This verdict covers schema/migrations, adapters, enqueue and test-clock behavior; it does not assert relay guarantees, chaos safety, throughput, the full Node matrix or docs/example readiness. Stop before T-12 for the owner’s milestone review.
