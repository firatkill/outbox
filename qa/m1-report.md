# M1 Schema, enqueue and migrations — QA report

Date: 2026-10-21. Scope: T-04 through T-11. Prepared using qa-milestone-docs with the repository overrides; [review](m1-review.md).

## Evidence and result

All 43 designed M1 cases have results and are resolved. The final suite passes 126 unit tests and 58 integration tests, including TRD-sourced enqueue/dedupe SQL snapshots for default and custom names. Full integration suites passed on PostgreSQL 14.24, 16.15 and 17.11 with postgres.js and node-postgres, using Node 22. Four explicit relay-delay todos (INT-15/16, once per driver) are deferred to T-14 by the implementation plan; they are not counted as passes.

Lint, strict typecheck, static guards, ESM/CJS/declaration build, publint, attw, driver-free declaration scan and size gates pass. Both adapter checks have been restored to createOutbox imports (D-63). Core is 5.65 kB, postgres-js 5.28 kB, pg 5.33 kB, testing 1.15 kB (minified and Brotli-compressed); unchanged limits are 10/12/12/2 kB. Test-clock SQL occurs only in the testing entry. These are package-size measurements, not throughput benchmarks.

Task evidence: T-04 e07f5cd; T-05 16010ec; T-06 80c67b2; T-07 be11b48 plus b959532; T-08 a5955a3; T-09 595ea7d; T-10 818de4d. T-11 implementation is 82f0d56; its [implementation CI](https://github.com/firatkill/outbox/actions/runs/39580611281) passes. The final report commit is checked separately before merge. Each task has a separate PR, authored/committed with the required identity and pushed after completion.

## Resolved

Every row points to its tc_reference in the [append-only ledger](test-results.json). Detailed steps and PRD references are in [test-cases.md](test-cases.md).

| Case   | Title                                         | TRD evidence                           | Status                                      |
| ------ | --------------------------------------------- | -------------------------------------- | ------------------------------------------- |
| TC-025 | Configuration defaults and names              | UT-03.                                 | Passed; resolved within the staged M1 scope |
| TC-026 | Identifier validation boundaries              | UT-03.                                 | Passed; resolved within the staged M1 scope |
| TC-027 | Config option boundaries and aggregate errors | UT-03.                                 | Passed; resolved within the staged M1 scope |
| TC-028 | SQL token rendering and escaping              | UT-04.                                 | Passed; resolved within the staged M1 scope |
| TC-029 | Error branding and classification             | UT-07.                                 | Passed; resolved within the staged M1 scope |
| TC-030 | Last-error formatting                         | UT-07.                                 | Passed; resolved within the staged M1 scope |
| TC-063 | Rendered SQL works with both drivers          | INT-09.                                | Passed; resolved within the staged M1 scope |
| TC-031 | Migration installation and idempotence        | INT-01.                                | Passed; resolved within the staged M1 scope |
| TC-032 | Changed migration checksum is rejected        | INT-03.                                | Passed; resolved within the staged M1 scope |
| TC-033 | Concurrent migration runners serialize        | INT-04.                                | Passed; resolved within the staged M1 scope |
| TC-034 | Schema-version gate                           | INT-06.                                | Passed; resolved within the staged M1 scope |
| TC-035 | Migration dry run                             | INT-07.                                | Passed; resolved within the staged M1 scope |
| TC-064 | Migration template checksum normalization     | UT-18; TRD 8.1.                        | Passed; resolved within the staged M1 scope |
| TC-065 | Failed migration rolls back its DDL           | INT-01b; TRD 8.2/5.9.                  | Passed; resolved within the staged M1 scope |
| TC-036 | Exported migration script matches runner      | INT-05.                                | Passed; resolved within the staged M1 scope |
| TC-037 | CLI options and usage errors                  | UT-12.                                 | Passed; resolved within the staged M1 scope |
| TC-038 | CLI password redaction                        | UT-12.                                 | Passed; resolved within the staged M1 scope |
| TC-039 | CLI printed SQL and version delta             | UT-12; INT-90.                         | Passed; resolved within the staged M1 scope |
| TC-040 | CLI migration status and dry run              | INT-90.                                | Passed; resolved within the staged M1 scope |
| TC-066 | Public package resolution checks              | TRD 4.4; AGENTS.md definition of done. | Passed; resolved within the staged M1 scope |
| TC-067 | Public entry size budgets                     | TRD 4.4; AGENTS.md definition of done. | Passed; resolved within the staged M1 scope |
| TC-041 | Message field rules                           | UT-05.                                 | Passed; resolved within the staged M1 scope |
| TC-042 | JSON serializability and byte limits          | UT-05.                                 | Passed; resolved within the staged M1 scope |
| TC-043 | Batch limits and duplicate collapsing         | UT-05.                                 | Passed; resolved within the staged M1 scope |
| TC-044 | UUIDv7 monotonicity                           | UT-06.                                 | Passed; resolved within the staged M1 scope |
| TC-045 | postgres.js migration adapter                 | INT-01; A-03.                          | Passed; resolved within the staged M1 scope |
| TC-046 | Driver-neutral message row mapping            | UT-04.                                 | Passed; resolved within the staged M1 scope |
| TC-047 | pg adapter parity                             | INT-01; A-04.                          | Passed; resolved within the staged M1 scope |
| TC-048 | pg transaction client release                 | INT-80.                                | Passed; resolved within the staged M1 scope |
| TC-049 | Custom prefix isolation                       | INT-02.                                | Passed; resolved within the staged M1 scope |
| TC-058 | Topic-map type safety                         | T-10 acceptance.                       | Passed; resolved within the staged M1 scope |
| TC-052 | Batch round trip and sequence order           | INT-12; A-05.                          | Passed; resolved within the staged M1 scope |
| TC-050 | Atomic committed enqueue                      | INT-10.                                | Passed; resolved within the staged M1 scope |
| TC-051 | Rolled-back enqueue                           | INT-11.                                | Passed; resolved within the staged M1 scope |
| TC-053 | Dedupe scope and input order                  | INT-13.                                | Passed; resolved within the staged M1 scope |
| TC-054 | Concurrent dedupe commit and rollback         | INT-14.                                | Passed; resolved within the staged M1 scope |
| TC-055 | Invalid inputs send no SQL                    | INT-17.                                | Passed; resolved within the staged M1 scope |
| TC-056 | Payload size boundary against database        | INT-18.                                | Passed; resolved within the staged M1 scope |
| TC-057 | Producer least-privilege role                 | INT-10b; A-19.                         | Passed; resolved within the staged M1 scope |
| TC-059 | Clock install and restoration                 | INT-92; TRD 11.3.                      | Passed; resolved within the staged M1 scope |
| TC-060 | Clock transaction isolation                   | INT-93; TRD 11.3.                      | Passed; resolved within the staged M1 scope |
| TC-061 | Relative delay and transaction-local claim    | INT-15.                                | Passed; resolved within the staged M1 scope |
| TC-062 | Absolute availability                         | INT-16.                                | Passed; resolved within the staged M1 scope |

## Pending decision

None. Owner approvals are recorded as D-61 (docs gates until T-34), D-63 (staged adapter size imports, now restored), D-64 (JSON casts through text), and D-65 (pg optional notification payload type). A-03's failed JSON assumption and its verified correction are documented in the repository; no test was weakened to conceal it.

## Manual test required

None within M1. Docs site and example live checks are later tasks; they have not been performed or marked passed.

## Regressions and root cause groups

No M1 entry has an unresolved regression reference or root-cause group. Runtime findings were resolved with recorded retests: direct-jsonb parameter double encoding (D-64), strict pg structural typing (D-65), and an INT-12 test query accidentally sorting the projected text sequence instead of the underlying bigint. Test assertions now follow the specification.

## Audit trail

No M1 cases were retracted or removed. Failed attempts remain in the ledger with subsequent passes. TC-067 retains a corrected size-note typo; TC-041 clarifies that the anchored regex already rejected trailing line terminators, so its added guard/test was defensive and not a reproduced regex defect. No benchmark or chaos results were fabricated. The historical TC-005 advisory belongs to M0 and remains resolved; it is not a new M1 failure.

## Requirement coverage

| Requirement / acceptance area           | Verification                                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-02..FR-05 adapter/core foundation    | M1 construction, migrations, enqueue and type mapping verified with both drivers; relay and inbox operations remain staged                                                                     |
| FR-10..FR-16 migrations                 | Catalog, custom names, checksums, rollback, concurrent application, dry-run, SQL-script equivalence, CLI and schemaVersion verified; relay/stats startup portions of INT-06 remain later tasks |
| FR-17/18 test clock                     | Install/reinstall, offsets, schema and transaction isolation, non-negative input enforcement, migration coexistence and production restoration verified                                        |
| FR-20..FR-27 enqueue                    | Business/message commit and rollback, batch size/order, UUIDs, dedupe races, delays, validation before SQL, payload limits, least privilege and topic/payload types verified                   |
| GU-01                                   | Atomic row writes and no notification on rollback verified; positive wake-up notification behavior is completed by INT-19/T-24                                                                 |
| GU-07                                   | Direct C1 eligibility and stored relative/absolute times verified; actual relay no-early-delivery assertions await T-14                                                                        |
| NFR-04/05/13/32 and package constraints | Parameterized identifiers/casts, database-time logic, batch statement count, driver-neutral types, zero runtime dependencies and current size limits verified for implemented paths            |

## Verification limits

No relay, retry/dead-letter, ordering, inbox or publisher behavior is claimed complete. INT-02's relay isolation and INT-82's claim/admin reads remain tied to their implementation tasks. LISTEN/reconnection checks remain T-24. INT-91's stats output remains T-21. Chaos, throughput benchmarks, full Node 20/22/24 CI matrix, coverage/release smoke gates, docs build/check and example live checks remain later tasks; only Node 22 was used for the M1 library test suite. The owner-approved docs-only deferral remains until T-34. Nothing was published to npm or deployed to Vercel.
