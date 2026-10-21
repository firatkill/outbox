export interface SchedulerState {
  active: number;
  concurrency: number;
  batchSize: number;
  last: { requested: number; claimed: number } | null;
  intervalMs: number;
  wakePending: boolean;
  stopping: boolean;
}
export type SchedulerDecision =
  { kind: 'exit' } | { kind: 'wait-slot' } | { kind: 'claim'; size: number } | { kind: 'sleep'; ms: number };
/** Decide whether to claim, wait for capacity, poll or stop (TRD 9.5.1). */
export function decide(s: SchedulerState): SchedulerDecision {
  if (s.stopping) return { kind: 'exit' };
  const free = s.concurrency - s.active;
  const threshold = s.active === 0 ? 1 : Math.ceil(s.batchSize / 2);
  if (free < threshold) return { kind: 'wait-slot' };
  if (s.last === null || s.wakePending || s.last.claimed === s.last.requested)
    return { kind: 'claim', size: Math.min(s.batchSize, free) };
  return { kind: 'sleep', ms: s.intervalMs };
}
/** Pass prevMs=0 for the first empty claim after a nonempty claim or wake. */
export function nextInterval(
  prevMs: number,
  requested: number,
  claimed: number,
  poll: { minIntervalMs: number; maxIntervalMs: number },
): number {
  if (claimed === requested || claimed > 0) return poll.minIntervalMs;
  return Math.min(poll.maxIntervalMs, Math.max(poll.minIntervalMs, prevMs * 2));
}
