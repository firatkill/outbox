# M3 QA milestone review

Date: 2026-10-21. Performed after [the milestone report](m3-report.md), using qa-milestone-review and AGENTS.md overrides.

| Review item       | Verdict and evidence                                                                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ledger integrity  | PASS. The integrity checker passes; all 115 ledger cases have passing latest attempts. Historical failures remain append-only.                                                                                                                                                                               |
| Coverage          | PASS for M3. Mechanical comparison found 13 designed cases, 13 ledger entries and 13 automated cases, with none missing or extra. The report maps FR-45..FR-52, FR-81, FR-87 and D-71; future guarantee evidence is explicit.                                                                                |
| Automation        | PASS. Both drivers run against isolated PostgreSQL schemas. The built CLI is exercised as a process. INT-37's 100000-row plans pass on PG14/16/17.                                                                                                                                                           |
| Real retesting    | PASS. Fixture errors and static issues have observed passing retests. Timeout failures passed unchanged on targeted retests and the final standard four-worker full run. No status-only resolutions.                                                                                                         |
| Escalations       | PASS under repository override. D-71/D-72 record explicit owner approvals. No unresolved decision, no Slack/ClickUp delivery, and no external service creation.                                                                                                                                              |
| Manual checks     | PASS for scope. M3 has no manual-only cases. Docs-site/example live checks remain future work.                                                                                                                                                                                                               |
| Audit trail       | PASS. No removed cases or attempts, no unexplained retractions. The report distinguishes confirmed driver behavior from unconfirmed host contention.                                                                                                                                                         |
| Attempts advisory | Reviewed TC-005 (8 historical failures), TC-067 (6 across size/tooling history) and TC-094 (5 across teardown, driver discovery and deadline history). Each is resolved with passing later attempts. M3 did not cross three consecutive failures on an individual case; passes separated the later failures. |
| CI and task gates | PASS for implementation: T-21 static and PostgreSQL jobs passed in run 39631946088. Final report-commit CI remains required before merge. Local static/build/package/size gates and standard full tests pass.                                                                                                |

## Agent improvements

- Verify that scripted edits were written before starting a retest. One failed edit script caused an avoidable unchanged rerun of the fixture errors.
- Use the public enqueue result contract and seed generated identity sequences before inserts; do not mutate generated-always values in fixtures.
- Distinguish library query errors from driver-internal connection initialization. Preserve unhandled-rejection detection; do not make a broad default-pool resilience claim from the approved fault fixture.
- Treat host contention as a hypothesis until proven. Do not infer effective worker settings from a CLI flag when a project has its own configuration. The final standard-command run, not the diagnostic flag, establishes acceptance here.
- Retain failed observations even after successful unchanged retests. No installed skill changes or weaker assertions are warranted.

## Closure verdict

M3 is ready to close once the final documentation commit passes CI. The report preserves the postgres.js default type-discovery limitation, unconfirmed local timeout cause and deferred gates. Stop before T-22 for owner review.
