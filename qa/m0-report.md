# M0 Setup — milestone QA report

Date: 2026-10-21. Scope: T-01 repository/tooling, T-02 local databases/harness, T-03 static CI/guards/Changesets. Implementation commits: `99f3421`, `d1a70eb`, `1f50dd1`.

## Evidence and result

All 24 designed M0 cases are resolved. The final local suite passed 26 unit tests and 4 integration checks. Both drivers passed the harness on PostgreSQL 14, 16 and 17; two concurrent PostgreSQL 17 harness runs both passed. Activity preflights found zero other connections. These are harness checks, not proof of transactional-outbox guarantees.

Frozen installation, lint, strict type checking, all eight guards, the dual-format build, entry-point declarations, CLI version and ESM/CJS load checks passed. The live staged G-4 fixture was rejected and removed. [Unlabeled PR run](https://github.com/firatkill/outbox/actions/runs/39564875894) failed at the changeset rule as intended; [label-triggered rerun](https://github.com/firatkill/outbox/actions/runs/39565227105) passed the full static job, including 26 unit tests and build. This combined-tree CI gate closes the bootstrap sequencing exception in PRD D-58.

## Resolved

Each row refers to the matching `tc_reference` in [the append-only results ledger](test-results.json). Detailed steps and requirement references remain in [the case design](test-cases.md).

| Case   | Title                                                            | Current status   |
| ------ | ---------------------------------------------------------------- | ---------------- |
| TC-001 | npm ownership and package availability                           | Passed; resolved |
| TC-002 | Maintained dual-format build tool                                | Passed; resolved |
| TC-003 | Compatible pinned development tools                              | Passed; resolved |
| TC-004 | Reproducible install with no runtime dependencies                | Passed; resolved |
| TC-005 | Strict lint, formatting and type checking                        | Passed; resolved |
| TC-006 | Build-time version matches the package                           | Passed; resolved |
| TC-007 | ESM, CJS and declarations exist for all entries                  | Passed; resolved |
| TC-008 | Local database services become healthy                           | Passed; resolved |
| TC-009 | Harness isolates schemas and cleans up its own data              | Passed; resolved |
| TC-010 | Two harness runs remain isolated                                 | Passed; resolved |
| TC-011 | Database URL selects the intended server                         | Passed; resolved |
| TC-012 | G-1 accepts valid input and rejects a violation                  | Passed; resolved |
| TC-013 | G-2 accepts valid input and rejects a violation                  | Passed; resolved |
| TC-014 | G-3 accepts valid input and rejects a violation                  | Passed; resolved |
| TC-015 | G-4 accepts valid input and rejects a violation                  | Passed; resolved |
| TC-016 | G-5 accepts valid input and rejects a violation                  | Passed; resolved |
| TC-017 | G-6 accepts valid input and rejects a violation                  | Passed; resolved |
| TC-018 | G-7 accepts valid input and rejects a violation                  | Passed; resolved |
| TC-019 | G-8 accepts valid input and rejects a violation                  | Passed; resolved |
| TC-020 | Changeset policy handles source, exempt and local changes        | Passed; resolved |
| TC-021 | Live guard command reports a planted violation                   | Passed; resolved |
| TC-022 | GitHub static checks enforce and rerun the changeset rule        | Passed; resolved |
| TC-023 | Action pins and Changesets configuration match the specification | Passed; resolved |
| TC-024 | Harness wait and deferred helpers                                | Passed; resolved |

## Pending decision

None. npm authentication and the maintained-build-tool assumption were resolved by the owner (PRD D-56). The existing owner support matrix controls (D-54).

## Manual test required

None in M0. Docs-site and example live checks are later milestones; no human UI pass is claimed here.

## Regressions and audit trail

No case has `regression_of` set, and none was retracted or deleted. TC-005 contains a retrospectively logged T-01 typecheck failure followed by its actual passing retest; this is not a newly observed regression. Early T-01/T-02 records were backfilled from retained command logs after fixing the local recording helper. Historical owner-escalation references on TC-001/002 are retained under the AGENTS.md override; no ClickUp or Slack task was created.

## Root cause groups

No `root_cause_group` clusters are recorded. Resolved setup failures concerned authentication, tool maintenance, TypeScript/lint corrections, Docker credential-helper access, and a database preflight aimed at a database not yet created. No test was skipped, weakened or deleted to pass.

## Requirement coverage and limits

M0 has no numbered AC-N acceptance criteria. The case references are FR/NFRs plus TRD test/assumption IDs and task acceptance commands. Every designed case has a passing result, but a passing setup case does not establish an entire product requirement.

| Requirement area          | M0 verification                                                                                      | Remaining scope                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| FR-01/04/05/07; NFR-21/40 | Toolchain, zero runtime dependencies, six build entries, version and import/declaration smoke checks | Functional exports, package validation and supported-runtime CI matrix |
| FR-91/92                  | Real PostgreSQL harness, both drivers, schema isolation, cleanup, URL overrides and bounded waits    | Full integration suite and guarantee coverage                          |
| NFR-03/04/05; FR-84       | Static guard positive/negative fixtures and live rejection                                           | Relay, SQL renderer, database clock and emitter behavior               |
| FR-96                     | Changesets configuration and static CI, including missing-changeset rejection and label rerun        | Full CI matrix and release automation                                  |

GU-01..GU-09, migrations, enqueue/relay/inbox behavior, chaos, coverage thresholds, package size/publint/attw, docs builds, examples, benchmarks and deployment are not verified in M0. The tasks implementing those systems have not started. Node 22 is the verified build runtime; no Node 20/24 runtime-matrix result is claimed. PostgreSQL 18 is outside the current owner-approved matrix. Nothing has been published to npm or deployed to Vercel.
