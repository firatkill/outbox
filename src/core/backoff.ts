import type { RelayCommonOptions } from './types.js';

type RetryPolicy = Required<NonNullable<RelayCommonOptions['retry']>>;

/** Compute the capped exponential delay for a failed, one-based attempt.
 * @param attempt - Integer greater than or equal to one.
 * @param policy - Fully resolved retry policy; relay defaults are 1000ms base,
 * factor 2, 300000ms maximum and full jitter.
 * @param random - Random source returning a number in [0, 1).
 * @defaultValue `random` defaults to `Math.random`.
 * @returns An integer delay in milliseconds, including zero with full jitter.
 * @throws RangeError for an invalid attempt or random result.
 * @example
 * computeBackoffMs(2, { baseDelayMs: 1000, factor: 2, maxDelayMs: 300000, jitter: 'none' }); // 2000
 */
export function computeBackoffMs(attempt: number, policy: RetryPolicy, random: () => number = Math.random): number {
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError('attempt must be an integer >= 1');
  const exponential = policy.baseDelayMs * Math.pow(policy.factor, attempt - 1);
  const ceiling = Math.floor(
    Math.min(policy.maxDelayMs, Number.isFinite(exponential) ? exponential : policy.maxDelayMs),
  );
  if (policy.jitter === 'none') return ceiling;
  const r = random();
  if (!(r >= 0 && r < 1)) throw new RangeError('random() must return a number in [0, 1)');
  return Math.floor(r * (ceiling + 1));
}
