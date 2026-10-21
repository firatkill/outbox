import { describe, expect, it } from 'vitest';
import { decide, nextInterval } from '../../src/core/relay/scheduler.js';
import type { SchedulerState } from '../../src/core/relay/scheduler.js';
const base: SchedulerState = {
  active: 0,
  concurrency: 10,
  batchSize: 10,
  last: null,
  intervalMs: 100,
  wakePending: false,
  stopping: false,
};
describe('UT-08 TC-076 scheduler; TRD 9.5.1', () => {
  it.each([
    [{ stopping: true, active: 10 }, { kind: 'exit' }],
    [{ active: 10 }, { kind: 'wait-slot' }],
    [{ active: 6 }, { kind: 'wait-slot' }],
    [{ active: 5 }, { kind: 'claim', size: 5 }],
    [
      { active: 0, concurrency: 1 },
      { kind: 'claim', size: 1 },
    ],
    [{ active: 0 }, { kind: 'claim', size: 10 }],
    [
      { active: 3, last: { requested: 7, claimed: 7 } },
      { kind: 'claim', size: 7 },
    ],
    [{ last: { requested: 10, claimed: 1 } }, { kind: 'sleep', ms: 100 }],
    [
      { last: { requested: 10, claimed: 0 }, intervalMs: 400 },
      { kind: 'sleep', ms: 400 },
    ],
    [
      { last: { requested: 10, claimed: 0 }, wakePending: true },
      { kind: 'claim', size: 10 },
    ],
    [{ batchSize: 5, active: 8 }, { kind: 'wait-slot' }],
    [
      { batchSize: 5, active: 7 },
      { kind: 'claim', size: 3 },
    ],
  ] as const)('UT-08 follows decision rules %#', (patch, expected) => {
    expect(decide({ ...base, ...patch })).toEqual(expected);
  });
  it('UT-08 doubles only consecutive empty claims, caps, and resets after work or wake', () => {
    const poll = { minIntervalMs: 100, maxIntervalMs: 2000 };
    let interval = 0;
    const seen = Array.from({ length: 7 }, () => {
      interval = nextInterval(interval, 10, 0, poll);
      return interval;
    });
    expect(seen).toEqual([100, 200, 400, 800, 1600, 2000, 2000]);
    expect(nextInterval(2000, 10, 10, poll)).toBe(100);
    expect(nextInterval(2000, 10, 3, poll)).toBe(100);
    expect(nextInterval(0, 10, 0, poll)).toBe(100);
  });
});
