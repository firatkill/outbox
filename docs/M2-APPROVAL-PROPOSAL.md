# M2 specification clarifications

Status: owner approved both clarifications on 2026-10-21 (PRD D-66/D-67). No default or numeric limit changes are proposed.

## Staged verification gates

AGENTS.md requires INT-22, INT-24, INT-41, INT-62 and both chaos runs for concurrency changes. The implementation plan first introduces them in T-18, T-16, T-23, T-26 and T-30 respectively, after claim SQL in T-13. Preserve task order and require each gate from its implementation task onward. Before then, run the current unit/integration suite and each task's statement-level or relay-level acceptance tests; record the missing future gates explicitly, without claiming those guarantees verified.

T-18 also says to complete INT-82, whose listDead and stats paths depend on T-20 and T-21. Verify claim mapping in T-18, listDead mapping in T-20 and stats mapping in T-21. Keep each remaining part explicitly pending until then.

## Numeric relay options

TRD 5.4 specifies ranges but does not explicitly settle fractional values. Proposed rule: all count and millisecond options are finite integers within the existing ranges; retry.factor may be any finite number from 1 through 10. This matches the integer SQL parameters and avoids silent database rounding. Reject invalid values with OUTBOX_CONFIG, aggregated in details.issues; change no defaults.

The decisions are recorded in PRD 14 and reflected in the normative TRD and implementation plan.
