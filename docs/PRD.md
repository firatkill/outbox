# Outbox: Product Requirements Document

| Field | Value |
|---|---|
| Product | `@firatkill/outbox`, the transactional outbox and relay for PostgreSQL, with a consumer inbox |
| Owner | Fırat Kıl |
| Status | Approved for implementation |
| Version | 1.0 (2026-10-21) |
| Package | `@firatkill/outbox` on npm (MIT) |
| Repository | https://github.com/firatkill/outbox |
| Docs site | https://outbox.firatkil.com (Vercel, Hobby plan) |
| Companion docs | [TRD.md](./TRD.md) (how), [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) (order of work), [../AGENTS.md](../AGENTS.md) (rules for coding agents) |

Requirement keywords: **Must** = required for the 0.1.0 release. **Should** = required unless a documented blocker exists; record the blocker in the decisions log (§14). **Could** = do only after every Must and Should is done.

ID scheme used across all docs:

| Prefix | Meaning | Defined in |
|---|---|---|
| US-xx | User story | PRD §5 |
| FR-xx | Functional requirement | PRD §6 |
| NFR-xx | Non-functional requirement | PRD §8 |
| GU-xx | Delivery guarantee (public contract) | PRD §7, precise form in TRD §12 |
| INV-xx | Invariant checked by SQL after chaos and concurrency tests | TRD §15.5 |
| UT-xx | Vitest unit test | TRD §15.2 |
| INT-xx | Integration test against real PostgreSQL | TRD §15.3 |
| CHAOS-xx | Chaos run (child processes killed at random) | TRD §15.5 |
| BENCH-xx | Benchmark | TRD §15.6 |
| EX-xx | Example app smoke test | TRD §17 |
| T-xx | Implementation task | IMPLEMENTATION_PLAN.md |
| D-xx | Decision | PRD §14 |
| A-xx | Assumption to verify at build time | TRD §22 |
| R-xx | Risk | PRD §13 |

---

## 1. Problem

A service that handles a request usually does two things: it writes to its database and it tells someone else what happened (publishes an event, enqueues a job, calls a webhook). These are two systems with no shared transaction. If the process crashes, is redeployed or loses the network between the two steps, one of two bugs follows:

- Write committed, publish never happened: the event is lost. The order exists but no confirmation email is sent, no stock is reserved.
- Publish happened, write rolled back: a ghost event. The email goes out for an order that does not exist.

Retrying "around" the problem does not fix it. Publishing inside the database transaction only moves the failure window (the broker accepted the message, then the commit failed). The standard fix is the transactional outbox: write the message into an `outbox` table in the same transaction as the business data, and let a separate relay read that table and deliver the messages with retries. The commit decides, atomically, whether both the data and the message exist.

The relay can crash too, after delivering a message but before recording that it did. So delivery is at-least-once, and consumers must be idempotent. The usual companion is an inbox table on the consumer side: record the message id in the same transaction as the consumer's effects, so a duplicate delivery becomes a no-op.

Every team that builds queue-driven systems re-implements this, and the details are where it goes wrong: a relay that holds a transaction open during a network call, a claim query that lets two relays take the same row, timestamps from five different application clocks, retries that never happen because they were configured in the wrong place, a poison message that crashes the relay forever.

Fırat builds queue-driven systems with PostgreSQL, BullMQ and Azure queues at work. He once shipped a bug where BullMQ retries were silently ignored because the retry options were set on the worker instead of the job. That class of mistake (a configuration that looks right and does nothing) is exactly what this library is designed to make hard.

`@firatkill/outbox` is a small, dependency-free TypeScript library that implements the outbox, the relay and the inbox for PostgreSQL correctly, explains every guarantee precisely, and proves its claims with integration tests against real PostgreSQL, a chaos test that kills relay processes at random, and a published benchmark.

## 2. Goals

| ID | Goal | Measured by |
|---|---|---|
| G-1 | Give library users an outbox they can adopt in 15 minutes with either PostgreSQL driver | The README quick start (15 lines) runs unchanged against a fresh database after `npx outbox migrate`; docs quick start pages for postgres.js and pg (FR-100) |
| G-2 | State delivery guarantees precisely and prove them | Guarantees GU-01..GU-09 each map to at least one INT or CHAOS test (TRD §12.3); CHAOS-01 and CHAOS-02 pass in CI on every push to `main` |
| G-3 | Show distributed-systems judgement to a backend reviewer in a 15-minute read | The docs pages "Guarantees and failure modes" and "Ordering" plus `src/core/sql/*.ts` explain claim, lease, fencing, backoff, ordering and the crash-point table with no gaps |
| G-4 | Stay small and dependency-free | Zero runtime `dependencies`; core entry ≤ 14 kB min+brotli (NFR-20) |
| G-5 | Be reproducible by anyone | `pnpm install && pnpm db:up && pnpm test` passes on a clean machine with Docker and Node 22+ |
| G-6 | Cost nothing to host | npm package plus a static docs site on Vercel Hobby; no servers, no paid services (NFR-50) |

## 3. Non-goals

- A general-purpose job queue. No cron schedules, job priorities, job progress, rate-limited queues, workflows, or result storage. Use pg-boss, graphile-worker or BullMQ for those; the outbox can feed them (FR-66).
- Change data capture. The library does not read the WAL. Debezium and logical replication are a different trade-off (docs "Comparison", FR-108).
- Exactly-once delivery. The library never claims it. It provides at-least-once delivery and exactly-once *effects* for effects inside the consumer's database transaction (GU-05).
- Databases other than PostgreSQL, and multi-database transactions (one outbox table per database; no two-phase commit).
- Total ordering across all messages. Ordering is per key, only in ordering mode (GU-06).
- A dashboard or admin UI. Operations use `stats()`, admin helpers, the CLI and SQL (docs "Operations").
- Browser, Deno, Bun or edge runtimes. Node.js only (NFR-30). They may work; they are not tested or supported.
- Schema management through ORMs. The library ships its own migrations and exposes the SQL for users who manage migrations themselves (FR-14).

## 4. Audience

| Persona | Time budget | What they do | What must be true |
|---|---|---|---|
| P1 Backend reviewer (hiring manager, senior engineer) | 15 min | Reads the README, the guarantees page, the claim SQL and the chaos test; glances at CI | Guarantees are stated precisely with their limits; the crash-point table is complete; the claim, lease and fencing logic is short and commented; CI is green on a Node × Postgres matrix; benchmark numbers are real and reproducible |
| P2 Library user (backend developer adopting it) | 15 min to first message, then occasional | Installs the package and one driver, runs the migration, adds `enqueue` to a transaction, starts a relay | Quick start works for postgres.js and pg; types guide them; defaults are safe; failure modes and operations are documented; errors say what to do |
| P3 Operator (the same user, later, during an incident) | 5 min | Looks at backlog, dead letters, stuck leases; retries or skips | `stats()` and the CLI answer "how far behind are we and why"; `retryDead`, `skip` and `purge` exist and are safe to run in production |
| P4 Contributor / AI coding agent | per task | Implements a task from the plan | Every behaviour is specified; every task has acceptance commands; AGENTS.md lists the rules |

## 5. User stories

| ID | As a | I want to | So that | FRs |
|---|---|---|---|---|
| US-01 | library user | insert a message in the same transaction as my data with one call | the message exists if and only if my data commits | FR-20, FR-21 |
| US-02 | library user | use the PostgreSQL driver I already have (postgres.js or pg) | I do not add a second driver or connection pool | FR-02, FR-03 |
| US-03 | library user | avoid enqueueing the same logical event twice when my request is retried | a retried HTTP request does not create two events | FR-23 |
| US-04 | library user | delay a message | I can send a reminder in 24 hours from inside a transaction | FR-24 |
| US-05 | library user | run a relay that delivers to in-process handlers per topic | I can react to my own events without a broker | FR-30, FR-65 |
| US-06 | library user | run several relays at once | delivery scales and survives one relay dying | FR-31, FR-33 |
| US-07 | library user | have failed deliveries retried with backoff and parked as dead after N attempts | transient failures heal and poison messages stop | FR-45..FR-48 |
| US-08 | operator | list, retry and skip dead messages and purge old ones | I can recover after fixing a bug and keep the table small | FR-49..FR-52 |
| US-09 | library user | have messages with the same key delivered in order | `order.paid` never overtakes `order.created` for the same order | FR-55..FR-58 |
| US-10 | library user | have messages delivered within tens of milliseconds without hammering the database | latency is low and idle cost is near zero | FR-60..FR-63 |
| US-11 | library user | publish to BullMQ with retries configured correctly | I cannot repeat the "retries on the worker" mistake | FR-66, FR-67 |
| US-12 | library user | deliver to HTTP webhooks with signatures | I can notify other services safely | FR-68..FR-70 |
| US-13 | consumer author | run my effects exactly once even when a message is delivered twice | duplicates are harmless | FR-75..FR-78 |
| US-14 | library user | stop a relay gracefully on SIGTERM | deploys do not cause avoidable duplicates or stuck leases | FR-36, FR-37 |
| US-15 | operator | see backlog size, oldest message age and dead count, and wire events into my logs and traces | I can alert on lag | FR-80..FR-84 |
| US-16 | library user | run migrations with a CLI or copy the SQL into my own migration tool | the schema fits my deployment process | FR-10..FR-16, FR-86 |
| US-17 | backend reviewer | read precise guarantees and a crash-point table | I can judge whether the author understands failure | FR-104, GU-01..GU-09 |
| US-18 | backend reviewer | see a chaos test kill relays at random and verify invariants with SQL | I trust the at-least-once claim | FR-93 |
| US-19 | backend reviewer | see real throughput numbers with the hardware they came from | I can judge the performance claim | FR-94, NFR-10 |
| US-20 | library user | run a complete example with `docker compose up` | I can see the pattern working end to end | FR-110 |
| US-21 | library user | test my handlers with time travel | I can test retries and delays without sleeping | FR-17, FR-18 |

---

## 6. Functional requirements

### 6.1 Packaging and drivers (TRD §4)

| ID | Pri | Requirement |
|---|---|---|
| FR-01 | Must | Publish one npm package `@firatkill/outbox` (MIT) with ESM and CJS builds (tsup) and full type declarations for both. `dependencies` is empty. |
| FR-02 | Must | Entry point `@firatkill/outbox/postgres-js` exports `createOutbox` and `createInbox` bound to a postgres.js (`postgres`) `Sql` instance. |
| FR-03 | Must | Entry point `@firatkill/outbox/pg` exports `createOutbox` and `createInbox` bound to a node-postgres (`pg`) `Pool`. |
| FR-04 | Must | `postgres` and `pg` are optional peer dependencies. Importing one adapter never loads the other driver. Adapter type declarations use structural types and do not import driver types, so type checking works with only one driver installed. |
| FR-05 | Must | Entry point `@firatkill/outbox` (core) exports types, error classes and helpers, `computeBackoffMs`, `migrationSql`, and `createOutboxCore` for custom drivers through the `DriverAdapter` interface (TRD §6.6). |
| FR-06 | Must | Entry points `@firatkill/outbox/bullmq`, `@firatkill/outbox/webhook` and `@firatkill/outbox/testing` exist as specified in FR-66..FR-70 and FR-17. |
| FR-07 | Must | `outbox` binary (FR-86) ships in the same package. |

### 6.2 Schema and migrations (TRD §7, §8)

| ID | Pri | Requirement |
|---|---|---|
| FR-10 | Must | Tables `outbox_messages` and `outbox_inbox`, a version table `outbox_schema_migrations`, and a function `outbox_now()`, all in a configurable schema (default `public`) with a configurable name prefix (default `outbox_`). The exact DDL is TRD §7. |
| FR-11 | Must | Status is `text` with a CHECK constraint, one of `pending`, `in_flight`, `done`, `dead`, `skipped`. All timestamps are `timestamptz`. |
| FR-12 | Must | Indexes: partial claim index on pending messages by `(available_at, seq)`; partial lease index on in-flight messages by `locked_until`; partial ordering index on `(key, seq)` for unfinished keyed messages; unique `(topic, dedupe_key)` where `dedupe_key is not null`; partial indexes for dead and purge scans. |
| FR-13 | Must | Versioned migrations recorded in the version table with a SHA-256 checksum; applied in order, each in its own transaction, under a transaction-scoped advisory lock so concurrent runs are safe; a changed checksum of an applied migration is an error (`OUTBOX_MIGRATION_CHECKSUM`). |
| FR-14 | Must | `migrationSql({ schema, tablePrefix, fromVersion, toVersion })` returns the exact SQL the runner would apply, including the version-table inserts, for users who manage migrations themselves. Docs include Drizzle, Prisma and Knex examples. |
| FR-15 | Must | `relay.start()` and `outbox.schemaVersion()` check that the database schema version is at least the version the installed library requires; otherwise `OUTBOX_NOT_MIGRATED` with the command to run. |
| FR-16 | Must | Within one major version, migrations are additive (expand only), so an older library version keeps working against a newer schema during a rolling deploy. |
| FR-17 | Must | `@firatkill/outbox/testing` installs a test clock: it replaces `outbox_now()` with a version that adds an offset read from a per-transaction setting or a per-schema offset row (TRD §11). The production `outbox_now()` is plain `now()`; the test clock is never part of the normal migrations. |
| FR-18 | Must | Every database timestamp the library writes or compares comes from `outbox_now()`. The application clock is never used for leases, delays, backoff, retention or stats. Exceptions are listed in TRD §11.4 (UUIDv7 entropy prefix, webhook signature timestamp, absolute `availableAt` supplied by the caller). |

### 6.3 Enqueue (TRD §9.1)

| ID | Pri | Requirement |
|---|---|---|
| FR-20 | Must | `outbox.enqueue(tx, message)` and `outbox.enqueue(tx, messages[])` insert using the caller's transaction handle (adapter-specific type) in one SQL statement per call, regardless of batch size (1..1000). |
| FR-21 | Must | Message fields: `topic` (string), `payload` (any JSON-serialisable value), `key` (optional partition key for ordering), `headers` (optional string map), `dedupeKey` (optional, unique per topic), `delayMs` or `availableAt` (optional, mutually exclusive), `maxAttempts` (optional override of the outbox default 10). |
| FR-22 | Must | Message ids are UUIDv7 strings generated by the library before the insert; `seq` is a database identity column used for ordering. `enqueue` returns `{ id, topic, deduped }` per message, in input order. |
| FR-23 | Must | A message whose `(topic, dedupeKey)` already exists is not inserted; the result has `deduped: true` and the existing id. Duplicates inside one batch are collapsed the same way. Deduplication lasts until the earlier message is purged. |
| FR-24 | Must | `delayMs` is relative to database time (`outbox_now() + delayMs`). `availableAt` is an absolute instant supplied by the caller. |
| FR-25 | Must | Invalid messages fail before any SQL is sent, with `OUTBOX_INVALID_MESSAGE` naming the field and index. Payloads larger than `maxPayloadBytes` (default 1 MiB, UTF-8 bytes of the JSON) fail with `OUTBOX_PAYLOAD_TOO_LARGE`. |
| FR-26 | Must | When `notify` is enabled (default), the same statement issues `pg_notify` on the outbox channel if at least one row was inserted; PostgreSQL delivers it only on commit. |
| FR-27 | Should | `enqueue` is generic over a topic map type so `topic` and `payload` are checked at compile time; no runtime payload schema validation is done by the library. |

### 6.4 Relay (TRD §9.2–§9.6)

| ID | Pri | Requirement |
|---|---|---|
| FR-30 | Must | `outbox.createRelay({ handlers } | { publisher }, ...options)` returns a long-running relay. Exactly one of `handlers` or `publisher` is given. An optional `db` overrides the outbox's database handle for the relay. |
| FR-31 | Must | Claim: one autocommit SQL statement selects up to N ready messages with `FOR UPDATE SKIP LOCKED`, sets `status = 'in_flight'`, `locked_by`, `locked_until = outbox_now() + leaseMs`, increments `attempts`, and returns the rows. No transaction is held open while a message is delivered. |
| FR-32 | Must | Complete and fail: buffered outcomes are written in batched autocommit statements. Each statement only updates rows still leased by this relay for this attempt (`status = 'in_flight' and locked_by = relayId and attempts = attempt`). Rows not updated produce a `leaseLost` event. |
| FR-33 | Must | Reclaim: every relay periodically (default every 10 s and once at start) returns in-flight messages whose lease expired to `pending` (or `dead` when attempts are exhausted), emitting `reclaimed`. A crashed relay's messages become deliverable after at most `leaseMs + reclaimIntervalMs`. |
| FR-34 | Must | Concurrency limit per relay (`concurrency`, default 10); claims never exceed free slots, so every claimed message starts delivery immediately. `batchSize` (default 10) ≤ `concurrency`. |
| FR-35 | Must | Per-message handler timeout (`handlerTimeoutMs`, default 30 s). Each handler receives an `AbortSignal` that aborts on timeout or forced shutdown. `leaseMs` (default 60 s) must be ≥ `handlerTimeoutMs + 1000`. |
| FR-36 | Must | `relay.start()` resolves after the schema version check, the initial reclaim and the LISTEN connection (when enabled). `relay.stop({ drainTimeoutMs })` stops claiming, waits for in-flight deliveries up to the drain timeout (default 30 s), flushes outcomes, then aborts the remaining handlers and releases their leases without counting the attempt. |
| FR-37 | Must | Relays are single use: `start()` twice or after `stop()` throws `OUTBOX_RELAY_STATE`; `stop()` is idempotent. An optional `signal` option stops the relay when aborted. |
| FR-38 | Must | Database errors inside the relay never crash the process: they are emitted as `error` events with a phase, and the loop continues with an error backoff (1 s doubling to 30 s). |
| FR-39 | Should | `relay.runOnce()` claims and delivers at most one batch and resolves after outcomes are flushed. It works without `start()` for tests and for cron-driven or serverless relays. |
| FR-40 | Must | In handlers mode the relay claims only topics that have a handler. In publisher mode it claims all topics unless `topics` is given. |
| FR-41 | Could | Lease extension (heartbeat) for handlers that legitimately run longer than the lease. Not in 0.1.0. |

### 6.5 Retries, dead letters and admin (TRD §9.3, §9.7)

| ID | Pri | Requirement |
|---|---|---|
| FR-45 | Must | Retry delay is exponential backoff with full jitter: `delay = floor(random() × (min(maxDelayMs, baseDelayMs × factor^(attempt−1)) + 1))`, defaults `baseDelayMs = 1000`, `factor = 2`, `maxDelayMs = 300000`, `jitter = 'full'`. The delay is computed in TypeScript (pure, unit-tested) and applied in SQL as `outbox_now() + delay`. |
| FR-46 | Must | `maxAttempts` defaults to 10 and is stored on each message at enqueue time. Attempts are counted at claim time, so an attempt that crashes the relay counts. |
| FR-47 | Must | A message whose attempt fails with `attempts >= max_attempts`, or whose handler throws `NonRetryableError`, moves to `dead` with `dead_at` and `last_error`. A handler may throw `RetryableError` with `retryAfterMs` to override the computed delay (clamped to `maxDelayMs`). |
| FR-48 | Must | `last_error` stores `"<code or name>: <message>"` truncated to 2000 characters and is kept after later success for diagnosis. |
| FR-49 | Must | `outbox.retryDead({ ids?, topic?, key?, limit = 1000 })` moves matching dead messages to `pending` with `attempts = 0` and `available_at = outbox_now()`; returns the ids. |
| FR-50 | Must | `outbox.skip(id)` moves a `pending` or `dead` message to `skipped`; any other status throws `OUTBOX_NOT_SKIPPABLE` with the current status. |
| FR-51 | Must | `outbox.purge({ olderThanMs, includeDead = false, batchSize = 5000 })` deletes `done` and `skipped` messages (and `dead` when asked) older than the cutoff in database time, in batches, and returns the count. |
| FR-52 | Should | `outbox.listDead({ topic?, limit = 100 })` returns dead messages, newest first. |

### 6.6 Ordering (TRD §9.4)

| ID | Pri | Requirement |
|---|---|---|
| FR-55 | Must | Relay option `ordering: 'key'` (default `'none'`). In ordering mode a keyed message is claimable only if no message with the same key and a lower `seq` is `pending`, `in_flight` or `dead`. Messages without a key are unordered. |
| FR-56 | Must | The key is global across topics: `order.created` and `order.paid` with key `order-42` are ordered relative to each other. |
| FR-57 | Must | A dead message blocks its key until `retryDead` or `skip`. A message in retry backoff blocks its key until it succeeds or dies. Docs explain head-of-line blocking and the throughput limit (one in-flight message per key). |
| FR-58 | Must | All relays that share an outbox table must use the same ordering mode. Docs state this; the library does not detect a mismatch. |

### 6.7 Wake-up (TRD §10)

| ID | Pri | Requirement |
|---|---|---|
| FR-60 | Must | Polling with idle backoff: after an empty claim the wait doubles from `poll.minIntervalMs` (default 100) to `poll.maxIntervalMs` (default 2000); a full batch claims again immediately; a partial batch waits `minIntervalMs`. |
| FR-61 | Must | LISTEN wake-up (relay option `listen`, default `true`): the relay listens on the outbox channel and wakes immediately on a notification, resetting the poll interval to the minimum. |
| FR-62 | Must | Polling stays the source of truth. A lost notification (no listener, dropped connection, transaction-mode pooler) delays delivery by at most `poll.maxIntervalMs`; it never loses a message. |
| FR-63 | Must | The listen connection reconnects with backoff (1 s to 30 s) and triggers one claim after reconnecting. `listen: { db }` accepts a separate direct connection for deployments behind a transaction-mode pooler. |

### 6.8 Delivery targets (TRD §9.5, §13)

| ID | Pri | Requirement |
|---|---|---|
| FR-65 | Must | Handlers: `handlers: { 'order.created': async (message, ctx) => {} }`. `ctx` has `signal`, `attempt`, `relayId`. Returning resolves the delivery; throwing fails it. |
| FR-66 | Must | `@firatkill/outbox/bullmq` exports `bullmqPublisher({ queue, jobName?, jobOptions, jobData? })`, where `queue` is one queue, a topic-to-queue map or a function (TRD §13.1). The job id is `outbox-<message id>`, so redelivered messages collapse into one job. `jobOptions.attempts` is required by the type and validated at runtime (≥ 1) because BullMQ retries are job options, not worker options. |
| FR-67 | Must | The BullMQ publisher uses a structural queue type (`add(name, data, opts)`) and does not import `bullmq`. Docs explain `removeOnComplete` retention versus the deduplication window. |
| FR-68 | Must | `@firatkill/outbox/webhook` exports `webhookPublisher({ url, secret, timeoutMs = 10000, headers?, fetch? })` that POSTs JSON and signs it with HMAC-SHA256 using the Standard Webhooks header scheme (`webhook-id`, `webhook-timestamp`, `webhook-signature`). |
| FR-69 | Must | Webhook outcomes: 2xx success; 408 and 429 retryable (429 honours `Retry-After`); other 4xx and all 3xx non-retryable (dead); 5xx, network errors and timeouts retryable. |
| FR-70 | Must | `@firatkill/outbox/webhook` exports `verifyWebhook({ secret, headers, body, toleranceSec = 300 })` for receivers. |
| FR-71 | Could | Batch publisher interface (`publishBatch(messages)`) for brokers with bulk APIs. Not in 0.1.0. |

### 6.9 Consumer inbox (TRD §9.8)

| ID | Pri | Requirement |
|---|---|---|
| FR-75 | Must | `outbox.withInbox(tx, consumer, messageId, fn)` and `createInbox({ db, schema, tablePrefix }).withInbox(...)` insert `(consumer, message_id)` into `outbox_inbox` with `ON CONFLICT DO NOTHING` inside the caller's transaction; if inserted, run `fn(tx)` and return `{ status: 'processed', result }`, otherwise return `{ status: 'duplicate' }` without calling `fn`. |
| FR-76 | Must | Concurrent duplicates are safe: the second insert waits for the first transaction; if it commits, the second returns `duplicate`; if it rolls back, the second processes. |
| FR-77 | Must | `messageId` is text (1..200 characters), so the inbox works for ids from other systems (BullMQ job ids, webhook ids). |
| FR-78 | Must | `purgeInbox({ olderThanMs, batchSize })` deletes old inbox rows. Docs state the retention rule: keep inbox rows longer than the longest possible redelivery window. |

### 6.10 Observability (TRD §14)

| ID | Pri | Requirement |
|---|---|---|
| FR-80 | Must | Typed events on the relay: `claimed`, `delivered`, `failed`, `dead`, `reclaimed`, `leaseLost`, `error`. A throwing listener never breaks the relay. |
| FR-81 | Must | `outbox.stats({ includeTerminal = false })` returns counts (`ready`, `scheduled`, `inFlight`, `expiredLeases`, `dead`, and `done`/`skipped` when asked) and `oldestReadyAgeMs` (age of the oldest message that is ready but not delivered), all in database time. |
| FR-82 | Must | Optional `tracer` option with an OpenTelemetry-compatible shape (`startSpan(name, attributes)` returning `{ setAttribute, recordException, end }`); the library does not depend on OpenTelemetry. Spans: `outbox claim`, `outbox deliver`, `outbox flush`. |
| FR-83 | Must | Headers pass through unchanged, so users can propagate `traceparent` from enqueue to handler. Docs show how. |
| FR-84 | Must | If no `error` listener is registered, errors are written to `console.error` at most once per 10 s per phase, so failures are never silent. |

### 6.11 CLI (TRD §8.4)

| ID | Pri | Requirement |
|---|---|---|
| FR-86 | Must | `outbox migrate [--url] [--schema] [--prefix] [--dry-run] [--status] [--print]`. `--url` defaults to `DATABASE_URL`. Uses the installed driver (postgres.js first, then pg; `--driver` overrides). |
| FR-87 | Should | `outbox stats [--url] [--schema] [--prefix] [--json]` prints `stats({ includeTerminal: true })`. |
| FR-88 | Could | `outbox retry-dead`, `outbox skip`, `outbox purge` subcommands. Not in 0.1.0. |

### 6.12 Testing, benchmark and CI (TRD §15, §16)

| ID | Pri | Requirement |
|---|---|---|
| FR-90 | Must | Vitest unit tests UT-01..UT-14 for backoff math, option parsing, validation, SQL rendering, UUIDv7, signing and scheduling logic. |
| FR-91 | Must | Integration tests INT-01..INT-91 against real PostgreSQL, run for both adapters where the test is adapter-relevant, covering every behaviour in this section of the PRD. |
| FR-92 | Must | CI matrix: Node 22, 24 × PostgreSQL 14, 16, 17, 18 as required cells, plus Node 20 × PostgreSQL 17 as a best-effort cell that cannot fail the workflow (D-41, D-42), using GitHub Actions service containers; locally via `docker compose`. |
| FR-93 | Must | Chaos runs CHAOS-01 (unordered) and CHAOS-02 (ordering mode): 4 relay child processes, one killed with SIGKILL every 1–3 s and respawned, for 30 s; then SQL invariants INV-01..INV-09 are checked. Runs in CI on every push and PR. |
| FR-94 | Must | `pnpm bench` reports messages per second for batch sizes 10, 100, 500; results are committed as JSON in `bench/results/` with the runner spec, and the README table is generated from the latest file. |
| FR-95 | Must | `publint`, `@arethetypeswrong/cli` and `size-limit` run in CI and fail the build on errors. |
| FR-96 | Must | Changesets for versioning and changelog; publish workflow on GitHub release with npm provenance via OIDC; docs deploy to Vercel through its Git integration (TRD §16.5). |

### 6.13 Docs site, example and README (TRD §17, §18)

| ID | Pri | Requirement |
|---|---|---|
| FR-100 | Must | VitePress site at https://outbox.firatkil.com with pages: Why an outbox, Quick start (postgres.js and pg), Concepts, Guarantees and failure modes, Ordering, Retries and dead letters, Consumers and the inbox, BullMQ and webhooks, Operations, API reference, FAQ, Comparison. Content requirements per page are TRD §18.3. |
| FR-101 | Must | Concepts page has a Mermaid lifecycle state diagram and a sequence diagram, matching TRD §2. |
| FR-102 | Must | API reference is generated by TypeDoc from TSDoc comments on every public export; the build fails on TypeDoc warnings. |
| FR-103 | Must | Every code sample on the site is type-checked in CI (`pnpm docs:check`, TRD §18.4). |
| FR-104 | Must | The guarantees page reproduces GU-01..GU-09 and the crash-point table from TRD §12 verbatim. |
| FR-108 | Must | Comparison page: CDC/Debezium, pg-boss, graphile-worker, a hand-rolled outbox; fair and brief; states that this library is the outbox plus relay, not a general job queue. |
| FR-110 | Must | `examples/orders`: a plain `node:http` service (no framework) that creates orders and enqueues `order.created` in the same transaction, with a relay whose handler records a fake email through `withInbox`; `docker compose up` runs it. |
| FR-111 | Must | README: one-paragraph problem statement, 15-line quick start (at most 15 non-blank lines), guarantees table, link to docs, benchmark table with runner spec, how it is tested (chaos test), pointer to the comparison page, license. Exact outline in TRD §18.6. |

---

## 7. Delivery guarantees (summary)

These are the public contract. The precise wording, including preconditions, is in TRD §12.1 and is reproduced on the docs guarantees page (FR-104). Each guarantee maps to tests in TRD §12.3.

| ID | Guarantee | Holds when |
|---|---|---|
| GU-01 | Atomic enqueue: a message exists if and only if the transaction that enqueued it commits | `enqueue` received the transaction handle, not the root pool |
| GU-02 | At-least-once delivery: every committed message is eventually delivered successfully, or reaches `dead`, or is skipped | At least one relay with a matching topic runs and the database is reachable |
| GU-03 | Bounded attempts: a message is claimed at most `max_attempts` times before it becomes `dead`, unless an operator calls `retryDead` | Always |
| GU-04 | No concurrent delivery of one message while its lease is valid | The handler finishes within `leaseMs` (enforced by `handlerTimeoutMs < leaseMs` and handlers honouring the abort signal) and the database clock does not jump forward |
| GU-05 | Exactly-once effects for effects written in the consumer's transaction through `withInbox` | The consumer uses `withInbox` and lets errors roll back the transaction; effects outside that database are not covered |
| GU-06 | Per-key ordering in ordering mode: a keyed message is not claimed until every same-key message with a lower `seq` is `done` or `skipped` | All relays use `ordering: 'key'`; only between messages whose enqueuing transactions did not overlap (TRD §12.1) |
| GU-07 | No early delivery: a message is never claimed before `available_at` in database time | Always |
| GU-08 | Bounded discovery latency: a ready message is claimed within `poll.maxIntervalMs` plus one claim round trip, even without notifications | A relay with free slots runs |
| GU-09 | Crash recovery: a message leased by a crashed relay becomes claimable again within `leaseMs + reclaimIntervalMs` of the claim | Another relay (or the restarted one) runs |

Not guaranteed, stated explicitly: exactly-once delivery; ordering without ordering mode; ordering across keys; ordering between messages enqueued by overlapping transactions; delivery when no relay runs; side effects outside the consumer's database happening once.

---

## 8. Non-functional requirements

### 8.1 Correctness (NFR-01..NFR-05)

| ID | Pri | Requirement |
|---|---|---|
| NFR-01 | Must | GU-01..GU-09 hold and each has a passing test (TRD §12.3). |
| NFR-02 | Must | INV-01..INV-09 (TRD §15.5) report zero violations after every CHAOS run and after INT-22 and INT-41. |
| NFR-03 | Must | No relay code path holds a database transaction open while a handler or publisher runs. A static guard (`pnpm check:guards`, G-2 in TRD §16.6) fails the build if `.transaction(` appears anywhere in `src/core/relay/`. |
| NFR-04 | Must | All SQL is parameterised. Identifiers (schema, prefix) are validated against `^[a-z_][a-z0-9_]*$` with length limits and double-quoted when rendered; no user value is ever concatenated into SQL. |
| NFR-05 | Must | Database time only (FR-18). A static guard (G-3) fails the build if `Date.now(` or `new Date(` appears in `src/core/` or `src/adapters/` outside the allowlisted files in TRD §11.4 (`src/core/uuid.ts`, `src/core/row.ts`). |

### 8.2 Performance (NFR-10..NFR-13)

| ID | Pri | Requirement |
|---|---|---|
| NFR-10 | Must | BENCH-01 on a GitHub-hosted `ubuntu-24.04` runner with a PostgreSQL 17 service container, one relay, no-op handler, LISTEN off: median ≥ 500 msg/s at batch size 10, ≥ 2,000 msg/s at 100, ≥ 3,000 msg/s at 500. If a target is not met, record the measured number and the reason in §14 before release; never edit results. |
| NFR-11 | Must | INT-50: with LISTEN enabled and an idle relay whose poll interval is 5 s, p50 latency from enqueue commit to handler start ≤ 50 ms, max ≤ 500 ms over 20 messages. |
| NFR-12 | Must | An idle relay with LISTEN on and default poll settings issues at most one claim statement per `poll.maxIntervalMs` (plus one reclaim per `reclaimIntervalMs`). |
| NFR-13 | Should | Enqueue of a 100-message batch is one round trip (one statement) in the caller's transaction (INT-12 asserts the statement count). |

### 8.3 Package (NFR-20..NFR-23)

| ID | Pri | Requirement |
|---|---|---|
| NFR-20 | Must | size-limit (min + brotli): core entry ≤ 14 kB; `postgres-js` and `pg` entries with `createOutbox` ≤ 14 kB each; `webhook` ≤ 3 kB; `bullmq` ≤ 2 kB; `testing` ≤ 2 kB. |
| NFR-21 | Must | Zero runtime dependencies. Only Node built-ins (`node:crypto`, `node:os`) and the user's driver are imported. |
| NFR-22 | Must | `publint` reports no errors or warnings; `attw --pack --profile node16` reports no problems for any entry point. |
| NFR-23 | Must | The published tarball contains only `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json` (checked with `npm pack --dry-run` in CI). |

### 8.4 Compatibility (NFR-30..NFR-33)

| ID | Pri | Requirement |
|---|---|---|
| NFR-30 | Must | Node.js 22 and 24 are supported and tested in required CI cells. Node.js 20 (end of life April 2026) is best-effort: `engines.node` stays `">=20.11"`, one non-blocking CI cell runs it, regressions there are fixed when cheap, and it may be dropped in any 0.x minor with a changeset (D-41). |
| NFR-31 | Must | PostgreSQL 14, 16, 17 and 18 are supported and tested in required CI cells. PostgreSQL 14 reaches end of life in November 2026: it is supported for 0.1.0 and becomes best-effort (non-blocking cell) from the first release after its end-of-life date (D-42). 15 is expected to work and is not tested. |
| NFR-32 | Must | Drivers: `postgres` ^3.4 and `pg` ^8.11 (verify current majors, A-03). Works through PgBouncer or Supavisor in transaction mode for everything except LISTEN (docs "Operations"). |
| NFR-33 | Must | TypeScript consumers on `moduleResolution` `node16`, `nodenext` and `bundler` get correct types for ESM and CJS. |

### 8.5 Code quality (NFR-40..NFR-43)

| ID | Pri | Requirement |
|---|---|---|
| NFR-40 | Must | TypeScript `strict` with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`. No `any` (ESLint error), no non-null assertions in `src/`, no `@ts-ignore`. |
| NFR-41 | Must | Every public export has a TSDoc comment with at least one `@example` for functions (TypeDoc fails on missing docs, FR-102). |
| NFR-42 | Must | Line coverage of `src/` ≥ 90% across unit plus integration tests (Vitest v8 coverage, reported in CI, threshold enforced). |
| NFR-43 | Must | Every behaviour change has an integration test; every public API change has a changeset (AGENTS.md). |

### 8.6 Documentation quality (NFR-45..NFR-47)

| ID | Pri | Requirement |
|---|---|---|
| NFR-45 | Must | Docs build with zero warnings, zero dead links (VitePress `ignoreDeadLinks: false`), and every sample type-checks (FR-103). |
| NFR-46 | Must | Plain technical English, no marketing language, no emoji. Every option on the API reference shows its default and range. |
| NFR-47 | Should | A new user reaches a delivered message from the quick start in ≤ 15 minutes (owner-timed with one external tester before 0.1.0). |

### 8.7 Cost (NFR-50)

| ID | Pri | Requirement |
|---|---|---|
| NFR-50 | Must | $0 per month: npm public package, GitHub Actions on a public repository, Vercel Hobby plan for the static docs site. No servers, no paid services, no telemetry in the library or on the docs site (Vercel Analytics and Speed Insights stay off). |

---

## 9. Statuses (summary)

Full state machine and SQL in TRD §2.2 and §9.

| Status | Meaning | Leaves by |
|---|---|---|
| `pending` | Waiting to be claimed; claimable when `available_at <= outbox_now()` (and, in ordering mode, when it is the head of its key) | claim → `in_flight`; `skip` → `skipped` |
| `in_flight` | Leased by `locked_by` until `locked_until` | complete → `done`; fail → `pending` or `dead`; lease expiry → `pending` or `dead`; shutdown release → `pending` |
| `done` | Delivered successfully at least once | purge (deleted) |
| `dead` | Attempts exhausted or non-retryable failure | `retryDead` → `pending`; `skip` → `skipped`; purge with `includeDead` |
| `skipped` | An operator gave up on it | purge (deleted) |

---

## 10. Success metrics

| Metric | Target | Source |
|---|---|---|
| CI pass rate on `main` | 100% of the last 20 runs | GitHub Actions |
| Integration matrix | 8 of 8 required cells green on every release (the best-effort Node 20 cell is reported, not required) | `ci.yml` |
| Chaos invariant violations | 0 across every CI run | CHAOS-01/02 job logs |
| Benchmark | NFR-10 targets met, results ≤ 30 days old at each release | `bench/results/latest.json` |
| Package size | within NFR-20 on every release | size-limit job |
| Coverage | ≥ 90% lines | CI coverage summary |
| Quick start time | ≤ 15 minutes for one external tester | manual, recorded in §14 |
| Adoption signals (tracked, no target for 0.1.0) | npm weekly downloads, GitHub stars, issues opened by people other than the owner, dependents | npm and GitHub |
| Reviewer signal | The owner can walk a reviewer through claim, lease, fencing and the crash table in 10 minutes using only the docs site | manual |

## 11. Milestones

| ID | Name | Exit criteria | Tasks |
|---|---|---|---|
| M0 | Setup | Repo skeleton, tooling, compose Postgres, test harness, CI static job green | T-01..T-03 |
| M1 | Schema, enqueue, migrations | DDL, migration runner, `migrationSql`, CLI migrate, both adapters, enqueue with dedupe and delay, test clock; INT-01..INT-18 (INT-06 via `schemaVersion()`; the direct-claim part of INT-15 and the `available_at` part of INT-16), INT-80, INT-82 (enqueue and migration reads) and INT-90 green | T-04..T-11 |
| M2 | Relay claim/complete/fail and leases | Option parsing, claim/complete/fail/reclaim SQL, relay engine, timeouts, abort, fencing, lifecycle; INT-20..INT-29, INT-70..INT-73, INT-81..INT-83, the relay parts of INT-15 and INT-16, and INT-06 via `relay.start()` green | T-12..T-18 |
| M3 | Retries, dead letters, admin | Backoff applied, dead transitions, `retryDead`, `skip`, `purge`, `listDead`, `stats`, CLI; INT-30..INT-39 and INT-91 green | T-19..T-21 |
| M4 | Ordering and LISTEN | Ordering-mode claim, ordering tests, NOTIFY in enqueue, LISTEN in both adapters, wake-up scheduling; INT-19 and INT-40..INT-54 green | T-22..T-25 |
| M5 | Inbox and publishers | `withInbox`, `createInbox`, events and tracer, BullMQ and webhook publishers, `verifyWebhook`; INT-60..INT-65, INT-74, INT-75, INT-85..INT-87 green | T-26..T-29 |
| M6 | Chaos, bench, CI matrix | CHAOS-01/02, BENCH-01 with committed results, full CI matrix, publint/attw/size-limit gates | T-30..T-33 |
| M7 | Docs site, example, first release | VitePress site live, example with EX-01 green, README, publish workflow, 0.1.0 on npm with provenance | T-34..T-39 |

## 12. Out of scope (0.1.0)

Cron or recurring schedules; job priorities; per-topic rate limits; lease heartbeat (FR-41); batch publisher interface (FR-71); admin CLI subcommands beyond `migrate` and `stats` (FR-88); multi-database or cross-database transactions; exactly-once delivery claims; WAL-based change data capture; Kafka, SQS, RabbitMQ, NATS or Azure Service Bus publishers (users write a 10-line `publisher`; docs show one for SQS as a sketch); a web dashboard; Deno, Bun, browsers and edge runtimes; ORM-specific adapters (Drizzle, Prisma and Knex are covered by `migrationSql` and by passing the underlying driver transaction); PostgreSQL 19 in the CI matrix (Could, D-42); automatic purge inside the relay.

## 13. Risks and mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-01 | npm scope `@firatkill` does not exist or is not owned by the owner (GitHub user is `firatkill`, with two l's) | Medium | Cannot publish under the planned name | A-01 check in T-01; fallback `@firatkill/outbox` with a global rename in one commit and a row in §14 |
| R-02 | Node 20 is end of life (April 2026) and PostgreSQL 14 reaches end of life in November 2026 | Certain | CI images or setup-node may drop them; users on them get no security fixes upstream | Node 20 is best-effort from the start and PostgreSQL 14 becomes best-effort after its end of life (D-41, D-42); best-effort cells cannot fail CI; if an image or runtime becomes unavailable, keep the last passing run as evidence, remove the cell and record it in §14 |
| R-03 | Benchmark numbers vary between runners | High | Noisy README table | Median of 3 runs, runner CPU model and count recorded in the JSON; targets have headroom |
| R-04 | Chaos test is flaky because of timing | Medium | Red CI, lost trust | Invariants are about final state, not timing; drain phase has a 60 s bound; seed printed on every run and accepted as `--seed` to reproduce |
| R-05 | Users misread at-least-once as exactly-once | High | Duplicate side effects in their systems | Guarantees page, inbox helper, README guarantees table, FAQ entry "Why did my handler run twice?" |
| R-06 | NOTIFY at commit serialises committing transactions under very high write rates | Low | Enqueue throughput ceiling | `notify` can be turned off per outbox; docs "Operations" explains the trade-off; polling still works |
| R-07 | Head-of-line blocking in ordering mode stalls a key indefinitely after a dead message | Certain by design | One key stops | `dead` event, `stats().dead`, `skip(id)`, docs "Ordering" runbook |
| R-08 | Driver behaviour differs (parameter typing, LISTEN quoting, type parsing) | Medium | Adapter bugs | All SQL returns driver-neutral types (text, int4, float8, boolean); every INT test runs for both adapters (A-03, A-04) |
| R-09 | tsup maintenance status or CJS code splitting behaviour changes | Medium | Build changes | A-07; fallback tsdown with identical output layout; `attw` and `publint` gate the result |
| R-10 | A handler ignores the abort signal and runs past the lease | Medium | Concurrent delivery and, in ordering mode, out-of-order delivery for that key | Fencing makes the late completion a no-op (`leaseLost`); docs state GU-04 and GU-06 preconditions; `handlerTimeoutMs < leaseMs` enforced |
| R-11 | Outbox table bloat from `done` rows | High in busy systems | Slower claims, disk growth | Partial indexes keep claims independent of `done` volume; `purge` in batches; docs "Operations" shows a cron and autovacuum settings |
| R-12 | BullMQ custom job id rules change | Low | Publisher errors | A-06; job id format is prefixed (`outbox-<uuid>`) so it is never an integer; INT-85 runs against real Redis |

## 14. Decisions log

Decisions from the brief are fixed. Decisions marked "made in docs" were made while writing these documents and may be revisited only through this log (add a row; never edit an old row's decision).

| ID | Decision | Source | Rationale |
|---|---|---|---|
| D-01 | Node.js 20+ (CI 20, 22, 24), ESM + CJS via tsup, full types, zero runtime dependencies, drivers as optional peers | brief | |
| D-02 | Adapters for postgres.js and pg as separate entry points | brief | |
| D-03 | PostgreSQL 14+ (CI 14, 16, 17) | brief | |
| D-04 | Claim with `FOR UPDATE SKIP LOCKED` and a lease (`locked_until`, `locked_by`), deliver outside any transaction, complete in a second short statement | brief | |
| D-05 | Exponential backoff with full jitter, `dead` status, `retryDead`, `purge`, `skip` | brief | |
| D-06 | Optional per-key ordering mode | brief | |
| D-07 | Polling with idle backoff plus optional LISTEN/NOTIFY; polling is the source of truth | brief | |
| D-08 | In-process handlers or a publisher; BullMQ and webhook publishers in separate entry points | brief | |
| D-09 | Inbox helper with `ON CONFLICT DO NOTHING` | brief | |
| D-10 | Vitest; real PostgreSQL in CI service containers; chaos script; benchmark committed as JSON | brief | |
| D-11 | pnpm, Changesets, provenance via OIDC, docs on Vercel (see D-53) | brief | |
| D-12 | The API is an instance: `createOutbox({ db, schema, tablePrefix, ... })` returns `enqueue`, `createRelay`, `withInbox`, admin helpers and `stats`; `createRelay` accepts an optional `db` override | made in docs | Table names, notify channel and defaults must be shared between enqueue and relay; one instance avoids repeating config and mismatches |
| D-13 | Claim, complete, fail and reclaim are each one autocommit statement (CTE + `UPDATE ... RETURNING`), not an explicit `BEGIN ... COMMIT` | made in docs | One round trip; the statement is its own short transaction; works through transaction-mode poolers |
| D-14 | Message id is a UUIDv7 generated in TypeScript; `seq bigint generated always as identity` orders messages | made in docs | UUIDs are globally unique, so the inbox works across producers and BullMQ job ids never look like integers; v7 keeps primary-key inserts index-local; knowing ids before the insert makes dedupe results unambiguous |
| D-15 | Backoff is computed in TypeScript and applied relative to database time in SQL | made in docs | Pure function is unit-testable with an injected random source; supports `retryAfterMs` (429 `Retry-After`); no application clock involved |
| D-16 | Attempts are incremented at claim, not at failure | made in docs | A message that crashes the relay (OOM, segfault in a native module) still exhausts its attempts instead of looping forever |
| D-17 | Fencing by `(locked_by, attempts)` on complete and fail; a late completion after lease loss is a no-op with a `leaseLost` event | made in docs | Prevents a slow relay from overwriting the outcome of the relay that took over |
| D-18 | `maxAttempts` default lives on the outbox config and is stored per message at enqueue | made in docs | The row is self-describing; relays with different settings cannot disagree about when a message is dead |
| D-19 | NOTIFY is sent by `enqueue` in the same statement (not by a trigger); `notify: true` by default, can be turned off | made in docs | No trigger to install or forget; no per-row trigger cost; the caller can opt out where NOTIFY commit serialisation matters; raw SQL inserts are still picked up by polling |
| D-20 | `batchSize` must be ≤ `concurrency`; claims are sized to free slots | made in docs | Every claimed message starts immediately, so the lease only needs to cover one handler timeout plus flush time |
| D-21 | Shutdown releases unfinished leases and decrements `attempts` (the attempt is not counted) | made in docs | A deploy is not the message's fault; counting it would push healthy messages toward `dead` |
| D-22 | Test clock: production `outbox_now()` is `select now()`; `@firatkill/outbox/testing` replaces it with a version that adds an offset from `set local outbox.test_offset_ms` (per transaction) or from a per-schema `outbox_test_clock` row (visible to relay connections and child processes) | made in docs | Zero production overhead and nothing to misconfigure in production; per-transaction setting survives transaction-mode poolers; the row works across pooled connections and processes, like bidlock's split (bidlock PRD D-06, D-07) |
| D-23 | PostgreSQL 18 is a Could for the matrix after 0.1.0 | made in docs | The brief fixes 14/16/17; 18 is released and should work, adding it later is non-breaking |
| D-24 | Docs site uses VitePress, not Starlight | made in docs | Single config file, built-in local search, Vite toolchain shared with Vitest, mature TypeDoc integration (`typedoc-plugin-markdown` + `typedoc-vitepress-theme`), Mermaid via one plugin; Starlight's strengths (i18n, content collections) are not needed |
| D-25 | API reference is generated by TypeDoc; guides are hand-written | made in docs | Generated reference cannot drift from the types; guides carry the reasoning |
| D-26 | Example app uses plain `node:http`, no framework | made in docs | Shows the library needs nothing else; nothing to learn for readers who do not use Hono |
| D-27 | Webhook signatures follow the Standard Webhooks scheme (`webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64>` over `id.timestamp.body`) | made in docs | Receivers can verify with existing Standard Webhooks libraries; the brief only requires HMAC-SHA256 in a header |
| D-28 | 3xx webhook responses are non-retryable; redirects are not followed | made in docs | A redirect means a misconfigured URL; following it could leak the signature to another host |
| D-29 | Error identity uses a `Symbol.for` brand and `code`, not only `instanceof` | made in docs | ESM and CJS builds can both be loaded in one process (dual package hazard); `isOutboxError(err, code?)` works across both |
| D-30 | Every SQL result is cast to driver-neutral types (`::text` for ids, seq and JSON; `float8` epoch milliseconds for timestamps; `int4` for counts) and parsed in core | made in docs | postgres.js and pg parse `int8`, `jsonb` and `timestamptz` differently; casting keeps adapters thin and behaviour identical |
| D-31 | Batched statement inputs are one JSON text parameter expanded with `jsonb_array_elements` / `jsonb_to_recordset` | made in docs | Avoids array-parameter serialisation differences between drivers; one statement for any batch size |
| D-32 | Identifiers: schema ≤ 30 characters, prefix 1..20 characters, both `^[a-z_][a-z0-9_]*$`; NOTIFY channel `<schema>.<prefix>messages` | made in docs | Fits the 63-byte identifier limit for every derived name; channel is unique per outbox |
| D-33 | Relays are single use (no restart after stop) | made in docs | Simpler state machine; a new relay is cheap |
| D-34 | Inbox `message_id` is `text`, not `uuid` | made in docs | Consumers may receive ids from BullMQ, webhooks or other producers |
| D-35 | Ordering keys are global across topics | made in docs | The common need is ordering the events of one entity (`order.created` before `order.paid`) |
| D-36 | `last_error` is kept after a later success | made in docs | Flaky handlers are visible in data after the fact |
| D-37 | BullMQ publisher uses structural types and job id `outbox-<uuid>` | made in docs | No type dependency on bullmq; prefix guarantees the id is never parsed as an integer |
| D-38 | Lease-expired messages become claimable immediately (no backoff) | made in docs | The lease itself already delayed the retry by `leaseMs`; SQL stays free of random-number logic |
| D-39 | VitePress site lives in `site/`; `docs/` holds the specs | made in docs | Specs and the public site have different audiences and must not mix |
| D-40 | `stats()` excludes `done` and `skipped` counts unless `includeTerminal: true` | made in docs | Counting terminal rows scans the largest part of the table; the default must be cheap enough to call every 10 s |
| D-41 | Node.js support: 22 and 24 supported (required CI cells); 20 best-effort (`engines` stays `>=20.11`, one non-blocking CI cell Node 20 × PostgreSQL 17, may be dropped in a 0.x minor with a changeset). Refines D-01 and replaces the "dropping Node 20 is breaking" clause of NFR-30 | made in review (2026-10-21) | Node 20 reached end of life in April 2026, before the first release; promising full support for an unsupported runtime would let it block releases. Keeping `engines` and one cell costs nothing and keeps the brief's "Node 20+" install working |
| D-42 | PostgreSQL support: 14, 16, 17 and 18 supported (required CI cells); 14 becomes best-effort (moved to a non-blocking cell, same procedure as Node 20) from the first release after its end of life on 2026-11-12; 19, once released, is a Could after 0.1.0. Refines D-03 and supersedes D-23 | made in review (2026-10-21) | 18 has been the current stable major since September 2025, so a library released in late 2026 must test it; 14 is still supported upstream on the release date, so it stays required for 0.1.0, but it must not block releases after upstream stops fixing it |
| D-43 | Ordering mode serialises a key through row state (a lower-`seq` message in `pending`/`in_flight`/`dead` blocks the key, checked with `not exists` in the claim), not through advisory locks or a per-key lock table | made in review (2026-10-21) | The blocking state outlives the autocommit claim statement and needs no cleanup after a crash; stale snapshots can only be conservative (TRD §9.4 correctness argument); advisory locks would either end with the claim statement (xact) or break through transaction-mode poolers and survive a hung relay (session). Overlapping enqueue transactions remain the documented exception (GU-06) |
| D-44 | The first publish (0.1.0) authenticates with a short-lived granular npm token stored as the `npm` environment secret `NPM_TOKEN`, still through `publish.yml` with provenance; trusted publishing (OIDC) is configured right after and the token revoked | made in review (2026-10-21) | npm lets a trusted publisher be configured only for an existing package (A-02), and AGENTS.md forbids publishing from a local machine |
| D-45 | The webhook publisher throws only `RetryableError` or `NonRetryableError`; the specific reason (`OUTBOX_WEBHOOK_STATUS`, `_TIMEOUT`, `_NETWORK`) is `details.reason` and the message prefix, so `last_error` reads `OUTBOX_RETRYABLE: OUTBOX_WEBHOOK_TIMEOUT: ...` | made in review (2026-10-21) | The relay classifies by error code; a third code would either be unclassifiable or need a second classification path. The reason stays visible in `last_error` and events |
| D-46 | The library version is inlined at build time (`__OUTBOX_VERSION__` via tsup and Vitest `define`) and exported as `VERSION`; it feeds `outbox --version` and the webhook `user-agent` | made in review (2026-10-21) | Reading `package.json` at runtime differs between ESM and CJS and would need `node:fs`/`node:module` in core, which the module boundaries forbid |
| D-47 | Every SQL parameter has an explicit cast, and every `for update [skip locked]` CTE that feeds an UPDATE or DELETE is `as materialized` | made in review (2026-10-21) | Both drivers send parameters untyped; uncast parameters in `limit` or arithmetic positions are resolved by the server inconsistently. Materialising pins the lock-then-modify plan that the concurrency tests prove |
| D-48 | `stats()` S1 is written as one scalar subquery per partial index | made in review (2026-10-21) | A single `status in (...)` scan is implied by none of the partial indexes and degrades to a sequential scan on a large table, contradicting D-40's "cheap by default" |
| D-49 | `pnpm typecheck` covers `src`, `tests`, `scripts` and root config files; site snippets are type-checked by `docs:check` (paths to `src`), the VitePress config by `docs:build`, the example by its own build. Tests and scripts import library code from `src/` by relative path | made in review (2026-10-21) | Package-name imports resolve to `dist/`, which does not exist when CI runs `typecheck` before `build`; `site/api` (needed by the VitePress config) is generated only by `docs:api` |
| D-50 | `testClock()` reaches the adapter through a non-public `Symbol.for('@firatkill/outbox/internal')` property on objects from `createOutbox`/`createInbox` | made in review (2026-10-21) | The public `Outbox` interface exposes no executor; a registry symbol works across the ESM and CJS builds like the error brand (D-29) and keeps the testing entry out of production paths |
| D-51 | UUIDv7: 12-bit counter in `rand_a` starting at a random value in 0..2047 each new millisecond; on overflow the timestamp field advances by 1 ms; the generator never emits a timestamp lower than the last one, even if `Date.now()` moves back | made in review (2026-10-21) | RFC 9562 §6.2 method 1; keeps ids unique and increasing within a process without affecting delivery order (which uses `seq`) |
| D-52 | The chaos producer records in `chaos_produced` only enqueue results with `deduped: false`; deduplicated results are checked in memory | made in review (2026-10-21) | A deduplicated result repeats the first id, and inserting it again would violate `chaos_produced`'s primary key and crash the producer |
| D-53 | Docs hosting moved from GitHub Pages to Vercel (outbox.firatkil.com) by owner decision on 2026-10-21; owner standard: every deployed site is on Vercel. | owner (2026-10-21) | One host for all of the owner's sites; Vercel Hobby is $0 for a static site, gives pull request previews and a custom domain, and keeps NFR-50 |
| D-54 | Apply the existing OWNER-DECISIONS.md precedence rule to the support-matrix conflict: its Node 20/22/24 and PostgreSQL 14/16/17 list controls over the differing D-41/D-42 and TRD matrix until the owner explicitly changes that decision. Reconcile affected implementation tasks accordingly. | Existing owner decision and precedence rule, recorded during setup (2026-10-21) | Records the conflict without silently treating later document-review decisions as owner approval. |
| D-55 | Create public GitHub repository `firatkill/outbox`, add `origin`, and push the local setup commits. | Owner approval in conversation (2026-10-21): “yes, go on.” | Satisfies repository-setup and external-resource approval checkpoints; implementation continues task by task, stopping at each milestone. |
| D-56 | Adopt the A-07 tsdown fallback, preserving the six entry points, ESM/CJS declarations, Node runtime support and zero runtime dependencies; use Node 22 for build tooling. npm ownership was reverified as firatkill after local login. | Owner approval in conversation (2026-10-21) | tsup is no longer actively maintained. The owner approved the fallback; authenticated npm access now succeeds and the package returns E404. |
| D-57 | Vitest projects explicitly inherit the root configuration with `extends: true`, including the build-time version define. T-01 uses the specified Vitest 4 line and TypeScript 5.9 fallback; ESLint adds its development-only Prettier compatibility configuration. | Implementation clarification (2026-10-21), TRD §3/§15.4 | Preserves the specified version injection and lint semantics without changing runtime behavior or public defaults. |
| D-58 | During M0 bootstrap, keep T-01 and T-02 as stacked draft PRs until the T-03 static workflow validates their combined tree; merge only after that check is green. Later tasks require their own PR checks normally. | Implementation sequencing clarification (2026-10-21) | T-01/T-02 precede the task that creates CI. No runtime scope or default changes; preserves the CI-before-merge milestone gate. |

| D-59 | Give Vitest's unit and integration projects distinct sequence.groupOrder values so direct invocations spanning both projects work with their differing worker limits. Normalize ESLint adapter restriction patterns to object form without changing prohibited imports. | Implementation clarification during T-05 (2026-10-21) | The first adapter file and combined targeted run exposed latent tooling configuration errors; runtime behavior and defaults are unchanged. |
| D-60 | Introduce the Node 22 / PostgreSQL 17 integration CI job in T-05, then expand it to the owner-approved full matrix in T-32. | Implementation sequencing clarification (2026-10-21) | The plan requires task acceptance in CI; waiting until T-32 would leave M1's real-database tests unverified on PRs. Uses the existing public-repository workflow and local/CI database image; no new external project or paid service. |
| D-61 | Defer only docs:check and docs:build until their tooling is implemented in T-34. All other applicable checks remain mandatory. | Owner approval in conversation (2026-10-21): ‘Defer docs gates until T-34’ | Resolves the conflict between AGENTS.md's per-task docs gates and the ordered implementation plan without moving docs-site scope into M1. |
| D-62 | Activate the existing TRD 4.4 size configuration and package/size CI checks in T-06, when the first substantial public exports are wired. T-33 still adds its complete package smoke and tarball checks. | Implementation sequencing clarification (2026-10-21) | AGENTS.md requires these checks for entry-point changes; D-61 defers only docs gates. No thresholds or runtime defaults change. |
| D-63 | Until T-08/T-09 implement createOutbox, measure each adapter entry's current exports with import '*' and its unchanged 12 kB limit; restore the createOutbox-specific measurement as each adapter lands. | Owner approval in conversation (2026-10-21): ‘Approve staged adapter size checks’ | The exact final config cannot import a function that does not yet exist. Current-export measurements do not claim verification of future adapter code. |
| D-64 | Pre-encoded JSON parameters cast through text before jsonb (`$n::text::jsonb`) in all normative statements. | Owner approval in conversation (2026-10-21): ‘Approve text-first JSON casts’ | T-08 disproved A-03: postgres.js describes jsonb parameters and JSON-serializes the encoded string again. Text-first casts preserve JSON with both drivers; no runtime dependency, default, invariant or migration changes. |

| D-65 | The structural pg notification payload is `payload?: string` with explicit `undefined` allowed, matching node-postgres types under exactOptionalPropertyTypes. | Owner approval in conversation (2026-10-21): ‘i approve.’ | A strict typecheck verified this one-line correction lets real Pool/Client handles satisfy the structural contract without importing driver types or changing runtime behavior. |

| D-66 | Staged concurrency gates: INT-24 from T-16, INT-22 from T-18, INT-41 from T-23, INT-62 from T-26, both chaos modes from T-30. Earlier tasks run all available checks and explicitly retain future verification limits. INT-82 claim mapping is T-18, listDead T-20 and stats T-21. | Owner approval in conversation (2026-10-21): Approve both | Preserves ordered implementation without claiming unimplemented guarantees verified. |
| D-67 | Finite integer relay counts and millisecond options within existing ranges; retry.factor accepts any finite number 1..10. Invalid values aggregate as OUTBOX_CONFIG issues. | Owner approval in conversation (2026-10-21): Approve both | Resolves fractional option ambiguity without changing defaults or limits. |

| D-68 | Internal relay scheduling uses prevMs=0 for the first empty claim after nonempty work or a wake; queued runOnce calls serialize; claimed deliveries are registered before emitting claimed so synchronous stop listeners cannot miss them. | Implementation clarification during T-14 (2026-10-21) | Preserves the specified polling sequence, per-relay concurrency bound and drain accounting without changing any default or guarantee. |

| D-69 | Raise only the core min+Brotli size budget to 12 kB; retain all other limits and the measurement method. | Owner approval in conversation: i approve. continue | T-14 core measured 10494 bytes against 10000; the approved limit preserves implemented behavior. Later features remain subject to the limits. |

| D-70 | INT-29 specifies a 5 s lease, 4 s handler timeout and 500 ms reclaim interval so an uncertain claim can recover within its 30 s test window. Test-owned postgres.js pools explicitly end with timeout zero after relay/transaction work has been awaited. | Test-harness clarification during T-18 (2026-10-21); no public option/default change | The fault-test setup left lease settings open. Separately, diagnostics proved all messages delivered and the relay stopped before default pool cleanup hung after backend termination. Production adapters continue to leave pool ownership to callers. |
| D-71 | Admin options reject invalid/unknown fields with OUTBOX_CONFIG and details.issues before SQL; integer counts and nonnegative safe-integer olderThanMs; booleans and enqueue topic/key rules. Invalid retryDead.ids uses OUTBOX_INVALID_MESSAGE; malformed skip IDs use OUTBOX_NOT_FOUND without SQL. | Owner approval in conversation (2026-10-21) | Clarifies observable validation without changing defaults or documented ranges; see M3-APPROVAL-PROPOSAL.md. |
| D-72 | Core and both adapter size ceilings are 13 kB, retaining imports/compression and other limits. INT-29 uses fetch_types:false only on its test-owned postgres.js worker. | Owner approval in conversation (2026-10-21): i approve. continue | M3-GATE-PROPOSAL.md records measured size and the driver-internal unhandled type-discovery rejection; no fault assertions, production pool settings or error reporting are weakened. |

| D-73 | Move relay LISTEN lifecycle, reconnect retries and wake wiring from T-25 into T-24; T-25 retains latency/polling/backoff acceptance and resulting fixes. | Owner approval in conversation: continue with your suggestion. you decide. | T-24 INT-52/INT-54 require a listening, waking relay; this resolves the task dependency conflict without changing behavior or gates. |

| D-74 | Accept the documented postgres.js 3.4.9 post-reconnect unlisten limitation: immediately suppress adapter callbacks on close and call unlisten; a retained driver subscription is cleaned up when the caller ends its pool. Recommend a dedicated listen pool for deterministic cleanup. | Owner approval: Approve documented workaround | M4-LISTEN-PROPOSAL.md records the driver-only reproduction. Keep delivery/reconnect deadlines and pg unsubscribe guarantees unchanged; no caller-owned pool is ended by the library. |

| D-75 | Core and both adapter size ceilings are 14 kB, with unchanged measurement imports/compression and all other entry limits. | Owner approval in conversation (2026-10-23): Approve 14 kB limits | T-26 measured core 13,122 B and pg 13,059 B after sharing validation; see M5-SIZE-PROPOSAL.md. Further increases require approval. |
