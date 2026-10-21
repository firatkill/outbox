# M0 preflight — 2026-10-21

## Completed setup

The owner approved creating the public repository and pushing setup commits. The repository is https://github.com/firatkill/outbox, its default branch is main, and the local origin tracks it. PRD D-55 records that approval. Work for T-01 is on t-01-repository-tooling.

M0 test design is in test-cases.md. UT-15, UT-16 and INT-08 reserve the next unused IDs in TRD §15 for the smoke test, static-guard fixtures and database harness. No implementation or application test run is claimed.

## A-01: authenticated npm ownership unavailable

- `npm whoami` exited 1 with ENEEDAUTH.
- `npm view @firatkill/outbox version` returned E404, as expected for the initial unpublished package.
- `npm access list packages @firatkill` has not run: authentication failed first.
- OWNER-DECISIONS.md controls the identity: firatkill, with two trailing l characters. A-01's one-l expected username must not cause a package rename.

Owner action: log in locally and confirm when ready, or approve deferring the authenticated ownership check until release. No account, token or credential is created or changed by this work.

## A-07: tsup maintenance assumption failed

The maintainer's README says tsup is no longer actively maintained and recommends tsdown. This was verified both in the official repository and via npm README metadata:

- https://github.com/egoist/tsup#readme
- https://tsdown.dev/guide/migrate-from-tsup

The registry reports tsup 9.0.0, but a recent package timestamp does not negate the explicit maintainer notice. AGENTS.md checkpoint 2 requires owner approval before adopting the fallback.

Proposed change, not yet implemented: use the TRD A-07 tsdown fallback; preserve the six entry points, ESM/CJS and .d.ts/.d.cts output names, the ESM CLI, build-time VERSION, zero runtime dependencies and the owner-approved package runtime matrix. Update the normative build configuration and affected commands together after approval. Validate with the T-01 output/load checks and the T-33 package gates when available.

The current tsdown version is 0.23.1 and its Node engine range is ^22.18.0 || ^24.11.0 || >=26.0.0. Local Node is v24.10.0, so this version cannot be run on the current shell runtime as specified. Use an appropriate Node 22 build runtime, consistent with the planned .nvmrc; do not silently raise the published package's Node floor.

## Other verified environment facts

- Node v24.10.0, pnpm 10.18.3.
- Docker client/server 28.5.1; Compose v2.40.2; engine reachable.
- No PostgreSQL or Redis services were created or started.
- npm registry is https://registry.npmjs.org/.
- A metadata lookup initially failed with EACCES on an existing root-owned file in the shared npm cache. Subsequent read-only checks use --cache .git/npm-cache. No shared cache permissions were changed.

## Dependency selection constraints for the next step

No package.json or lockfile has been written. Registry checks found:

- TypeScript latest is 7.0.2. typescript-eslint 8.72.0 accepts TypeScript below 6.1; TypeDoc 0.28.20 accepts up to the 6.0 line. Follow the TRD §3 fallback to the latest 5.x (5.9.3) rather than adopt unsupported TypeScript 7.
- Vitest latest is 5.0.5, whose engine range excludes Node 20. The specified Vitest 3-or-4 choice remains available; 4.1.12 declares Node 20/22/24 support. Verify the actual project configuration after installation (A-17).
- ESLint 9.39.5 is the latest release in the specified ESLint 9 line.

## Status

T-01 is blocked on the two owner items above. T-02 and T-03 remain todo. M0 is not complete: no lint, typecheck, build, unit/integration suite or CI static job has run. The QA ledger records only the two attempted preflight cases; the remaining cases are planned, not passed.
