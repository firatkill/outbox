# M5 inbox package-size checkpoint

T-26 implements the normative inbox behavior and exposes the two standalone consumer factories. Its 28 targeted unit/integration tests pass, including ten separate concurrent transactions and lease-loss redelivery, against both PostgreSQL drivers.

The unchanged D-72 limits fail after the inbox implementation:

| Entry | Limit | Initial measurement | After sharing validation |
|---|---|---|---|
| core | 13,000 B | 13,126 B | 13,122 B |
| postgres-js (createOutbox) | 13,000 B | about 12.83 kB | about 12.82 kB |
| pg (createOutbox) | 13,000 B | 13,084 B | 13,059 B |

Measurements are from the existing `pnpm build && pnpm size` commands (minified and Brotli-compressed with dependencies). These are package measurements, not benchmark results. Shared topic/consumer grammar and Unicode string-length validation preserve the existing behavior. No checks, exports or limits were removed to obtain the second measurement.

Proposed owner decision: raise the core and both adapter ceilings to **14 kB**, keeping all other ceilings and measurement settings unchanged. This provides modest room for the remaining T-27 observability work; it does not pre-approve a further increase if that task exceeds 14 kB. Update the PRD decision log, normative TRD budgets and `.size-limit.json` together only after approval.

Alternative: retain 13 kB and undertake a broader size refactor before completing T-26. The owner chose the proposed increase. Final local suite passes 204 unit and 183 integration tests; approved size gates pass.

Approved by the owner on 2026-10-23: “Approve 14 kB limits”. Recorded as PRD D-75.
