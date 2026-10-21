import { describe, expect, it, vi } from 'vitest';
import { computeBackoffMs } from '../../src/core/backoff.js';

const policy = { baseDelayMs: 1000, factor: 2, maxDelayMs: 300_000, jitter: 'none' as const };

describe('UT-01 backoff — TC-068/TC-069; PRD FR-45, TRD 9.3.3', () => {
  it.each([
    [1, 1000],
    [2, 2000],
    [9, 256_000],
    [10, 300_000],
    [2000, 300_000],
  ])('UT-01 caps attempt %i at %i without consulting random', (attempt, expected) => {
    const random = vi.fn(() => 1);
    expect(computeBackoffMs(attempt, policy, random)).toBe(expected);
    expect(random).not.toHaveBeenCalled();
  });
  it('UT-01 handles constant, zero and fractional exponential ceilings', () => {
    expect(computeBackoffMs(2000, { ...policy, factor: 1 })).toBe(1000);
    expect(computeBackoffMs(1, { ...policy, baseDelayMs: 0 })).toBe(0);
    expect(computeBackoffMs(8, { ...policy, baseDelayMs: 0 })).toBe(0);
    expect(computeBackoffMs(2, { ...policy, baseDelayMs: 1, factor: 1.5 })).toBe(1);
  });
  it('UT-01 includes both jitter endpoints and defaults to Math.random', () => {
    const full = { ...policy, jitter: 'full' as const };
    expect(computeBackoffMs(2, full, () => 0)).toBe(0);
    expect(computeBackoffMs(2, full, () => 0.999999)).toBe(2000);
    expect(computeBackoffMs(1, { ...full, baseDelayMs: 0 }, () => 0.999999)).toBe(0);
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      expect(computeBackoffMs(1, full)).toBe(500);
    } finally {
      spy.mockRestore();
    }
  });
  it('UT-01 stays in the integer range for 10000 seeded random values', () => {
    let seed = 123456789;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const ceilings = [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 300000];
    for (let i = 0; i < 10000; i++) {
      const attempt = (i % 10) + 1;
      const delay = computeBackoffMs(attempt, { ...policy, jitter: 'full' }, random);
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(ceilings[attempt - 1] ?? 0);
    }
  });
  it.each([0, -1, 1.5, NaN, Infinity])('UT-01 rejects invalid attempt %s', (attempt) => {
    expect(() => computeBackoffMs(attempt, policy)).toThrow(RangeError);
  });
  it.each([1, -0.1, NaN, Infinity])('UT-01 rejects invalid random output %s', (value) => {
    expect(() => computeBackoffMs(1, { ...policy, jitter: 'full' }, () => value)).toThrow(RangeError);
  });
});
