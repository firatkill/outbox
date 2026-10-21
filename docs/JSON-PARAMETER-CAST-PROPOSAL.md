# JSON parameter cast correction — approved (D-64)

T-08 verification of TRD A-03 found that postgres.js 3.4.9 serializes a pre-encoded JSON string again when PostgreSQL infers its parameter type as jsonb. The adapter round-trip assertion in INT-01 fails: an object becomes a JSON string containing the object's encoded text. Enqueue's jsonb_array_elements would therefore receive a scalar instead of an array.

Approved correction: change every pre-encoded JSON parameter cast in TRD §9 from `$n::jsonb` to `$n::text::jsonb`, and document the driver behavior in §6.2 and A-03. Preserve parameterization, structural adapter types, zero runtime dependencies, all defaults and all invariants. Keep the SQL statements otherwise unchanged.

A read-only PostgreSQL 17 probe using the installed postgres.js and node-postgres drivers passed with the proposed cast: a JSON array containing Unicode round-tripped unchanged and jsonb_array_length returned 1. Driver source confirms that postgres.js describes parameters and uses its JSON serializer for the inferred JSON type. The text-first cast selects text serialization before PostgreSQL parses the JSON.

Affected statements: E1, E2, C1T (and filtered ordering variant), complete, fail, release, and retryDead's JSON id filter. These implementation tasks have not landed yet. Applied migration SQL is unaffected.

AGENTS.md owner approval checkpoint 2 requires explicit approval before changing normative SQL following a failed build-time assumption. The owner approved this correction in conversation on 2026-10-21; the TRD now specifies the text-first casts, to be used as each SQL statement is implemented. The failing integration test has not been weakened or skipped.
