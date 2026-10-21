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
- Steps: Enqueue 2000; terminate only named relay backends every 200ms for 2s.
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
