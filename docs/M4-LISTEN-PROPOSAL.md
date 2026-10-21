# M4 postgres.js reconnect cleanup decision

## Verified failed assumption

TRD A-03 and §6.2 expect the handle returned by `sql.listen()` to remain usable for closing the subscription after reconnect. With the pinned and latest npm version, postgres.js 3.4.9, that does not hold.

A driver-only reproduction (no outbox code) opened a listener, terminated only its backend, awaited its second `onListen` callback, awaited the original handle's `unlisten()`, and then sent a notification. The supposedly removed callback still ran. Observed: two connections, one notification after unlisten. The local diagnostic is `.git/repro-listen.mjs`; it closes its own pools afterward.

The installed driver's `src/index.js:157` recreates listener objects during reconnect. The original handle's closure at line 184 removes its old listener object by identity; the replacement remains subscribed. `npm view postgres version` returned 3.4.9. No dependency upgrade with a verified fix is available from that registry result.

INT-52 recovery itself passed: reconnect was observed and the message was delivered within two seconds. The added shutdown assertion exposed the remaining subscription. The pg version of the test and the other nine targeted checks passed.

## Approved change (owner D-74)

1. Preserve the public adapter interface, driver version, default LISTEN behavior and caller ownership of pools.
2. Guard adapter callbacks with a closed flag. Closing disables notifications and reconnect callbacks immediately, then calls the documented `unlisten()` method. The library never ends a caller-owned pool or accesses private driver internals.
3. Document a postgres.js 3.4.9 limitation: after reconnect, its server subscription and driver callback may remain until the caller ends the pool. A stopped relay remains stopped and performs no more claims. For deterministic connection cleanup, use a dedicated caller-owned pool through `listen: { db }` and end that pool after `relay.stop()`, or use pg / disable LISTEN.
4. Record this exception in TRD §6.2/A-03 and the PRD decision log. Keep INT-52's fault injection, two-second delivery bound and reconnect assertions. Test that close suppresses subsequent callbacks; for postgres.js after reconnect, explicitly record the driver subscription limitation rather than falsely claiming it was removed. Keep pg's full unsubscribe assertion.

This accepts a bounded driver resource limitation; it does not weaken delivery, ordering, lease or polling guarantees. It can retain a connection and small callback closure after a reconnect until the owner closes the pool. Repeated relays on a long-lived shared pool can accumulate these callbacks, so the dedicated-pool guidance matters.

Alternative: pause the postgres.js LISTEN implementation until a driver fix is available. No upstream issue or message has been sent.

## Other checks

The initial build and size checks passed with the existing 13kB limits; later cleanup briefly exceeded core by 5 bytes and was reduced by removing redundant retry state without changing the limit. T-24 implementation and CI pass under D-74. M4 remains incomplete until T-25 latency and polling acceptance finishes.
