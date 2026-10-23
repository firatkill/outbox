# M0 test cases

These cases are derived from PRD requirements, TRD sections and T-01..T-03 acceptance criteria before implementation. M0 acceptance is complete. Execution evidence and historical failures are retained in test-results.json.

The owner-decisions file controls the support matrix (PRD D-54). T-02’s PostgreSQL 18 acceptance clause has been reconciled to that decision; no PostgreSQL 18 result is claimed.

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
| TC-024 | T-02 | FR-91          | UT-17; TRD 15.4                 | Harness wait and deferred helpers                                | High     | yes         |

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
- Preconditions: Docker is running; T-01 is complete. Matrix clauses have been reconciled to D-54.
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

## TC-024: Harness wait and deferred helpers

- Milestone: M0 Setup; task: T-02.
- PRD: FR-91; TRD/test reference: UT-17; TRD 15.4.
- Priority: High; automatable: yes.
- Preconditions: T-02 helpers exist.
- Steps: Use fake timers to exercise a satisfied condition, a default timeout, filtered events, subscription cleanup, and deferred resolution/rejection.
- Expected result: Waits resolve only on the expected condition/event and time out at the default 3000 ms; event listeners are removed; deferred values and errors propagate.

# M1 Schema, enqueue, migrations

Designed before M1 implementation from PRD FR-02..FR-27, FR-86, NFR-04/13 and TRD 5–9, 11, 12.3, 15. Each case is automated with Vitest or the named acceptance command. Later relay-dependent assertions remain explicitly deferred by the plan.

| TC ID  | Task                                        | PRD reference              | TRD reference                         | Title                                         | Priority | Automatable | Expected result                                                                                                                                          |
| ------ | ------------------------------------------- | -------------------------- | ------------------------------------- | --------------------------------------------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-025 | T-04                                        | FR-10; NFR-04              | UT-03                                 | Configuration defaults and names              | High     | yes         | Defaults match TRD 5.1; names are qualified and quoted; the channel is public.outbox_messages.                                                           |
| TC-026 | T-04                                        | FR-10; NFR-04              | UT-03                                 | Identifier validation boundaries              | High     | yes         | Only names matching the regex and length limits pass; invalid names report OUTBOX_CONFIG.                                                                |
| TC-027 | T-04                                        | FR-10                      | UT-03                                 | Config option boundaries and aggregate errors | High     | yes         | Every invalid option is reported in details.issues; valid limits and false notify are preserved.                                                         |
| TC-028 | T-04                                        | NFR-04; FR-10              | UT-04                                 | SQL token rendering and escaping              | High     | yes         | Snapshots match TRD 7.1; quote characters double; no token remains; unresolved tokens throw OUTBOX_INTERNAL.                                             |
| TC-029 | T-04                                        | FR-05; D-29                | UT-07                                 | Error branding and classification             | High     | yes         | Helpers use the shared symbol and code; cause/details are retained; retry and non-retryable classes are distinguished.                                   |
| TC-030 | T-04                                        | FR-05; D-29                | UT-07                                 | Last-error formatting                         | High     | yes         | Code or error name prefixes text; output is at most 2000 UTF-16 units with trailing ellipsis only when truncated.                                        |
| TC-031 | T-05                                        | FR-10; FR-11; FR-12; FR-13 | INT-01                                | Migration installation and idempotence        | High     | yes         | First applies version 1 initial, second applies none; catalog matches TRD 7 and schema version is 1/1.                                                   |
| TC-032 | T-05                                        | FR-13                      | INT-03                                | Changed migration checksum is rejected        | High     | yes         | OUTBOX_MIGRATION_CHECKSUM reports version 1; the runner does not repair the row.                                                                         |
| TC-033 | T-05                                        | FR-13                      | INT-04                                | Concurrent migration runners serialize        | High     | yes         | All resolve; exactly one applies initial and the version table contains one row.                                                                         |
| TC-034 | T-05                                        | FR-15; FR-16               | INT-06                                | Schema-version gate                           | High     | yes         | Missing version throws OUTBOX_NOT_MIGRATED with the command; version 1 and higher pass. Relay/stats coverage follows their tasks.                        |
| TC-035 | T-05                                        | FR-13                      | INT-07                                | Migration dry run                             | High     | yes         | SQL includes create table; no tables are created.                                                                                                        |
| TC-036 | T-06                                        | FR-14                      | INT-05                                | Exported migration script matches runner      | High     | yes         | Catalogs and version/checksum rows match.                                                                                                                |
| TC-037 | T-06                                        | FR-86                      | UT-12                                 | CLI options and usage errors                  | High     | yes         | Options match TRD 8.4; usage failures exit 2; help matches the documented interface.                                                                     |
| TC-038 | T-06                                        | FR-86                      | UT-12                                 | CLI password redaction                        | High     | yes         | Password becomes *** and never appears in reported errors.                                                                                               |
| TC-039 | T-06                                        | FR-14; FR-86               | UT-12; INT-90                         | CLI printed SQL and version delta             | High     | yes         | Print requires no connection, emits the specified headers, and from 1 excludes migration 1.                                                              |
| TC-040 | T-06                                        | FR-13; FR-86               | INT-90                                | CLI migration status and dry run              | High     | yes         | Exit codes and status formatting match TRD 8.4/15.3; dry-run creates nothing.                                                                            |
| TC-041 | T-07                                        | FR-21; FR-25               | UT-05                                 | Message field rules                           | High     | yes         | Valid inputs pass; invalid inputs include index/field/reason and reject extra properties.                                                                |
| TC-042 | T-07                                        | FR-25                      | UT-05                                 | JSON serializability and byte limits          | High     | yes         | Unserializable values are invalid; size uses UTF-8 bytes; excess bytes throw OUTBOX_PAYLOAD_TOO_LARGE.                                                   |
| TC-043 | T-07                                        | FR-20; FR-23; FR-25        | UT-05                                 | Batch limits and duplicate collapsing         | High     | yes         | Empty returns no work, 1000 passes, 1001 fails; only later identical pairs collapse to the first input.                                                  |
| TC-044 | T-07                                        | FR-22; D-51                | UT-06                                 | UUIDv7 monotonicity                           | High     | yes         | IDs remain unique and strictly increasing; first timestamp matches clock; overflow advance remains within the specified bound.                           |
| TC-045 | T-08                                        | FR-02; FR-04; FR-05        | INT-01; A-03                          | postgres.js migration adapter                 | High     | yes         | Migration checks pass, rows normalize, parameters cast, and declarations contain no driver imports.                                                      |
| TC-046 | T-08                                        | FR-04                      | UT-04                                 | Driver-neutral message row mapping            | High     | yes         | Dates, JSON, string sequence and numeric fields map exactly; wrong types throw OUTBOX_INTERNAL naming the column.                                        |
| TC-047 | T-09                                        | FR-03; FR-04               | INT-01; A-04                          | pg adapter parity                             | High     | yes         | Both drivers return equivalent results and driver-free declarations.                                                                                     |
| TC-048 | T-09                                        | FR-03                      | INT-80                                | pg transaction client release                 | High     | yes         | All clients are released; failed rollback destroys its client.                                                                                           |
| TC-049 | T-09                                        | FR-10                      | INT-02                                | Custom prefix isolation                       | High     | yes         | Objects are isolated; enqueue checks follow T-10 and relay isolation follows T-14.                                                                       |
| TC-050 | T-10                                        | FR-20; FR-21; FR-22; GU-01 | INT-10                                | Atomic committed enqueue                      | High     | yes         | Both rows exist; fields/defaults/time/UUIDv7 and returned ID match the specification.                                                                    |
| TC-051 | T-10                                        | FR-20; FR-26; GU-01        | INT-11                                | Rolled-back enqueue                           | High     | yes         | Neither row exists and no notification arrives.                                                                                                          |
| TC-052 | T-10                                        | FR-20; FR-22; NFR-13       | INT-12; A-05                          | Batch round trip and sequence order           | High     | yes         | 1000 uses one statement and preserves order; 1001 rejects before SQL.                                                                                    |
| TC-053 | T-10                                        | FR-23                      | INT-13                                | Dedupe scope and input order                  | High     | yes         | Repeated pairs return the existing ID/deduped true; different topics remain independent.                                                                 |
| TC-054 | T-10                                        | FR-23                      | INT-14                                | Concurrent dedupe commit and rollback         | High     | yes         | T2 waits; commit returns existing ID, rollback allows insertion; exactly one row remains.                                                                |
| TC-055 | T-10                                        | FR-25                      | INT-17                                | Invalid inputs send no SQL                    | High     | yes         | OUTBOX_INVALID_MESSAGE has index/field and statement count is zero.                                                                                      |
| TC-056 | T-10                                        | FR-25                      | INT-18                                | Payload size boundary against database        | High     | yes         | Oversize rejects with OUTBOX_PAYLOAD_TOO_LARGE; exact limit inserts.                                                                                     |
| TC-057 | T-10                                        | FR-20                      | INT-10b; A-19                         | Producer least-privilege role                 | High     | yes         | Insertion and E2 lookup succeed without an identity-sequence grant.                                                                                      |
| TC-058 | T-10                                        | FR-27                      | T-10 acceptance                       | Topic-map type safety                         | High     | yes         | Valid input compiles; wrong topic/payload is rejected by TypeScript.                                                                                     |
| TC-059 | T-11                                        | FR-17; FR-18               | INT-92                                | Clock install and restoration                 | High     | yes         | Install is idempotent; offset affects outbox time; uninstall restores select now() and removes the test table.                                           |
| TC-060 | T-11                                        | FR-17; FR-18               | INT-93                                | Clock transaction isolation                   | High     | yes         | Override affects only its transaction; other connections use the per-schema offset.                                                                      |
| TC-061 | T-11                                        | FR-24; GU-07               | INT-15                                | Relative delay and transaction-local claim    | High     | yes         | Delay is exactly 60 seconds; transaction-local claim is eligible while other connection remains before available_at. Relay-based assertions follow T-14. |
| TC-062 | T-11                                        | FR-24; GU-07               | INT-16                                | Absolute availability                         | High     | yes         | Stored timestamp equals the supplied instant to the millisecond. Relay no-early-delivery assertions follow T-14.                                         |
| TC-063 | T-04                                        | FR-10; NFR-04              | INT-09                                | Rendered SQL works with both drivers          | High     | yes         | Names address only the test-owned schema; parameter text is preserved as data.                                                                           |
| TC-064 | T-05                                        | FR-13                      | UT-18; TRD 8.1                        | Migration template checksum normalization     | High     | yes         | The hash matches the known vector and line-ending variants produce identical hashes.                                                                     |
| TC-065 | T-05                                        | FR-13                      | INT-01b; TRD 8.2/5.9                  | Failed migration rolls back its DDL           | High     | yes         | OUTBOX_MIGRATION_FAILED retains version and PostgreSQL cause; migration DDL rolls back and the existing table remains.                                   |
| TC-066 | T-06 and public-entry changes in T-08..T-11 | FR-01; FR-04; NFR-22       | TRD 4.4; AGENTS.md definition of done | Public package resolution checks              | High     | yes         | ESM/CJS and type resolution have no package warnings or errors.                                                                                          |
| TC-067 | T-06 and public-entry changes in T-08..T-11 | NFR-20                     | TRD 4.4; AGENTS.md definition of done | Public entry size budgets                     | High     | yes         | Every currently built entry remains within its specified min+brotli budget.                                                                              |

## TC-025: Configuration defaults and names

- Milestone: M1 Schema, enqueue, migrations; task: T-04.
- PRD: FR-10; NFR-04; TRD/test reference: UT-03.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Parse a config with a driver handle and no overrides; inspect all resolved options, names and channel.
- Expected result: Defaults match TRD 5.1; names are qualified and quoted; the channel is public.outbox_messages.

## TC-026: Identifier validation boundaries

- Milestone: M1 Schema, enqueue, migrations; task: T-04.
- PRD: FR-10; NFR-04; TRD/test reference: UT-03.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Try schema lengths 1/30/31, prefix 1/20/21, uppercase, hyphen, quote, empty, leading digit and valid underscores.
- Expected result: Only names matching the regex and length limits pass; invalid names report OUTBOX_CONFIG.

## TC-027: Config option boundaries and aggregate errors

- Milestone: M1 Schema, enqueue, migrations; task: T-04.
- PRD: FR-10; TRD/test reference: UT-03.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Try numeric limits, fractions, NaN, invalid notify, missing db and unknown options, including several invalid fields together.
- Expected result: Every invalid option is reported in details.issues; valid limits and false notify are preserved.

## TC-028: SQL token rendering and escaping

- Milestone: M1 Schema, enqueue, migrations; task: T-04.
- PRD: NFR-04; FR-10; TRD/test reference: UT-04.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Render all seven tokens for defaults and app_events/ob_; quote an embedded double quote; render an unknown or incomplete token.
- Expected result: Snapshots match TRD 7.1; quote characters double; no token remains; unresolved tokens throw OUTBOX_INTERNAL.

## TC-029: Error branding and classification

- Milestone: M1 Schema, enqueue, migrations; task: T-04.
- PRD: FR-05; D-29; TRD/test reference: UT-07.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Construct each error class and a separately branded object; check helpers with matching and differing codes, unbranded errors, null and primitives.
- Expected result: Helpers use the shared symbol and code; cause/details are retained; retry and non-retryable classes are distinguished.

## TC-030: Last-error formatting

- Milestone: M1 Schema, enqueue, migrations; task: T-04.
- PRD: FR-05; D-29; TRD/test reference: UT-07.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Format library errors, ordinary errors and primitive throws; test exactly 2000 and longer formatted strings.
- Expected result: Code or error name prefixes text; output is at most 2000 UTF-16 units with trailing ellipsis only when truncated.

## TC-031: Migration installation and idempotence

- Milestone: M1 Schema, enqueue, migrations; task: T-05.
- PRD: FR-10; FR-11; FR-12; FR-13; TRD/test reference: INT-01.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Migrate an empty isolated schema twice; inspect tables, columns, constraints, seven explicit indexes and migration checksum.
- Expected result: First applies version 1 initial, second applies none; catalog matches TRD 7 and schema version is 1/1.

## TC-032: Changed migration checksum is rejected

- Milestone: M1 Schema, enqueue, migrations; task: T-05.
- PRD: FR-13; TRD/test reference: INT-03.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Migrate, alter the checksum in the test-owned version row and migrate again.
- Expected result: OUTBOX_MIGRATION_CHECKSUM reports version 1; the runner does not repair the row.

## TC-033: Concurrent migration runners serialize

- Milestone: M1 Schema, enqueue, migrations; task: T-05.
- PRD: FR-13; TRD/test reference: INT-04.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Run five migrations concurrently on separate connections to one isolated schema.
- Expected result: All resolve; exactly one applies initial and the version table contains one row.

## TC-034: Schema-version gate

- Milestone: M1 Schema, enqueue, migrations; task: T-05.
- PRD: FR-15; FR-16; TRD/test reference: INT-06.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Check an empty schema through schemaVersion; after migration check the required version and an additive higher version.
- Expected result: Missing version throws OUTBOX_NOT_MIGRATED with the command; version 1 and higher pass. Relay/stats coverage follows their tasks.

## TC-035: Migration dry run

- Milestone: M1 Schema, enqueue, migrations; task: T-05.
- PRD: FR-13; TRD/test reference: INT-07.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Run dryRun on an empty schema and inspect the returned SQL and database catalog.
- Expected result: SQL includes create table; no tables are created.

## TC-036: Exported migration script matches runner

- Milestone: M1 Schema, enqueue, migrations; task: T-06.
- PRD: FR-14; TRD/test reference: INT-05.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Apply migrationSql as one script in schema A and runner in B; normalize names and compare columns, constraints, indexes and version/checksum rows.
- Expected result: Catalogs and version/checksum rows match.

## TC-037: CLI options and usage errors

- Milestone: M1 Schema, enqueue, migrations; task: T-06.
- PRD: FR-86; TRD/test reference: UT-12.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Parse every documented option, unknown commands/options and help/version; snapshot help.
- Expected result: Options match TRD 8.4; usage failures exit 2; help matches the documented interface.

## TC-038: CLI password redaction

- Milestone: M1 Schema, enqueue, migrations; task: T-06.
- PRD: FR-86; TRD/test reference: UT-12.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Redact postgres://u:secret@h/db in errors and inspect output.
- Expected result: Password becomes *** and never appears in reported errors.

## TC-039: CLI printed SQL and version delta

- Milestone: M1 Schema, enqueue, migrations; task: T-06.
- PRD: FR-14; FR-86; TRD/test reference: UT-12; INT-90.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Run migrate --print without a URL and with --from 1; compare output to migrationSql.
- Expected result: Print requires no connection, emits the specified headers, and from 1 excludes migration 1.

## TC-040: CLI migration status and dry run

- Milestone: M1 Schema, enqueue, migrations; task: T-06.
- PRD: FR-13; FR-86; TRD/test reference: INT-90.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Run built CLI migration, status, status --check before/after, and dry-run on an empty schema.
- Expected result: Exit codes and status formatting match TRD 8.4/15.3; dry-run creates nothing.

## TC-041: Message field rules

- Milestone: M1 Schema, enqueue, migrations; task: T-07.
- PRD: FR-21; FR-25; TRD/test reference: UT-05.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Exercise a passing and failing case for every field and each numeric/string/count boundary in TRD 5.2.
- Expected result: Valid inputs pass; invalid inputs include index/field/reason and reject extra properties.

## TC-042: JSON serializability and byte limits

- Milestone: M1 Schema, enqueue, migrations; task: T-07.
- PRD: FR-25; TRD/test reference: UT-05.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Encode undefined, BigInt, cycles, JSON scalars, exactly-at-limit payloads and multibyte ğ payloads.
- Expected result: Unserializable values are invalid; size uses UTF-8 bytes; excess bytes throw OUTBOX_PAYLOAD_TOO_LARGE.

## TC-043: Batch limits and duplicate collapsing

- Milestone: M1 Schema, enqueue, migrations; task: T-07.
- PRD: FR-20; FR-23; FR-25; TRD/test reference: UT-05.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Validate batches of 0/1000/1001 and repeated topic/dedupeKey pairs, including same key on different topics.
- Expected result: Empty returns no work, 1000 passes, 1001 fails; only later identical pairs collapse to the first input.

## TC-044: UUIDv7 monotonicity

- Milestone: M1 Schema, enqueue, migrations; task: T-07.
- PRD: FR-22; D-51; TRD/test reference: UT-06.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Generate 10000 IDs at a fixed injected clock; inspect format/version/variant/time; overflow counter and move clock backward.
- Expected result: IDs remain unique and strictly increasing; first timestamp matches clock; overflow advance remains within the specified bound.

## TC-045: postgres.js migration adapter

- Milestone: M1 Schema, enqueue, migrations; task: T-08.
- PRD: FR-02; FR-04; FR-05; TRD/test reference: INT-01; A-03.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Run migration acceptance through the real adapter; exercise multi-statement execution and cast JSON parameters; inspect built declarations.
- Expected result: Migration checks pass, rows normalize, parameters cast, and declarations contain no driver imports.

## TC-046: Driver-neutral message row mapping

- Milestone: M1 Schema, enqueue, migrations; task: T-08.
- PRD: FR-04; TRD/test reference: UT-04.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Map a complete SQL result row; replace each field with a wrong type in turn.
- Expected result: Dates, JSON, string sequence and numeric fields map exactly; wrong types throw OUTBOX_INTERNAL naming the column.

## TC-047: pg adapter parity

- Milestone: M1 Schema, enqueue, migrations; task: T-09.
- PRD: FR-03; FR-04; TRD/test reference: INT-01; A-04.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Run all adapter-relevant migration tests with both drivers; execute multistatements and check cast text/float8/int4 types.
- Expected result: Both drivers return equivalent results and driver-free declarations.

## TC-048: pg transaction client release

- Milestone: M1 Schema, enqueue, migrations; task: T-09.
- PRD: FR-03; TRD/test reference: INT-80.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Run 50 transactions, half throwing; inspect pool counts; force rollback failure on a checked-out client.
- Expected result: All clients are released; failed rollback destroys its client.

## TC-049: Custom prefix isolation

- Milestone: M1 Schema, enqueue, migrations; task: T-09.
- PRD: FR-10; TRD/test reference: INT-02.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Migrate isolated schemas with default and ob_ prefixes; inspect qualified objects and differing channels.
- Expected result: Objects are isolated; enqueue checks follow T-10 and relay isolation follows T-14.

## TC-050: Atomic committed enqueue

- Milestone: M1 Schema, enqueue, migrations; task: T-10.
- PRD: FR-20; FR-21; FR-22; GU-01; TRD/test reference: INT-10.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Insert a business row and enqueue all fields using the same transaction; commit and read both.
- Expected result: Both rows exist; fields/defaults/time/UUIDv7 and returned ID match the specification.

## TC-051: Rolled-back enqueue

- Milestone: M1 Schema, enqueue, migrations; task: T-10.
- PRD: FR-20; FR-26; GU-01; TRD/test reference: INT-11.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Listen on the channel, insert business row/enqueue and roll back; observe for 300 ms.
- Expected result: Neither row exists and no notification arrives.

## TC-052: Batch round trip and sequence order

- Milestone: M1 Schema, enqueue, migrations; task: T-10.
- PRD: FR-20; FR-22; NFR-13; TRD/test reference: INT-12; A-05.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Spy on a 1000-message enqueue and attempt 1001; check input order against seq on supported PostgreSQL versions.
- Expected result: 1000 uses one statement and preserves order; 1001 rejects before SQL.

## TC-053: Dedupe scope and input order

- Milestone: M1 Schema, enqueue, migrations; task: T-10.
- PRD: FR-23; TRD/test reference: INT-13.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Enqueue the same pair across transactions and twice within a batch; reuse its key on a different topic.
- Expected result: Repeated pairs return the existing ID/deduped true; different topics remain independent.

## TC-054: Concurrent dedupe commit and rollback

- Milestone: M1 Schema, enqueue, migrations; task: T-10.
- PRD: FR-23; TRD/test reference: INT-14.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Hold transaction T1 after enqueue; start conflicting T2, then release T1 by commit and separately by rollback.
- Expected result: T2 waits; commit returns existing ID, rollback allows insertion; exactly one row remains.

## TC-055: Invalid inputs send no SQL

- Milestone: M1 Schema, enqueue, migrations; task: T-10.
- PRD: FR-25; TRD/test reference: INT-17.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Run the invalid UT-05 input set with a spy transaction executor.
- Expected result: OUTBOX_INVALID_MESSAGE has index/field and statement count is zero.

## TC-056: Payload size boundary against database

- Milestone: M1 Schema, enqueue, migrations; task: T-10.
- PRD: FR-25; TRD/test reference: INT-18.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Configure 1024 bytes; enqueue 1025-byte and 1024-byte JSON payloads.
- Expected result: Oversize rejects with OUTBOX_PAYLOAD_TOO_LARGE; exact limit inserts.

## TC-057: Producer least-privilege role

- Milestone: M1 Schema, enqueue, migrations; task: T-10.
- PRD: FR-20; TRD/test reference: INT-10b; A-19.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Create a unique test role with schema usage, table insert/select and function execute only; enqueue and dedupe under set local role; clean up that role.
- Expected result: Insertion and E2 lookup succeed without an identity-sequence grant.

## TC-058: Topic-map type safety

- Milestone: M1 Schema, enqueue, migrations; task: T-10.
- PRD: FR-27; TRD/test reference: T-10 acceptance.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Type-check correct and incorrect topic/payload pairs including a reasoned @ts-expect-error.
- Expected result: Valid input compiles; wrong topic/payload is rejected by TypeScript.

## TC-059: Clock install and restoration

- Milestone: M1 Schema, enqueue, migrations; task: T-11.
- PRD: FR-17; FR-18; TRD/test reference: INT-92; TRD 11.3.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Install twice, set/advance/reset the offset, reject negative/non-finite offsets, inspect now, confirm schema isolation, uninstall and inspect pg_get_functiondef.
- Expected result: Install is idempotent; offset affects outbox time; uninstall restores select now() and removes the test table.

## TC-060: Clock transaction isolation

- Milestone: M1 Schema, enqueue, migrations; task: T-11.
- PRD: FR-17; FR-18; TRD/test reference: INT-93; TRD 11.3.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Use two connections; setLocal in one transaction and compare readings with the other connection and after commit.
- Expected result: Override affects only its transaction; other connections use the per-schema offset.

## TC-061: Relative delay and transaction-local claim

- Milestone: M1 Schema, enqueue, migrations; task: T-11.
- PRD: FR-24; GU-07; TRD/test reference: INT-15.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Enqueue a 60-second delay; inspect interval and run C1 directly with setLocal +61 seconds while another connection sees unready.
- Expected result: Delay is exactly 60 seconds; transaction-local claim is eligible while other connection remains before available_at. Relay-based assertions follow T-14.

## TC-062: Absolute availability

- Milestone: M1 Schema, enqueue, migrations; task: T-11.
- PRD: FR-24; GU-07; TRD/test reference: INT-16.
- Priority: High; automatable: yes.
- Preconditions: The task dependencies are complete; database cases use isolated test schemas and a quiet test database.
- Steps: Enqueue with availableAt based on test-clock now plus 5 seconds; read its timestamp.
- Expected result: Stored timestamp equals the supplied instant to the millisecond. Relay no-early-delivery assertions follow T-14.

## TC-063: Rendered SQL works with both drivers

- Milestone: M1 Schema, enqueue, migrations; task: T-04.
- PRD: FR-10; NFR-04; TRD/test reference: INT-09.
- Priority: High; automatable: yes.
- Preconditions: Isolated PostgreSQL schema; both drivers installed.
- Steps: Render custom qualified names; create a table and round-trip SQL-looking text through a parameter with each driver.
- Expected result: Names address only the test-owned schema; parameter text is preserved as data.

## TC-064: Migration template checksum normalization

- Milestone: M1 Schema, enqueue, migrations; task: T-05.
- PRD: FR-13; TRD/test reference: UT-18; TRD 8.1.
- Priority: High; automatable: yes.
- Preconditions: Migration checksum helper exists.
- Steps: Hash the known abc SHA-256 vector and equivalent CRLF/LF templates.
- Expected result: The hash matches the known vector and line-ending variants produce identical hashes.

## TC-065: Failed migration rolls back its DDL

- Milestone: M1 Schema, enqueue, migrations; task: T-05.
- PRD: FR-13; TRD/test reference: INT-01b; TRD 8.2/5.9.
- Priority: High; automatable: yes.
- Preconditions: Isolated schema with a deliberately conflicting messages table.
- Steps: Run migration and inspect the error, version rows, function and pre-existing table.
- Expected result: OUTBOX_MIGRATION_FAILED retains version and PostgreSQL cause; migration DDL rolls back and the existing table remains.

## TC-066: Public package resolution checks

- Milestone: M1 Schema, enqueue, migrations; task: T-06 and public-entry changes in T-08..T-11.
- PRD: FR-01; FR-04; NFR-22; TRD/test reference: TRD 4.4; AGENTS.md definition of done.
- Priority: High; automatable: yes.
- Preconditions: Current library build exists.
- Steps: Build and run publint plus attw node16-profile checks for all entry points.
- Expected result: ESM/CJS and type resolution have no package warnings or errors.

## TC-067: Public entry size budgets

- Milestone: M1 Schema, enqueue, migrations; task: T-06 and public-entry changes in T-08..T-11.
- PRD: NFR-20; TRD/test reference: TRD 4.4; AGENTS.md definition of done.
- Priority: High; automatable: yes.
- Preconditions: Current library build exists.
- Steps: Run size-limit on the built entry points with the TRD thresholds.
- Expected result: Every currently built entry remains within its specified min+brotli budget.

# M2 test cases

Designed from PRD 6.4/6.5 and TRD 5.4, 9.2–9.6, 12.3 and 15 before M2 code. Both adapters and isolated schemas apply to all database cases unless explicitly restricted. Staged future gates and integer count/millisecond validation are owner-approved in PRD D-66/D-67.

| TC ID  | Task | PRD reference               | TRD reference                   | Title                                    | Priority | Automatable | Expected result                                                                                                                                              |
| ------ | ---- | --------------------------- | ------------------------------- | ---------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-068 | T-12 | FR-45; FR-90                | UT-01                           | Backoff ceilings and overflow            | High     | yes         | No-jitter output is the floored capped exponential; overflow caps at max.                                                                                    |
| TC-069 | T-12 | FR-45; FR-90                | UT-01                           | Full jitter and input errors             | High     | yes         | Jitter is an integer in the inclusive ceiling range; invalid inputs throw RangeError.                                                                        |
| TC-070 | T-12 | FR-30; FR-34; FR-35         | UT-02                           | Relay defaults and numeric boundaries    | High     | yes         | Defaults match TRD 5.4; invalid values produce aggregated OUTBOX_CONFIG issues. Counts/milliseconds must be integers; retry.factor may be fractional (D-67). |
| TC-071 | T-12 | FR-30; FR-40                | UT-02                           | Delivery mode and option validation      | High     | yes         | Exactly one delivery target is required; handler mode forbids topics; invalid options are named in issues.                                                   |
| TC-072 | T-13 | FR-31                       | INT-21; TRD 9.2                 | Claims skip locked rows                  | High     | yes         | Four rows claim without waiting; the locked row remains pending until released.                                                                              |
| TC-073 | T-13 | FR-31; FR-32                | INT-94; TRD 9.2/9.3             | Claim and outcome statement contracts    | High     | yes         | Claim increments attempts and sets DB-time leases; only the matching in-flight attempt can complete.                                                         |
| TC-074 | T-13 | FR-32; FR-45; FR-48         | INT-95; TRD 9.3.2               | Fail statements retry or become dead     | High     | yes         | Retry schedules DB-time delay; terminal/exhausted rows become dead; stale outcomes change nothing.                                                           |
| TC-075 | T-13 | FR-33; FR-36                | INT-96; INT-97; TRD 9.6.1/9.6.2 | Reclaim and release statements           | High     | yes         | Reclaim makes rows ready or dead with expired-holder error; fenced release decrements attempts and clears leases.                                            |
| TC-076 | T-14 | FR-34; FR-38                | UT-08                           | Scheduler and polling backoff            | High     | yes         | Decisions follow TRD 9.5.1; idle intervals are 100,200,400,800,1600,2000,2000 and wake resets.                                                               |
| TC-077 | T-14 | FR-32; NFR-03               | UT-09                           | Group commit and drain                   | High     | yes         | Exactly one follow-up completion statement batches the 50 items; both buffers empty before drain resolves.                                                   |
| TC-078 | T-14 | FR-32; FR-38                | UT-09                           | Flush retry and expired outcomes         | High     | yes         | Items retry at front; expired items are dropped with one error event listing ids; missing result ids emit leaseLost.                                         |
| TC-079 | T-14 | FR-35; FR-47; FR-48         | UT-10                           | Delivery classification and timeout      | High     | yes         | Correct outcome/delay, aborted signal, freed slot and no late duplicate outcome or unhandled rejection.                                                      |
| TC-080 | T-14 | FR-30; FR-31; FR-32         | INT-20                          | End-to-end handler delivery              | High     | yes         | One matching handler call, attempt 1 and valid context; done row has completion time and cleared lease.                                                      |
| TC-081 | T-14 | FR-40                       | INT-27; INT-02                  | Topic and outbox isolation               | High     | yes         | Only subscribed topics delivered; c and the other outbox remain pending.                                                                                     |
| TC-082 | T-14 | FR-39                       | INT-28                          | Single-batch runOnce                     | High     | yes         | Counts are 10,10,5 with confirmed deliveries; started relay rejects runOnce.                                                                                 |
| TC-083 | T-14 | FR-24; FR-39                | INT-15; INT-16                  | Relay honors delayed availability        | High     | yes         | No early claim; each message claimed after its availability instant.                                                                                         |
| TC-084 | T-15 | FR-35; FR-47; FR-48         | INT-26; UT-10                   | Timeout abort and stored failure         | High     | yes         | Abort reason and last_error are OUTBOX_HANDLER_TIMEOUT; pending with approximately 1000ms delay and failed event.                                            |
| TC-085 | T-16 | FR-33; GU-04; GU-09         | INT-23                          | Process crash recovery                   | High     | yes         | Expired claim reclaimed and delivered at attempt 2; last_error names child holder.                                                                           |
| TC-086 | T-16 | FR-32; GU-04                | INT-24                          | Late completion fencing                  | High     | yes         | A emits leaseLost, no delivered event; B completion remains unchanged.                                                                                       |
| TC-087 | T-16 | FR-33; GU-09                | INT-25                          | Claim-before-delivery crash recovery     | High     | yes         | Reclaimed then delivered once by handler with attempts 2.                                                                                                    |
| TC-088 | T-17 | FR-15; FR-36                | INT-06                          | Relay schema prerequisite                | High     | yes         | Rejects OUTBOX_NOT_MIGRATED with migration command; state becomes stopped.                                                                                   |
| TC-089 | T-17 | FR-36                       | INT-70                          | Graceful drain stops claims              | High     | yes         | Drains 20, releases zero, leaves ten pending and no in-flight rows.                                                                                          |
| TC-090 | T-17 | FR-35; FR-36                | INT-71                          | Forced shutdown releases attempts        | High     | yes         | Returns within 1s, drained false/released five; handlers receive SHUTDOWN; attempts reset to zero.                                                           |
| TC-091 | T-17 | FR-37                       | INT-72                          | Single-use lifecycle and idempotent stop | High     | yes         | Invalid starts reject; repeated stops share result; idle stop drains immediately.                                                                            |
| TC-092 | T-17 | FR-37                       | INT-73                          | External signal stops relay              | High     | yes         | In-flight work drains and state becomes stopped.                                                                                                             |
| TC-093 | T-18 | FR-31; GU-02; GU-04; NFR-01 | INT-22                          | Concurrent relays divide deliveries      | High     | yes         | All done under 60s; each id handled once, attempts 1, each relay >=100; no leaseLost/reclaimed.                                                              |
| TC-094 | T-18 | FR-38                       | INT-29                          | Database reconnect resilience            | High     | yes         | Claim/flush errors emitted; relay survives; all done within 30s reconnect allowance.                                                                         |
| TC-095 | T-18 | FR-04; FR-31                | INT-81                          | Unprepared postgres.js queries           | High     | yes         | Delivery and concurrency scenarios pass without prepared statements.                                                                                         |
| TC-096 | T-18 | FR-04                       | INT-82                          | Driver-neutral claim mapping             | High     | yes         | seq is string, dates are Date, JSON matches and numeric values match.                                                                                        |
| TC-097 | T-18 | FR-30                       | INT-83                          | Relay pool override                      | High     | yes         | Relay statements use B.                                                                                                                                      |

## TC-068: Backoff ceilings and overflow

- Milestone: M2 Relay and leases; task: T-12.
- PRD: FR-45; FR-90; TRD/test reference: UT-01.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Compute attempts 1, 2, 10 and 2000; factor 1; base 0; fractional exponential ceilings.
- Expected result: No-jitter output is the floored capped exponential; overflow caps at max.

## TC-069: Full jitter and input errors

- Milestone: M2 Relay and leases; task: T-12.
- PRD: FR-45; FR-90; TRD/test reference: UT-01.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Use random 0 and 0.999999, 10000 seeded values, invalid attempts and invalid random outputs.
- Expected result: Jitter is an integer in the inclusive ceiling range; invalid inputs throw RangeError.

## TC-070: Relay defaults and numeric boundaries

- Milestone: M2 Relay and leases; task: T-12.
- PRD: FR-30; FR-34; FR-35; TRD/test reference: UT-02.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Resolve defaults and every numeric range endpoint; exercise outside bounds and cross-field limits.
- Expected result: Defaults match TRD 5.4; invalid values produce aggregated OUTBOX_CONFIG issues. Counts/milliseconds must be integers; retry.factor may be fractional (D-67).

## TC-071: Delivery mode and option validation

- Milestone: M2 Relay and leases; task: T-12.
- PRD: FR-30; FR-40; TRD/test reference: UT-02.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Try handlers, publisher, both, neither, empty/non-function handlers, filtered topics, unknown top-level and nested options.
- Expected result: Exactly one delivery target is required; handler mode forbids topics; invalid options are named in issues.

## TC-072: Claims skip locked rows

- Milestone: M2 Relay and leases; task: T-13.
- PRD: FR-31; TRD/test reference: INT-21; TRD 9.2.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Enqueue five messages, hold the first row lock in a separate transaction, claim before and after release.
- Expected result: Four rows claim without waiting; the locked row remains pending until released.

## TC-073: Claim and outcome statement contracts

- Milestone: M2 Relay and leases; task: T-13.
- PRD: FR-31; FR-32; TRD/test reference: INT-94; TRD 9.2/9.3.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Claim ready rows; inspect leases and attempts; complete with matching and mismatched holder/attempt; repeat after completion.
- Expected result: Claim increments attempts and sets DB-time leases; only the matching in-flight attempt can complete.

## TC-074: Fail statements retry or become dead

- Milestone: M2 Relay and leases; task: T-13.
- PRD: FR-32; FR-45; FR-48; TRD/test reference: INT-95; TRD 9.3.2.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Fail leased rows with ordinary, terminal and exhausted outcomes; try stale fences.
- Expected result: Retry schedules DB-time delay; terminal/exhausted rows become dead; stale outcomes change nothing.

## TC-075: Reclaim and release statements

- Milestone: M2 Relay and leases; task: T-13.
- PRD: FR-33; FR-36; TRD/test reference: INT-96; INT-97; TRD 9.6.1/9.6.2.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Advance clock beyond leases; reclaim with and without attempts exhausted; release matching and stale attempts.
- Expected result: Reclaim makes rows ready or dead with expired-holder error; fenced release decrements attempts and clears leases.

## TC-076: Scheduler and polling backoff

- Milestone: M2 Relay and leases; task: T-14.
- PRD: FR-34; FR-38; TRD/test reference: UT-08.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Table-test exit, free-slot thresholds, first/wake/full claims and partial/empty waits; run interval sequence.
- Expected result: Decisions follow TRD 9.5.1; idle intervals are 100,200,400,800,1600,2000,2000 and wake resets.

## TC-077: Group commit and drain

- Milestone: M2 Relay and leases; task: T-14.
- PRD: FR-32; NFR-03; TRD/test reference: UT-09.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Hold a fake complete statement while adding 50 completions; mix failures and await drain.
- Expected result: Exactly one follow-up completion statement batches the 50 items; both buffers empty before drain resolves.

## TC-078: Flush retry and expired outcomes

- Milestone: M2 Relay and leases; task: T-14.
- PRD: FR-32; FR-38; TRD/test reference: UT-09.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Inject statement failures and advance fake timers through error backoff and local lease estimates.
- Expected result: Items retry at front; expired items are dropped with one error event listing ids; missing result ids emit leaseLost.

## TC-079: Delivery classification and timeout

- Milestone: M2 Relay and leases; task: T-14.
- PRD: FR-35; FR-47; FR-48; TRD/test reference: UT-10.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Use fake timers with synchronous throws, terminal/retryable errors, delayed promises and timeout.
- Expected result: Correct outcome/delay, aborted signal, freed slot and no late duplicate outcome or unhandled rejection.

## TC-080: End-to-end handler delivery

- Milestone: M2 Relay and leases; task: T-14.
- PRD: FR-30; FR-31; FR-32; TRD/test reference: INT-20.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Enqueue full message; start handler relay; await delivered then stop.
- Expected result: One matching handler call, attempt 1 and valid context; done row has completion time and cleared lease.

## TC-081: Topic and outbox isolation

- Milestone: M2 Relay and leases; task: T-14.
- PRD: FR-40; TRD/test reference: INT-27; INT-02.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Enqueue a,b,c; run handler a and filtered publisher b; also run a relay on one of two outboxes.
- Expected result: Only subscribed topics delivered; c and the other outbox remain pending.

## TC-082: Single-batch runOnce

- Milestone: M2 Relay and leases; task: T-14.
- PRD: FR-39; TRD/test reference: INT-28.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Enqueue 25; call runOnce three times at batch size 10; try after start.
- Expected result: Counts are 10,10,5 with confirmed deliveries; started relay rejects runOnce.

## TC-083: Relay honors delayed availability

- Milestone: M2 Relay and leases; task: T-14.
- PRD: FR-24; FR-39; TRD/test reference: INT-15; INT-16.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Use relative 60-second and absolute 5-second availability; run before/after test-clock advances.
- Expected result: No early claim; each message claimed after its availability instant.

## TC-084: Timeout abort and stored failure

- Milestone: M2 Relay and leases; task: T-15.
- PRD: FR-35; FR-47; FR-48; TRD/test reference: INT-26; UT-10.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Run a 200ms timeout handler awaiting abort with 1200ms lease and deterministic 1000ms retry.
- Expected result: Abort reason and last_error are OUTBOX_HANDLER_TIMEOUT; pending with approximately 1000ms delay and failed event.

## TC-085: Process crash recovery

- Milestone: M2 Relay and leases; task: T-16.
- PRD: FR-33; GU-04; GU-09; TRD/test reference: INT-23.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Spawn relay child, wait for started row, SIGKILL, advance 6000ms, start second relay.
- Expected result: Expired claim reclaimed and delivered at attempt 2; last_error names child holder.

## TC-086: Late completion fencing

- Milestone: M2 Relay and leases; task: T-16.
- PRD: FR-32; GU-04; TRD/test reference: INT-24.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Hold A handler ignoring abort; advance 121000ms; B reclaims/completes; resolve A.
- Expected result: A emits leaseLost, no delivered event; B completion remains unchanged.

## TC-087: Claim-before-delivery crash recovery

- Milestone: M2 Relay and leases; task: T-16.
- PRD: FR-33; GU-09; TRD/test reference: INT-25.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Claim directly as ghost, advance beyond lease, start relay B.
- Expected result: Reclaimed then delivered once by handler with attempts 2.

## TC-088: Relay schema prerequisite

- Milestone: M2 Relay and leases; task: T-17.
- PRD: FR-15; FR-36; TRD/test reference: INT-06.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Start a relay in an unmigrated isolated schema.
- Expected result: Rejects OUTBOX_NOT_MIGRATED with migration command; state becomes stopped.

## TC-089: Graceful drain stops claims

- Milestone: M2 Relay and leases; task: T-17.
- PRD: FR-36; TRD/test reference: INT-70.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Start 20 deliveries taking 300ms; enqueue ten more after claimed; stop with 5000ms drain.
- Expected result: Drains 20, releases zero, leaves ten pending and no in-flight rows.

## TC-090: Forced shutdown releases attempts

- Milestone: M2 Relay and leases; task: T-17.
- PRD: FR-35; FR-36; TRD/test reference: INT-71.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Start five abort-aware handlers; stop with 200ms drain timeout.
- Expected result: Returns within 1s, drained false/released five; handlers receive SHUTDOWN; attempts reset to zero.

## TC-091: Single-use lifecycle and idempotent stop

- Milestone: M2 Relay and leases; task: T-17.
- PRD: FR-37; TRD/test reference: INT-72.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Start twice, stop twice, restart, and stop an idle relay.
- Expected result: Invalid starts reject; repeated stops share result; idle stop drains immediately.

## TC-092: External signal stops relay

- Milestone: M2 Relay and leases; task: T-17.
- PRD: FR-37; TRD/test reference: INT-73.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Start with AbortController signal, abort and await stopped.
- Expected result: In-flight work drains and state becomes stopped.

## TC-093: Concurrent relays divide deliveries

- Milestone: M2 Relay and leases; task: T-18.
- PRD: FR-31; GU-02; GU-04; NFR-01; TRD/test reference: INT-22.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: 10000 messages/10 topics, four pools and relays with 50 slots, handlers take random 0–2ms.
- Expected result: All done under 60s; each id handled once, attempts 1, each relay >=100; no leaseLost/reclaimed.

## TC-094: Database reconnect resilience

- Milestone: M2 Relay and leases; task: T-18.
- PRD: FR-38; TRD/test reference: INT-29.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Enqueue 2000; use a 5s lease, 4s handler timeout and 500ms reclaim interval; terminate only named relay backends every 200ms for 2s. Close test-owned pools after relay drain (D-70).
- Expected result: Claim/flush errors emitted; relay survives; all done within 30s reconnect allowance.

## TC-095: Unprepared postgres.js queries

- Milestone: M2 Relay and leases; task: T-18.
- PRD: FR-04; FR-31; TRD/test reference: INT-81.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Run INT-20 and reduced 1000-message INT-22 with prepare false.
- Expected result: Delivery and concurrency scenarios pass without prepared statements.

## TC-096: Driver-neutral claim mapping

- Milestone: M2 Relay and leases; task: T-18.
- PRD: FR-04; TRD/test reference: INT-82.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Compare full claimed message JS values through both drivers; listDead comparison is scheduled in T-20, stats in T-21 (D-66).
- Expected result: seq is string, dates are Date, JSON matches and numeric values match.

## TC-097: Relay pool override

- Milestone: M2 Relay and leases; task: T-18.
- PRD: FR-30; TRD/test reference: INT-83.
- Priority: High; automatable: yes.
- Preconditions: Unit harness, or isolated migrated PostgreSQL schema with both drivers and test clock where time advances are specified.
- Steps: Create outbox on pool A and relay on named pool B; observe backend statements.
- Expected result: Relay statements use B.

## TC-098: Synchronous listener isolation and subscription cleanup

- Milestone: M2 Relay and leases; task: T-14.
- PRD: FR-80; TRD/test reference: UT-14 (event subscriptions only); TRD 5.5. Console fallback remains T-27.
- Priority: High; automatable: yes.
- Preconditions: Relay emitter and unit harness.
- Steps: Attach multiple listeners, throw from one, observe the listener-phase error, then unsubscribe and remove listeners; throw from the error listener.
- Expected result: Other listeners still run synchronously; on returns an unsubscribe function; off removes the listener; error-listener exceptions do not recurse.

## TC-099: Capacity-bound delivery and released claim locks

- Milestone: M2 Relay and leases; task: T-14.
- PRD: FR-31; FR-34; NFR-03; TRD/test reference: INT-98; TRD 9.5.1–9.5.3.
- Priority: High; automatable: yes.
- Preconditions: Isolated schema, five ready messages, two relay slots, gated handlers.
- Steps: Start relay; wait for two handlers; inspect pending/in-flight counts; have handlers acquire their own row locks with NOWAIT; release their gate and await all deliveries.
- Expected result: Only two messages are in flight while blocked, maximum handler concurrency is two, no claim lock remains during delivery, and starts follow sequence order within each batch.

## TC-100: runOnce reports confirmed failure and dead counts

- Milestone: M2 Relay and leases; task: T-14.
- PRD: FR-32; FR-39; FR-47; FR-48; TRD/test reference: INT-99; TRD 9.3.2/9.6.3.
- Priority: High; automatable: yes.
- Preconditions: Isolated schema with retryable, terminal and exhausted messages.
- Steps: runOnce with a handler that throws ordinary or NonRetryableError as appropriate; inspect returned counts and database statuses.
- Expected result: Three claims, three failures, two dead, zero deliveries; only the non-exhausted ordinary failure remains pending.

## TC-101: Periodic full-batch reclaim and dead reporting

- Milestone: M2; task: T-16.
- PRD: FR-33; FR-47; GU-09; TRD/test reference: INT-100; TRD 9.6.1.
- Priority: High.
- Automatable: yes.
- Steps: Claim five ghost leases, one exhausted, then start a relay with reclaimBatchSize two. Advance database time past expiry and await recovery events.
- Expected result: Periodic reclamation visits all five once in batches of at most two; four are delivered with attempt two and one is dead with matching deadIds and dead event.

## TC-102: Bounded shutdown flush retries

- Milestone: M2; task: T-17.
- PRD: FR-36; GU-01; TRD/test reference: INT-101; UT-19; TRD 9.6.3 step 5.
- Priority: High.
- Automatable: yes.
- Steps: Fail the completion statement, stop without drain time, then advance database time beyond the retained lease and recover with a healthy relay.
- Expected result: Shutdown stops retrying after at most three retries one second apart; the unconfirmed message remains recoverable and completes at attempt two.

## M3 case summary

| TC     | PRD                 | TRD            | Priority | Automatable | Expected                                                                                                    |
| ------ | ------------------- | -------------- | -------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| TC-103 | FR-45; FR-48        | INT-30         | High     | yes         | Delays are 1000 and 2000 ms within 150 ms; failed events agree; success at attempt three retains the error. |
| TC-104 | FR-46; FR-47        | INT-31         | High     | yes         | Three failures, one dead event, dead timestamp and Error: boom; no further claim.                           |
| TC-105 | FR-47               | INT-32         | High     | yes         | Dead after one attempt with OUTBOX_NON_RETRYABLE stored.                                                    |
| TC-106 | FR-45; FR-47        | INT-33         | High     | yes         | First delay 5000; second clamped to maxDelayMs.                                                             |
| TC-107 | FR-46; FR-47; GU-03 | INT-34         | High     | yes         | Dead at attempt one; reclaimed.deadIds and dead event identify message.                                     |
| TC-108 | FR-49               | INT-35         | High     | yes         | Correct IDs become pending with zero attempts, cleared dead timestamp and retained error.                   |
| TC-109 | FR-51               | INT-36         | High     | yes         | Eleven done delete statements; recent and pending survive; deleted dedupe key reusable.                     |
| TC-110 | FR-50               | INT-38         | High     | yes         | Pending/dead skipped with previous status; other statuses reject; absent/malformed not found.               |
| TC-111 | FR-52               | INT-39; INT-82 | High     | yes         | Newest first; full neutral message shape with string sequence and decoded JSON/dates.                       |
| TC-112 | FR-81               | INT-37; INT-82 | High     | yes         | Exact counts, age within 50 ms, optional terminal counts; claim index used and S1 no message Seq Scan.      |
| TC-113 | FR-87               | INT-91         | High     | yes         | Valid JSON with terminal statistics and readable text output.                                               |
| TC-114 | FR-49..FR-52; D-71  | UT-20; INT-102 | High     | yes         | Invalid admin input rejects before SQL; driver errors retain context.                                       |
| TC-115 | FR-81; D-71         | INT-103        | High     | yes         | Missing schema guidance and stats input/error handling.                                                     |

## TC-103: Exponential retry and retained error

- Milestone: M3; task: T-19.
- PRD: FR-45; FR-48; TRD/test reference: INT-30.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated PostgreSQL schema, both drivers; test clock installed.
- Steps: Fail twice then succeed, advancing the test clock after each failure.
- Expected result: Delays are 1000 and 2000 ms within 150 ms; failed events agree; success at attempt three retains the error.

## TC-104: Exhausted retry budget

- Milestone: M3; task: T-19.
- PRD: FR-46; FR-47; TRD/test reference: INT-31.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated PostgreSQL schema, both drivers; test clock installed.
- Steps: Always throw boom with maxAttempts three; advance clock between runOnce calls.
- Expected result: Three failures, one dead event, dead timestamp and Error: boom; no further claim.

## TC-105: Non-retryable delivery

- Milestone: M3; task: T-19.
- PRD: FR-47; TRD/test reference: INT-32.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated PostgreSQL schema, both drivers; test clock installed.
- Steps: Throw NonRetryableError on first delivery.
- Expected result: Dead after one attempt with OUTBOX_NON_RETRYABLE stored.

## TC-106: Explicit retry delay and clamp

- Milestone: M3; task: T-19.
- PRD: FR-45; FR-47; TRD/test reference: INT-33.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated PostgreSQL schema, both drivers; test clock installed.
- Steps: Throw RetryableError with 5000 then 10000000 milliseconds.
- Expected result: First delay 5000; second clamped to maxDelayMs.

## TC-107: Exhausted crashed attempt

- Milestone: M3; task: T-19.
- PRD: FR-46; FR-47; GU-03; TRD/test reference: INT-34.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated PostgreSQL schema, both drivers; test clock installed.
- Steps: Ghost-claim maxAttempts one, advance beyond lease and reclaim.
- Expected result: Dead at attempt one; reclaimed.deadIds and dead event identify message.

## TC-108: Retry dead filters

- Milestone: M3; task: T-20.
- PRD: FR-49; TRD/test reference: INT-35.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated PostgreSQL schema, both drivers; test clock installed.
- Steps: Retry dead messages by topic, IDs, key and limit, then deliver.
- Expected result: Correct IDs become pending with zero attempts, cleared dead timestamp and retained error.

## TC-109: Batched retention and dedupe window

- Milestone: M3; task: T-20.
- PRD: FR-51; TRD/test reference: INT-36.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated PostgreSQL schema, both drivers; test clock installed.
- Steps: Purge 1050 old done rows in batches of 100, then include old dead rows.
- Expected result: Eleven done delete statements; recent and pending survive; deleted dedupe key reusable.

## TC-110: Skip status validation

- Milestone: M3; task: T-20.
- PRD: FR-50; TRD/test reference: INT-38.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated PostgreSQL schema, both drivers; test clock installed.
- Steps: Skip pending, dead, in-flight, done, absent and malformed IDs.
- Expected result: Pending/dead skipped with previous status; other statuses reject; absent/malformed not found.

## TC-111: Dead listing and driver mapping

- Milestone: M3; task: T-20.
- PRD: FR-52; TRD/test reference: INT-39; INT-82.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated PostgreSQL schema, both drivers; test clock installed.
- Steps: List dead messages with topic and limit including a sequence above 2^53.
- Expected result: Newest first; full neutral message shape with string sequence and decoded JSON/dates.

## TC-112: Indexed database-time statistics

- Milestone: M3; task: T-21.
- PRD: FR-81; TRD/test reference: INT-37; INT-82.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated PostgreSQL schema, both drivers; test clock installed.
- Steps: Measure known status mix; insert 100000 done rows, analyze and EXPLAIN claim and S1.
- Expected result: Exact counts, age within 50 ms, optional terminal counts; claim index used and S1 no message Seq Scan.

## TC-113: CLI stats output

- Milestone: M3; task: T-21.
- PRD: FR-87; TRD/test reference: INT-91.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated PostgreSQL schema, both drivers; test clock installed.
- Steps: Migrate then invoke CLI stats with JSON and text output.
- Expected result: Valid JSON with terminal statistics and readable text output.

## TC-114: Admin validation and driver errors

- Milestone: M3; task: T-20.
- PRD: FR-49..FR-52; D-71; TRD/test reference: UT-20; INT-102; TRD 5.3/5.9.
- Priority: High.
- Automatable: yes.
- Preconditions: Pure parser and migrated isolated schema, both drivers.
- Steps: Exercise defaults, every numeric boundary, invalid IDs, strings, booleans and unknown options; spy on SQL and inject a driver failure.
- Expected result: Approved codes and all option issues are returned before SQL; driver failures retain cause and statement.

## TC-115: Stats errors and option validation

- Milestone: M3; task: T-21.
- PRD: FR-81; D-71; TRD/test reference: INT-103; TRD 5.9/9.9.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated unmigrated schema, both drivers.
- Steps: Request stats before migration, pass an invalid option, then inject a non-schema database error.
- Expected result: OUTBOX_NOT_MIGRATED includes migration guidance; validation rejects before SQL; other driver errors preserve their cause.

# M4 test cases

Designed from the normative ordering and LISTEN requirements before M4 implementation.

| TC ID  | Task | PRD reference              | TRD test       | Title                                      | Priority | Automatable |
| ------ | ---- | -------------------------- | -------------- | ------------------------------------------ | -------- | ----------- |
| TC-116 | T-22 | FR-55..FR-57; GU-06        | INT-40         | Serial delivery per key                    | High     | yes         |
| TC-117 | T-22 | FR-55..FR-57; GU-06        | INT-42         | Backoff blocks only its key                | High     | yes         |
| TC-118 | T-22 | FR-55..FR-57; GU-06        | INT-43         | Dead head requires skip or retry           | High     | yes         |
| TC-119 | T-22 | FR-55..FR-57; GU-06        | INT-44         | Blocked keys do not block other work       | High     | yes         |
| TC-120 | T-22 | FR-55..FR-57; GU-06        | INT-45         | Ordering spans topic filters               | High     | yes         |
| TC-121 | T-23 | FR-55..FR-57; GU-06        | INT-41         | Ordering across four concurrent relays     | High     | yes         |
| TC-122 | T-24 | FR-26; FR-60..FR-63; GU-08 | INT-19         | Transactional enqueue notification         | High     | yes         |
| TC-123 | T-24 | FR-26; FR-60..FR-63; GU-08 | INT-52         | Listener reconnect recovery                | High     | yes         |
| TC-124 | T-24 | FR-26; FR-60..FR-63; GU-08 | INT-54         | Separate listen pool                       | High     | yes         |
| TC-125 | T-25 | FR-26; FR-60..FR-63; GU-08 | INT-50         | Notification wake latency                  | High     | yes         |
| TC-126 | T-25 | FR-26; FR-60..FR-63; GU-08 | INT-51         | Polling without notifications              | High     | yes         |
| TC-127 | T-25 | FR-26; FR-60..FR-63; GU-08 | INT-53         | Idle polling backoff                       | High     | yes         |
| TC-128 | T-24 | FR-61..FR-63               | UT-21; INT-104 | Listener opening failure and shutdown race | High     | yes         |

## TC-116: Serial delivery per key

- Milestone: M4; task: T-22.
- PRD: FR-55..FR-57; GU-06; TRD/test reference: INT-40; TRD 9.4/10/15.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both PostgreSQL adapters; task prerequisites complete.
- Steps: Key `k`: 5 messages in one batch; Relay(`ordering: 'key'`, `concurrency: 10`), handler records order and tracks in-flight count per key
- Expected result: Order equals `seq` order; max in-flight for `k` = 1

## TC-117: Backoff blocks only its key

- Milestone: M4; task: T-22.
- PRD: FR-55..FR-57; GU-06; TRD/test reference: INT-42; TRD 9.4/10/15.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both PostgreSQL adapters; task prerequisites complete.
- Steps: Key `k`: m1, m2. Handler fails m1 once (`baseDelayMs: 10000`); other key `j` has 3 messages
- Expected result: While m1 is in backoff, `runOnce` delivers `j` messages but not m2; after advancing 10 s, m1 then m2 delivered in order

## TC-118: Dead head requires skip or retry

- Milestone: M4; task: T-22.
- PRD: FR-55..FR-57; GU-06; TRD/test reference: INT-43; TRD 9.4/10/15.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both PostgreSQL adapters; task prerequisites complete.
- Steps: Key `k`: m1 (NonRetryable → dead), m2, m3. Variant A: `skip(m1)`. Variant B: `retryDead({ ids: [m1] })` with a handler that now succeeds
- Expected result: Before action: 3 runs claim nothing for `k`. A: m2, m3 delivered in order; m1 `skipped`. B: m1 delivered before m2, then m3

## TC-119: Blocked keys do not block other work

- Milestone: M4; task: T-22.
- PRD: FR-55..FR-57; GU-06; TRD/test reference: INT-44; TRD 9.4/10/15.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both PostgreSQL adapters; task prerequisites complete.
- Steps: Key `k` blocked by a dead head; 10 unkeyed and 10 messages on 10 other keys
- Expected result: All 20 delivered; `k` messages untouched

## TC-120: Ordering spans topic filters

- Milestone: M4; task: T-22.
- PRD: FR-55..FR-57; GU-06; TRD/test reference: INT-45; TRD 9.4/10/15.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both PostgreSQL adapters; task prerequisites complete.
- Steps: Key `order-1`: `order.created` then `order.paid` (two transactions, sequential); Relay A handles only `order.paid`, Relay B only `order.created`; A runs first
- Expected result: A claims nothing until B completed `order.created`

## TC-121: Ordering across four concurrent relays

- Milestone: M4; task: T-23.
- PRD: FR-55..FR-57; GU-06; TRD/test reference: INT-41; TRD 9.4/10/15.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both PostgreSQL adapters; task prerequisites complete.
- Steps: Own schema created inside the test, without the test clock (INV-08 compares `outbox_now()` with `clock_timestamp()`, so the offset must be 0 even if other tests in the file advanced theirs). 200 keys × 25 messages (5,000) plus 1,000 unkeyed, interleaved; 4 relays with `ordering: 'key'`, `concurrency: 20`, `batchSize: 20`, handler latency random 0–5 ms; wait for all done (timeout 60 s, comment: 6,000 deliveries with per-key serialisation)
- Expected result: For each key, the first-delivery start times follow `seq` order and each starts after the previous message's `completed_at`; max in-flight per key = 1 across all relays; unkeyed all delivered; INV-08 SQL returns 0 rows

## TC-122: Transactional enqueue notification

- Milestone: M4; task: T-24.
- PRD: FR-26; FR-60..FR-63; GU-08; TRD/test reference: INT-19; TRD 9.4/10/15.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both PostgreSQL adapters; task prerequisites complete.
- Steps: Listener connection; enqueue in a transaction and wait 200 ms before commit; then an outbox with `notify: false`
- Expected result: Notification arrives after commit, not before; one notification for a 10-message batch; none with `notify: false` and the statement text contains no `pg_notify` call path (spy shows `$2` = null)

## TC-123: Listener reconnect recovery

- Milestone: M4; task: T-24.
- PRD: FR-26; FR-60..FR-63; GU-08; TRD/test reference: INT-52; TRD 9.4/10/15.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both PostgreSQL adapters; task prerequisites complete.
- Steps: Listening relay; find its listen backend (`pg_stat_activity.query ilike 'listen%'`), `pg_terminate_backend`; then enqueue
- Expected result: `error` phase `listen` emitted (pg) or reconnect observed (postgres.js `onListen`); message delivered within 2 s; relay still running

## TC-124: Separate listen pool

- Milestone: M4; task: T-24.
- PRD: FR-26; FR-60..FR-63; GU-08; TRD/test reference: INT-54; TRD 9.4/10/15.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both PostgreSQL adapters; task prerequisites complete.
- Steps: Relay with `db` = pool A and `listen: { db: pool B }`
- Expected result: Listen backend belongs to pool B (`application_name`), statements to pool A; wake-up works

## TC-125: Notification wake latency

- Milestone: M4; task: T-25.
- PRD: FR-26; FR-60..FR-63; GU-08; TRD/test reference: INT-50; TRD 9.4/10/15.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both PostgreSQL adapters; task prerequisites complete.
- Steps: Relay(`listen: true`, `poll: { minIntervalMs: 5000, maxIntervalMs: 5000 }`); start; wait 300 ms for idle; 20 times: record `t0 = performance.now()` right after the enqueuing transaction commits, record `t1` at handler start, wait 100 ms
- Expected result: p50 (t1 − t0) ≤ 50 ms, max ≤ 500 ms (NFR-11)

## TC-126: Polling without notifications

- Milestone: M4; task: T-25.
- PRD: FR-26; FR-60..FR-63; GU-08; TRD/test reference: INT-51; TRD 9.4/10/15.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both PostgreSQL adapters; task prerequisites complete.
- Steps: Relay(`listen: false`, `poll: { minIntervalMs: 50, maxIntervalMs: 300 }`); idle 1 s; enqueue
- Expected result: Delivered within 1 s (`waitFor` 1000 ms)

## TC-127: Idle polling backoff

- Milestone: M4; task: T-25.
- PRD: FR-26; FR-60..FR-63; GU-08; TRD/test reference: INT-53; TRD 9.4/10/15.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both PostgreSQL adapters; task prerequisites complete.
- Steps: Relay(`listen: false`, `poll: { minIntervalMs: 100, maxIntervalMs: 1000 }`), spy executor counting claim statements; idle 3 s (comment: measuring idle backoff needs real time)
- Expected result: Claims between 4 and 9 (expected 100+200+400+800+1000... ≈ 6)

## TC-128: Listener opening failure and shutdown race

- Milestone: M4; task: T-24.
- PRD: FR-61..FR-63; TRD/test reference: UT-21; INT-104; TRD 9.6.3.
- Priority: High.
- Automatable: yes.
- Preconditions: Isolated migrated schema and both drivers.
- Steps: Fail the first listener opening, enqueue without notifications, and observe retry; separately stop during a pending opening and release it.
- Expected result: Polling remains running; error phase listen; retry wakes delivery; shutdown closes the late-opened handle exactly once.

# M5 — Inbox and publishers

| Case   | Requirement         | Behaviour                                                             | Priority | Automatable |
| ------ | ------------------- | --------------------------------------------------------------------- | -------- | ----------- |
| TC-129 | FR-75               | Inbox deduplication and consumer isolation (INT-60)                   | High     | yes         |
| TC-130 | FR-75; FR-76; GU-05 | Inbox rollback and retry (INT-61)                                     | High     | yes         |
| TC-131 | FR-76; GU-05        | Concurrent inbox duplicates (INT-62)                                  | High     | yes         |
| TC-132 | FR-75; GU-05        | Inbox effects survive relay redelivery (INT-63)                       | High     | yes         |
| TC-133 | FR-78               | Inbox retention uses database time (INT-64)                           | High     | yes         |
| TC-134 | FR-75               | Standalone consumer inbox (INT-65)                                    | High     | yes         |
| TC-135 | FR-80; FR-82..FR-84 | Tracer spans and listener isolation (INT-74)                          | High     | yes         |
| TC-136 | FR-83               | Rate-limited error fallback (INT-75)                                  | High     | yes         |
| TC-137 | FR-66; FR-67        | BullMQ retained job deduplication (INT-85)                            | High     | yes         |
| TC-138 | FR-68; FR-69        | Webhook outcomes and retries (INT-86)                                 | High     | yes         |
| TC-139 | FR-70               | Webhook wire signature verification (INT-87)                          | High     | yes         |
| TC-140 | FR-75; FR-77        | Inbox identifier validation and original transaction (UT-22; INT-105) | High     | yes         |
| TC-141 | FR-80; FR-83        | Emitter unsubscribe and fallback isolation (UT-14)                    | High     | yes         |
| TC-142 | FR-66; FR-67        | BullMQ configuration and queue resolution (UT-13)                     | High     | yes         |
| TC-143 | FR-68..FR-70        | Webhook fixed vectors and invalid requests (UT-11)                    | High     | yes         |

## TC-129: Inbox deduplication and consumer isolation

- Milestone: M5; task: T-26.
- PRD: FR-75; TRD/test reference: INT-60; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: `withInbox(tx, 'c1', 'm1', fn)` twice (two transactions), then with consumer `c2`
- Expected result: `processed` with `fn`'s result, then `duplicate` (fn not called), then `processed` for `c2`

## TC-130: Inbox rollback and retry

- Milestone: M5; task: T-26.
- PRD: FR-75; FR-76; GU-05; TRD/test reference: INT-61; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: Transaction: `withInbox` with `fn` that inserts an effect row then throws; transaction rolls back; retry
- Expected result: No inbox row and no effect after the first; second processes; one effect row

## TC-131: Concurrent inbox duplicates

- Milestone: M5; task: T-26.
- PRD: FR-76; GU-05; TRD/test reference: INT-62; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: 10 concurrent transactions (separate connections) each `withInbox(tx, 'c', 'm', fn inserting an effect, sleeping 50 ms)`
- Expected result: Exactly 1 `processed`, 9 `duplicate`; exactly 1 effect row

## TC-132: Inbox effects survive relay redelivery

- Milestone: M5; task: T-26.
- PRD: FR-75; GU-05; TRD/test reference: INT-63; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: Relay handler: `withInbox(tx, 'mailer', msg.id, insert effect)`. Force a redelivery with the INT-24 pattern (A's handler commits its inbox transaction, then A loses its lease; B redelivers)
- Expected result: Two deliveries, one effect row; B's `withInbox` returned `duplicate`

## TC-133: Inbox retention uses database time

- Milestone: M5; task: T-26.
- PRD: FR-78; TRD/test reference: INT-64; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: 3 old inbox rows (advance clock 8 days), 2 recent; `purgeInbox({ olderThanMs: 7 days })`
- Expected result: Deletes 3

## TC-134: Standalone consumer inbox

- Milestone: M5; task: T-26.
- PRD: FR-75; TRD/test reference: INT-65; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: `createInbox({ db, schema: 'consumer_x' })` in a different schema than the outbox; migrate it; `withInbox`
- Expected result: Row lands in `consumer_x.outbox_inbox`; works without any outbox messages table being used

## TC-135: Tracer spans and listener isolation

- Milestone: M5; task: T-27.
- PRD: FR-80; FR-82..FR-84; TRD/test reference: INT-74; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: Fake tracer recording spans; listeners for every event, one `delivered` listener that throws; deliver 3 (one fails once)
- Expected result: Spans `outbox claim`, `outbox deliver` ×4, `outbox flush` with attributes from §14.2; deliver span for the failure ended with `error` and `recordException`; the throwing listener produced `error` phase `listener`; all 3 delivered

## TC-136: Rate-limited error fallback

- Milestone: M5; task: T-27.
- PRD: FR-83; TRD/test reference: INT-75; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: No `error` listener; terminate connections to force claim errors for 3 s; spy `console.error`
- Expected result: At most one line per phase per 10 s; line format `[outbox] <relayId> claim: ...`

## TC-137: BullMQ retained job deduplication

- Milestone: M5; task: T-28.
- PRD: FR-66; FR-67; TRD/test reference: INT-85; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: Real Redis (`REDIS_URL`), BullMQ `Queue('emails')`; publisher with `jobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: { age: 3600 } }`; deliver one message, then force a redelivery (INT-25 pattern)
- Expected result: `queue.getJobCounts()` shows 1 job; `job.id = 'outbox-<id>'`; `job.opts.attempts = 5`; `job.data.outboxId` = id

## TC-138: Webhook outcomes and retries

- Milestone: M5; task: T-29.
- PRD: FR-68; FR-69; TRD/test reference: INT-86; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: Local `node:http` server whose response is scripted per request: 200; 500 then 200; 400; 408; 429 with `Retry-After: 3`; 302; sleep 1 s with `timeoutMs: 200`
- Expected result: 200 → `done`; 500 → retried then `done`; 400 → `dead`; 408 → `pending` with backoff; 429 → `available_at - now` ≈ 3000 ms; 302 → `dead`, Location not requested; timeout → `pending`, `last_error` starts with `OUTBOX_RETRYABLE: OUTBOX_WEBHOOK_TIMEOUT` (§5.9 webhook errors)

## TC-139: Webhook wire signature verification

- Milestone: M5; task: T-29.
- PRD: FR-70; TRD/test reference: INT-87; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: The server verifies each request with `verifyWebhook` and the raw body; secret both raw and `whsec_`
- Expected result: Verification passes; `webhook-id` = message id; body bytes signed equal bytes received

## TC-140: Inbox identifier validation and original transaction

- Milestone: M5; task: T-26.
- PRD: FR-75; FR-77; TRD/test reference: UT-22; INT-105; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: Exercise valid boundary identifiers and invalid types, lengths, characters before SQL; pass a transaction sentinel to the callback; retry a concurrent insert after the first transaction rolls back.
- Expected result: Invalid inputs reject with OUTBOX_INVALID_MESSAGE before any SQL; original transaction identity and callback result/errors are preserved; a concurrent waiter processes after rollback.

## TC-141: Emitter unsubscribe and fallback isolation

- Milestone: M5; task: T-27.
- PRD: FR-80; FR-83; TRD/test reference: UT-14; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: Register a throwing listener and a normal listener; emit, unsubscribe and emit again. Emit repeated errors without an error listener while advancing fake timers through 10 seconds; attach an error listener that throws.
- Expected result: Listener isolation (throwing listener does not stop others, produces `error` phase `listener`); `on` returns an unsubscribe function; console fallback when no `error` listener, rate-limited to one line per phase per 10 s (fake timers)

## TC-142: BullMQ configuration and queue resolution

- Milestone: M5; task: T-28.
- PRD: FR-66; FR-67; TRD/test reference: UT-13; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: Publish through fake direct, mapped and resolver queues; inspect job options and deterministic id. Exercise missing attempts, user jobId and unknown topics in static and per-message configuration.
- Expected result: Fake queue: `jobId = 'outbox-' + id`, matching `^outbox-[0-9a-f-]{36}$` (no `:`, not an integer); job options passed through; missing `attempts` → `OUTBOX_CONFIG` (static) or `NonRetryableError` (per message); user `jobId` rejected; topic map and function resolution; unknown topic → `NonRetryableError`

## TC-143: Webhook fixed vectors and invalid requests

- Milestone: M5; task: T-29.
- PRD: FR-68..FR-70; TRD/test reference: UT-11; TRD §5.6/9.8/13/14/15 as applicable.
- Priority: High.
- Automatable: yes.
- Preconditions: Task prerequisites complete; isolated PostgreSQL schema for integration; Redis for INT-85 and local HTTP server for INT-86/87.
- Steps: Reproduce the published Standard Webhooks vector and committed raw-secret vector; verify valid and mutated requests, missing headers, timestamp boundaries and multiple signatures. Inject fetch responses for each status class, redirects, Retry-After forms and failures; inspect errors for secret leakage.
- Expected result: Signing test vector; `whsec_` secret decoding; `verifyWebhook` accepts valid, rejects tampered body, wrong secret, missing header, timestamp outside tolerance, and accepts when one of several signatures matches; `Retry-After` parsing (`"3"`, HTTP-date, garbage); status classification table with an injected `fetch`; redirect not followed; secret absent from error messages
