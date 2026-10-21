# M0 QA milestone review

Date: 2026-10-21. Reviewed after [the milestone report](m0-report.md), following qa-milestone-docs and qa-milestone-review with AGENTS.md overrides.

| Review item             | Verdict and evidence                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger integrity        | PASS. The installed plugin's `check-qa-ledger.sh qa/test-results.json` passed all checks with 24 cases, including append-only history. No advisory flags.                                                                                                                                                                       |
| Coverage                | PASS for M0. An independent ID comparison found exactly 24 unique designed cases and 24 ledger cases; all latest attempts pass. The report distinguishes setup coverage from unimplemented product requirements.                                                                                                                |
| Automation              | PASS for M0. UT-15 covers version; UT-16 has 22 guard/config-policy checks; UT-17 has three helper checks; INT-08 has four driver/schema checks. Environment, build, live-guard and CI cases were executed as acceptance commands, not Playwright tests. Registry authentication and owner approval remain human prerequisites. |
| Real retesting          | PASS. TC-001/002/005/008/009/011 retain failures and subsequent observed passes. All failure attempts have a later pass. TC-005's backfill is explicitly identified, not represented as a new regression.                                                                                                                       |
| Escalations             | PASS under repository override. No unresolved escalation. Historical owner references remain on TC-001/002 after resolution to preserve the audit trail; D-56 records the answer. No external ticket or message was created.                                                                                                    |
| Manual cases            | PASS for this scope. None was designed or escalated as manual-required in M0; docs/example live checks remain future work.                                                                                                                                                                                                      |
| Audit trail             | PASS. No retractions; no case or attempt removed. Backfilled entries explain their source. Expected negative CI and guard tests are reported as successful rejection checks.                                                                                                                                                    |
| Attempts advisory       | PASS. No case has three failed attempts; the ledger checker reported no advisories.                                                                                                                                                                                                                                             |
| Agent/skill improvement | Action recorded below. No product defect remains open in M0.                                                                                                                                                                                                                                                                    |

## Agent improvement notes

- Retrieve compressed tool outputs before relying on their contents. Preserve command exit codes and session IDs; a command being launched is not evidence it passed.
- Record results immediately after each run. The local recording helper's multiline-title parsing error delayed some T-01/T-02 entries; it was corrected and entries were backfilled transparently from retained logs.
- Resolve skill paths after plugin moves. The original ledger script path disappeared during this session; the current plugin script was located and successfully rerun before T-03 and at milestone close.
- Query the administrative database before testing creation of a fresh test database. A preflight must not depend on the object the harness is meant to create.
- Keep environment-specific workarounds repository-local. The npm cache and public-image Docker configuration did not alter shared configuration.

These are agent execution improvements. The evidence does not justify changing the QA plugin or weakening product tests.

## Closure verdict

Ready to close M0. Local acceptance and the combined-tree PR static CI gate pass. The report states all unverified later-milestone checks. Stop before T-04 for the owner's milestone review; no new owner decision is pending.
