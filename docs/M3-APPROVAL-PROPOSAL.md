# M3 admin validation clarification

TRD §5.3 specifies admin option ranges, but §5.9 does not assign an error code to invalid admin options. It also does not specify whether retention milliseconds can be fractional. D-67 covers relay options only.

Proposed behavior for T-20/T-21:

- Reject invalid or unknown admin options with `OUTBOX_CONFIG`, with all option issues in `details.issues`, before SQL. This covers `retryDead`, `purge`, `purgeInbox`, `listDead` and `stats`.
- Counts use integers within the existing ranges. `olderThanMs` uses a nonnegative safe integer. Boolean options require booleans. Topic/key filters follow the existing enqueue string rules. No default or documented range changes.
- Preserve the explicit ID rules: invalid `retryDead.ids` (including array length outside 1..1000) rejects with `OUTBOX_INVALID_MESSAGE`; malformed `skip(id)` rejects with `OUTBOX_NOT_FOUND` without SQL.

Approval is required by AGENTS.md owner checkpoint 2 because these are observable behaviors left unspecified. On approval, record the decision in PRD §14, update TRD §5.3/§5.9, and add unit and integration validation cases.
