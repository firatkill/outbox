# M3 QA milestone report

Date: 2026-10-21. Scope: T-19..T-21, retries/dead letters, admin helpers, stats and CLI stats. Prepared with qa-milestone-docs and repository overrides. Source: [case definitions](test-cases.md), [append-only results](test-results.json), PRD/TRD and PRs [19](https://github.com/firatkill/outbox/pull/19), [20](https://github.com/firatkill/outbox/pull/20), [21](https://github.com/firatkill/outbox/pull/21).

## Resolved

All 13 M3 cases are resolved. All 115 ledger cases have a passing latest attempt. No case was removed to reach this result.

| Case   | Behavior                             | Requirement         | Status                                    |
| ------ | ------------------------------------ | ------------------- | ----------------------------------------- |
| TC-103 | Exponential retry and retained error | FR-45; FR-48        | Resolved; latest observed attempt passed. |
| TC-104 | Exhausted retry budget               | FR-46; FR-47        | Resolved; latest observed attempt passed. |
| TC-105 | Non-retryable delivery               | FR-47               | Resolved; latest observed attempt passed. |
| TC-106 | Explicit retry delay and clamp       | FR-45; FR-47        | Resolved; latest observed attempt passed. |
| TC-107 | Exhausted crashed attempt            | FR-46; FR-47; GU-03 | Resolved; latest observed attempt passed. |
| TC-108 | Retry dead filters                   | FR-49               | Resolved; latest observed attempt passed. |
| TC-109 | Batched retention and dedupe window  | FR-51               | Resolved; latest observed attempt passed. |
| TC-110 | Skip status validation               | FR-50               | Resolved; latest observed attempt passed. |
| TC-111 | Dead listing and driver mapping      | FR-52               | Resolved; latest observed attempt passed. |
| TC-112 | Indexed database-time statistics     | FR-81               | Resolved; latest observed attempt passed. |
| TC-113 | CLI stats output                     | FR-87               | Resolved; latest observed attempt passed. |
| TC-114 | Admin validation and driver errors   | FR-49..FR-52; D-71  | Resolved; latest observed attempt passed. |
| TC-115 | Stats errors and option validation   | FR-81; D-71         | Resolved; latest observed attempt passed. |

## Verification evidence

- Standard `pnpm test` passed locally on Node 22: 186 unit tests and 139 PostgreSQL 17.11 integration tests, with no skips, todos or unhandled errors. The final integration run used the unchanged four-worker project configuration and completed in 16.05 seconds.
- M3 acceptance passed on PostgreSQL 14.24 and 16.15: 27 selected integration checks on each version, both drivers, including the built CLI. Four unrelated migrate checks were excluded by the explicit target filter; they remain enabled and pass in the full PG17 suite. This is M3 coverage on PG14/16, not a claim that their full project suites were rerun in T-21.
- INT-37 verifies exact counts, database-time age within 50 ms, terminal-count opt-in and empty stats. With 100,000 completed rows, EXPLAIN shows the claim index and no message-table Seq Scan in S1, on all three tested PostgreSQL versions.
- INT-82 admin mapping is complete: sequence above 2^53 stays a string; payload/headers and dates are neutral across both drivers; stats counts are numbers and measuredAt is a Date.
- Lint, typecheck, guards, build, publint, declaration checks, size and ledger integrity pass. Core 12.65 kB, postgres-js 12.29 kB and pg 12.35 kB fit their approved 13 kB budgets; testing and placeholder publisher entries fit their existing limits. Publisher implementation readiness is not implied.
- T-21 [implementation CI](https://github.com/firatkill/outbox/actions/runs/39631946088) passed static/package/size and PostgreSQL integration jobs. Final report-commit CI is enforced before merge on PR #21.

## Pending decisions

None. Owner-approved D-71 defines admin validation. D-72 approves the 13 kB core/adapter budgets and disables internal type discovery only in the test-owned postgres.js fault worker. See [validation proposal](../docs/M3-APPROVAL-PROPOSAL.md) and [gate proposal](../docs/M3-GATE-PROPOSAL.md).

## Manual test required

None within M3. CLI behavior was exercised through actual built processes. Docs-site and example live checks belong to later milestones and are not silently marked passed.

## Regressions and audit trail

- TC-094: the previously passing connection-loss case exposed a postgres.js internal array-type query rejection. The driver work runs outside adapter promises. The approved fault-worker configuration passed targeted, full and T-20 CI retests. Production pool defaults remain caller-owned; this test does not prove safety of default type discovery under termination.
- TC-083, TC-087, TC-093, TC-101, TC-112 and TC-115 failed during one local full run with broad timeouts; TC-083 also exhausted its one-second availability margin. Host load afterward was high, but causation is unconfirmed. All affected cases passed unchanged on targeted retest and in the final standard full run.
- A second full run failed only TC-094's 30-second recovery deadline. Its unchanged targeted retest and the final standard full run passed. No timeouts, workload sizes, fault rounds or assertions were weakened.
- One successful diagnostic full run requested `--maxWorkers=1`, but the integration project declares its own worker count; effective serialization was not established. It is not the evidence used for the final standard-command claim.
- TC-109 and TC-111 initially had fixture errors: wrong enqueue result field and an attempted identity-column UPDATE. They were corrected against the spec. One edit-script failure caused an unchanged repeat failure, retained in the ledger. Corrected tests passed on all three PostgreSQL versions.
- TC-114 static failures were type-narrowing and lint issues; corrected code passed static, unit and integration checks.
- No retracted cases or deleted attempts. Earlier M2 environment/teardown history remains in the ledger and [M2 report](m2-report.md).

## Root cause groups

- `m3-full-run-timeouts-unconfirmed`: six cases, all resolved by observed unchanged retests; the underlying host cause is still unconfirmed.
- TC-094 retains `postgres-js-internal-type-discovery-rejection`; D-72 addresses that specific driver behavior in the fault fixture. Its later deadline miss is a separate observation, not attributed to type discovery.
- TC-067 retains its historical bundle-budget grouping; M3's approved D-72 budget and final size measurements resolve the current gate failure.

## Requirement coverage

| Requirement  | Result and cases                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| FR-45..FR-48 | Verified for M3: TC-103..TC-107 plus the existing pure backoff/error tests.                                                      |
| FR-49        | Verified: TC-108 filters, reset, retained diagnostics and later delivery.                                                        |
| FR-50        | Verified: TC-110 permitted transitions and status/not-found errors.                                                              |
| FR-51        | Verified: TC-109 retention, bounded batches and dedupe-window removal.                                                           |
| FR-52        | Verified: TC-111 ordering, filtering, limit and message mapping.                                                                 |
| FR-81        | Verified: TC-112 and TC-115, including partial-index plans and error handling.                                                   |
| FR-87        | Verified: TC-113 built CLI JSON/text; existing INT-91 usage/redaction cases also pass.                                           |
| D-71         | Verified: TC-114 and TC-115 invalid options/IDs and no SQL before validation.                                                    |
| GU-03        | M3 retry exhaustion and crashed-final-attempt cases verified; the broader guarantee's chaos evidence remains scheduled for T-30. |

## Verification limits

- Default postgres.js internal type discovery under backend termination remains a known driver limitation; D-72's fault fixture uses fetch_types:false. Production adapters do not alter callers' pool settings.
- The local full-run timeout cause was not proven. Passing retests and CI do not erase those observations.
- Docs check/build are deferred to T-34 by D-61. No docs deployment or example live QA is claimed.
- Ordering/inbox concurrency gates and both chaos runs follow D-66's scheduled tasks. No chaos result, benchmark result, full Node 20/22/24 matrix or global coverage-threshold result is claimed here.
- This is an implementation milestone, not npm-release readiness. Stop before T-22.
