# M3 gate findings and proposed corrections

T-20 admin acceptance passes against both drivers. Two separate gates prevent completion.

## Bundle budget

The new implementation measures 12.23 kB for core, 11.87 kB for postgres-js and 11.93 kB for pg (minified and Brotli-compressed under the unchanged size-limit imports). Core exceeds its approved 12 kB ceiling by 231 bytes after consolidating numeric validation. Publisher and testing limits pass.

Proposal: raise the core and both adapter ceilings to 13 kB for the admin/stats milestone. Keep the current imports, compression method and all other limits. Adapter headroom covers the still-required stats implementation in T-21; its exact size is not yet measured. Record the revised budgets in PRD/TRD and the size configuration. Future additions still have to meet those ceilings or obtain a new decision.

## postgres.js fault-injection test

The full suite passed all 186 unit and 133 integration assertions, but Vitest correctly failed the run for an unhandled rejection during INT-29. Backend termination interrupted postgres.js 3.4.9's internal array-type discovery query (`pg_catalog.pg_type`, SQLSTATE 57P01). The driver calls async `fetchArrayTypes()` from its protocol handler without a rejection handler; this work is outside the adapter's query promises.

Proposal: set `fetch_types: false` only on the test-owned postgres.js fault-injection worker pool. Outbox statements already use driver-neutral scalar results and JSON text parameters; this pool needs no custom PostgreSQL array discovery. Keep all ten termination rounds, both drivers, message count, recovery deadline and assertions unchanged. Do not change caller-owned production pools or suppress unhandled-rejection reporting. Record the fault test's configuration and the limitation of default postgres.js pools in TRD testing/driver guidance. All other adapter tests retain the driver's defaults.

Approval is required under AGENTS.md checkpoint 2: the specified size gate fails and the fault scenario exposes a pinned-driver failure outside library error handling. Neither correction has been applied.

Approved by the owner in conversation on 2026-10-21; recorded as D-72.
