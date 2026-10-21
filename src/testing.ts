import { OutboxError } from './core/errors.js';
import { createTestClock } from './core/testing/clock.js';
import type { TestClock } from './core/testing/clock.js';
import type { DriverAdapter, Inbox, Outbox, ResolvedOutboxConfig, TopicMap } from './core/types.js';

export type { TestClock } from './core/testing/clock.js';
/** Test-only. Override database time for an outbox or inbox; never import this in production.
 * @example
 * const clock = testClock(outbox);
 * await clock.install();
 * await clock.advance(60000);
 * await clock.uninstall();
 */
export function testClock(target: Outbox<unknown, TopicMap> | Inbox<unknown>): TestClock;
export function testClock(target: unknown): TestClock {
  const key = Symbol.for('@firatkill/outbox/internal');
  if (typeof target !== 'object' || target === null || !(key in target)) {
    throw new OutboxError('OUTBOX_CONFIG', 'testClock needs an object returned by createOutbox or createInbox');
  }
  const internal = target[key] as { adapter: DriverAdapter<unknown, unknown>; config: ResolvedOutboxConfig };
  return createTestClock(internal.adapter, internal.config);
}
