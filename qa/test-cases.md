# M0 test cases

These cases are derived from PRD requirements, TRD sections and T-01..T-03 acceptance criteria before implementation. M0 is not complete. Only attempted checks appear in test-results.json.

The owner-decisions file controls the support matrix (PRD D-54). T-02’s PostgreSQL 18 acceptance clause is therefore pending reconciliation; no PostgreSQL 18 result is claimed.

| TC ID  | Task | PRD reference  | TRD test / acceptance reference | Title                                                            | Priority | Automatable |
| ------ | ---- | -------------- | ------------------------------- | ---------------------------------------------------------------- | -------- | ----------- |
| TC-001 | T-01 | FR-01          | A-01                            | npm ownership and package availability                           | High     | yes         |
| TC-002 | T-01 | FR-01; NFR-40  | A-07                            | Maintained dual-format build tool                                | High     | yes         |
| TC-003 | T-01 | NFR-40         | A-17                            | Compatible pinned development tools                              | High     | yes         |
| TC-004 | T-01 | FR-01; NFR-21  | T-01 acceptance; TRD 4.1        | Reproducible install with no runtime dependencies                | High     | yes         |
| TC-005 | T-01 | NFR-40         | T-01 acceptance; TRD 4.3/4.5    | Strict lint, formatting and type checking                        | High     | yes         |
| TC-006 | T-01 | FR-05; FR-07   | UT-15                           | Build-time version matches the package                           | High     | yes         |
| TC-007 | T-01 | FR-01; FR-04   | T-01 acceptance; TRD 4.1/4.2    | ESM, CJS and declarations exist for all entries                  | High     | yes         |
| TC-008 | T-02 | FR-92          | T-02 acceptance; TRD 16.7       | Local database services become healthy                           | High     | yes         |
| TC-009 | T-02 | FR-91; FR-92   | INT-08                          | Harness isolates schemas and cleans up its own data              | High     | yes         |
| TC-010 | T-02 | FR-92          | INT-08; T-02 acceptance         | Two harness runs remain isolated                                 | High     | yes         |
| TC-011 | T-02 | FR-92          | TRD 15.4; T-02 acceptance       | Database URL selects the intended server                         | High     | yes         |
| TC-012 | T-03 | NFR-21         | UT-16; TRD 16.6                 | G-1 accepts valid input and rejects a violation                  | High     | yes         |
| TC-013 | T-03 | NFR-03         | UT-16; TRD 16.6                 | G-2 accepts valid input and rejects a violation                  | High     | yes         |
| TC-014 | T-03 | NFR-05         | UT-16; TRD 16.6                 | G-3 accepts valid input and rejects a violation                  | High     | yes         |
| TC-015 | T-03 | FR-04          | UT-16; TRD 16.6                 | G-4 accepts valid input and rejects a violation                  | High     | yes         |
| TC-016 | T-03 | NFR-04         | UT-16; TRD 16.6                 | G-5 accepts valid input and rejects a violation                  | High     | yes         |
| TC-017 | T-03 | FR-84          | UT-16; TRD 16.6                 | G-6 accepts valid input and rejects a violation                  | High     | yes         |
| TC-018 | T-03 | NFR-21         | UT-16; TRD 16.6                 | G-7 accepts valid input and rejects a violation                  | High     | yes         |
| TC-019 | T-03 | FR-91          | UT-16; TRD 16.6                 | G-8 accepts valid input and rejects a violation                  | High     | yes         |
| TC-020 | T-03 | FR-96          | UT-16; TRD 19.1                 | Changeset policy handles source, exempt and local changes        | High     | yes         |
| TC-021 | T-03 | NFR-03; NFR-05 | T-03 acceptance                 | Live guard command reports a planted violation                   | High     | yes         |
| TC-022 | T-03 | FR-96          | T-03 acceptance; TRD 16.1/19.1  | GitHub static checks enforce and rerun the changeset rule        | High     | yes         |
| TC-023 | T-03 | FR-96          | A-10; TRD 19.1                  | Action pins and Changesets configuration match the specification | Medium   | yes         |

## TC-001: npm ownership and package availability

- Milestone: M0 Setup; task: T-01.
- PRD: FR-01; TRD/test reference: A-01.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: Owner has authenticated locally; registry is reachable.
- Steps: Run npm whoami, npm access list packages @firatkill, and npm view @firatkill/outbox.
- Expected result: Authenticated account is firatkill, scope access succeeds, and the unpublished package returns E404.

## TC-002: Maintained dual-format build tool

- Milestone: M0 Setup; task: T-01.
- PRD: FR-01; NFR-40; TRD/test reference: A-07.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: Registry and maintainer documentation are reachable.
- Steps: Read the build-tool maintainer notice and registry metadata; check the selected tool against A-07.
- Expected result: The specified build tool remains maintained, or the owner approves the documented fallback before adoption.

## TC-003: Compatible pinned development tools

- Milestone: M0 Setup; task: T-01.
- PRD: NFR-40; TRD/test reference: A-17.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-01 prerequisites and any fallback approval are satisfied.
- Steps: Resolve exact versions; inspect TypeScript, lint, docs and Vitest compatibility; run the configured unit project.
- Expected result: Versions are pinned; TypeScript is supported by the tools; Vitest projects run.

## TC-004: Reproducible install with no runtime dependencies

- Milestone: M0 Setup; task: T-01.
- PRD: FR-01; NFR-21; TRD/test reference: T-01 acceptance; TRD 4.1.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-01 tooling files exist.
- Steps: Run pnpm install --frozen-lockfile; inspect dependencies and optional peer metadata.
- Expected result: Install succeeds without lockfile changes; runtime dependencies are empty; pg and postgres are optional peers.

## TC-005: Strict lint, formatting and type checking

- Milestone: M0 Setup; task: T-01.
- PRD: NFR-40; TRD/test reference: T-01 acceptance; TRD 4.3/4.5.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-01 dependencies are installed.
- Steps: Run pnpm lint and pnpm typecheck; inspect strict flags and module-boundary rules.
- Expected result: Both commands pass; the required strict options and restrictions are enabled.

## TC-006: Build-time version matches the package

- Milestone: M0 Setup; task: T-01.
- PRD: FR-05; FR-07; TRD/test reference: UT-15.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-01 dependencies are installed.
- Steps: Run the unit smoke test; build; compare node dist/cli.js --version with package.json version.
- Expected result: VERSION and CLI version equal package.json version.

## TC-007: ESM, CJS and declarations exist for all entries

- Milestone: M0 Setup; task: T-01.
- PRD: FR-01; FR-04; TRD/test reference: T-01 acceptance; TRD 4.1/4.2.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-01 dependencies are installed.
- Steps: Build; check .js, .cjs, .d.ts and .d.cts for all six entries and cli.js; require pg.cjs and import pg.js.
- Expected result: All expected files exist and both pg entry-loading commands exit zero.

## TC-008: Local database services become healthy

- Milestone: M0 Setup; task: T-02.
- PRD: FR-92; TRD/test reference: T-02 acceptance; TRD 16.7.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: Docker is running; T-01 is complete. PostgreSQL 18 clauses require reconciliation to D-54.
- Steps: Check for competing runs; run pnpm db:up and docker compose ps; start the approved matrix services.
- Expected result: PostgreSQL 17 and Redis are healthy; the matrix follows OWNER-DECISIONS.md and D-54.

## TC-009: Harness isolates schemas and cleans up its own data

- Milestone: M0 Setup; task: T-02.
- PRD: FR-91; FR-92; TRD/test reference: INT-08.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: Local PostgreSQL is healthy; no competing test run is using the database.
- Steps: Run harness.test.ts for both drivers; write a table in one unique schema and inspect a second unique schema; invoke cleanup.
- Expected result: Data and tables do not leak between schemas; cleanup removes only the schemas created by the test.

## TC-010: Two harness runs remain isolated

- Milestone: M0 Setup; task: T-02.
- PRD: FR-92; TRD/test reference: INT-08; T-02 acceptance.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-02 harness passes alone. This controlled pair is the explicit T-02 exception to the no-competing-runs rule.
- Steps: Confirm the database is otherwise idle; start exactly two integration runs together as required by T-02; capture both exit codes.
- Expected result: Both runs pass without naming collisions or cross-run assertions.

## TC-011: Database URL selects the intended server

- Milestone: M0 Setup; task: T-02.
- PRD: FR-92; TRD/test reference: TRD 15.4; T-02 acceptance.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: Approved matrix services are healthy; no unrelated run is active.
- Steps: Run integration with TEST_DATABASE_URL pointing to each approved local matrix server; inspect reported server_version.
- Expected result: Each run uses the requested PostgreSQL server and passes.

## TC-012: G-1 accepts valid input and rejects a violation

- Milestone: M0 Setup; task: T-03.
- PRD: NFR-21; TRD/test reference: UT-16; TRD 16.6.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-03 guards and their fixture tests exist.
- Steps: Run the guard fixtures with a package with empty dependencies; repeat with a package with a runtime dependency.
- Expected result: Valid input passes; violation fails with G-1, file, line and a diagnostic.

## TC-013: G-2 accepts valid input and rejects a violation

- Milestone: M0 Setup; task: T-03.
- PRD: NFR-03; TRD/test reference: UT-16; TRD 16.6.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-03 guards and their fixture tests exist.
- Steps: Run the guard fixtures with relay code using autocommit query; repeat with relay code calling .transaction(.
- Expected result: Valid input passes; violation fails with G-2, file, line and a diagnostic.

## TC-014: G-3 accepts valid input and rejects a violation

- Milestone: M0 Setup; task: T-03.
- PRD: NFR-05; TRD/test reference: UT-16; TRD 16.6.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-03 guards and their fixture tests exist.
- Steps: Run the guard fixtures with Date.now in uuid.ts and new Date in row.ts; repeat with Date.now/new Date in non-allowlisted core or adapter files, including the wrong operation in each allowlisted file.
- Expected result: Valid input passes; violation fails with G-3, file, line and a diagnostic.

## TC-015: G-4 accepts valid input and rejects a violation

- Milestone: M0 Setup; task: T-03.
- PRD: FR-04; TRD/test reference: UT-16; TRD 16.6.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-03 guards and their fixture tests exist.
- Steps: Run the guard fixtures with dynamic driver import in cli.ts; repeat with static driver import in src or dynamic driver import outside cli.ts.
- Expected result: Valid input passes; violation fails with G-4, file, line and a diagnostic.

## TC-016: G-5 accepts valid input and rejects a violation

- Milestone: M0 Setup; task: T-03.
- PRD: NFR-04; TRD/test reference: UT-16; TRD 16.6.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-03 guards and their fixture tests exist.
- Steps: Run the guard fixtures with SQL using {{tokens}}; repeat with SQL or numbered migration containing ${.
- Expected result: Valid input passes; violation fails with G-5, file, line and a diagnostic.

## TC-017: G-6 accepts valid input and rejects a violation

- Milestone: M0 Setup; task: T-03.
- PRD: FR-84; TRD/test reference: UT-16; TRD 16.6.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-03 guards and their fixture tests exist.
- Steps: Run the guard fixtures with console in cli.ts or emitter.ts; repeat with console elsewhere in src.
- Expected result: Valid input passes; violation fails with G-6, file, line and a diagnostic.

## TC-018: G-7 accepts valid input and rejects a violation

- Milestone: M0 Setup; task: T-03.
- PRD: NFR-21; TRD/test reference: UT-16; TRD 16.6.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-03 guards and their fixture tests exist.
- Steps: Run the guard fixtures with publisher imports from the four allowed modules; repeat with publisher imports from any other module.
- Expected result: Valid input passes; violation fails with G-7, file, line and a diagnostic.

## TC-019: G-8 accepts valid input and rejects a violation

- Milestone: M0 Setup; task: T-03.
- PRD: FR-91; TRD/test reference: UT-16; TRD 16.6.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-03 guards and their fixture tests exist.
- Steps: Run the guard fixtures with ordinary tests; repeat with a focused .only( test.
- Expected result: Valid input passes; violation fails with G-8, file, line and a diagnostic.

## TC-020: Changeset policy handles source, exempt and local changes

- Milestone: M0 Setup; task: T-03.
- PRD: FR-96; TRD/test reference: UT-16; TRD 19.1.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-03 guard fixture tests exist.
- Steps: Exercise source changes with and without a changeset; docs-only changes; no-changeset label; local execution without GITHUB_BASE_REF.
- Expected result: Unexempted source changes without a changeset fail; the other specified cases pass.

## TC-021: Live guard command reports a planted violation

- Milestone: M0 Setup; task: T-03.
- PRD: NFR-03; NFR-05; TRD/test reference: T-03 acceptance.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-03 implementation exists; no unrelated edits are overwritten.
- Steps: Run pnpm check:guards on the valid tree; create and stage a temporary src/core/x.ts static pg import; rerun; remove only the temporary fixture.
- Expected result: Clean tree passes; planted violation exits one with G-4; original tree is restored.

## TC-022: GitHub static checks enforce and rerun the changeset rule

- Milestone: M0 Setup; task: T-03.
- PRD: FR-96; TRD/test reference: T-03 acceptance; TRD 16.1/19.1.
- Priority: High; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: T-03 workflow is pushed; all local acceptance checks passed.
- Steps: Push the T-03 PR and inspect static checks; use a test PR with a source change but no changeset; add no-changeset and inspect the rerun.
- Expected result: Normal PR is green; missing changeset fails; label event reruns and passes.

## TC-023: Action pins and Changesets configuration match the specification

- Milestone: M0 Setup; task: T-03.
- PRD: FR-96; TRD/test reference: A-10; TRD 19.1.
- Priority: Medium; automatable: yes (owner authentication/approval is a prerequisite where stated).
- Preconditions: GitHub is reachable and T-03 configuration exists.
- Steps: Verify current action major tags against their official releases; inspect config.json and the initial static workflow.
- Expected result: Verified action majors are used; Changesets uses main/public, no automatic local commit, and the specified GitHub changelog.
