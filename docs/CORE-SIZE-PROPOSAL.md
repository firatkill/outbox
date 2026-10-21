# Core package size checkpoint (T-14)

Status: owner approved the 12 kB core limit (PRD D-69).

The implemented unordered relay brings the measured core entry to 10,494 bytes minified + Brotli, exceeding the current 10,000-byte gate by 494 bytes. The measurement uses the existing build and size-limit configuration, importing every core export.

Other measured entries remain within their existing limits: postgres-js 10.15 kB / 12 kB, pg 10.20 kB / 12 kB, testing 1.15 kB / 2 kB. Publisher entries remain placeholders; their final sizes are unverified.

Approved change: raise only the core budget from 10 kB to 12 kB in `.size-limit.json`, PRD NFR-20 and TRD 4.4. Keep the same measurement method and all other limits. Do not bypass the gate or remove behavior to fit it. Later features remain subject to these limits; this is not evidence that the finished package will fit.

Alternative: keep the 10 kB limit and continue implementation optimization before T-14 can finish.

Reviewable implementation is on local branch `feat/t14-relay-engine`. The final local run passes 183 unit and 84 real PostgreSQL integration tests, lint, typecheck, guards, build and publint/attw. The size gate is the only failing implemented gate. Docs gates are deferred by D-61; future concurrency and chaos gates are staged by D-66. The approved limit is now applied.

AGENTS.md Owner approval checkpoint 2 requires an explicit owner decision before changing this specification limit. The answer is recorded in PRD 14 and the normative limit updated before rerunning the gate.
