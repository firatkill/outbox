import { expect, it, vi } from 'vitest';
import { createEmitter } from '../../src/core/emitter.js';
import { startTrace } from '../../src/core/relay/tracing.js';
import type { Tracer } from '../../src/core/types.js';

it.each(['startSpan', 'setAttribute', 'recordException', 'end'] as const)(
  'UT-23 TC-144 isolates tracer %s failure',
  (method) => {
    const error = new Error('tracer failure');
    const emitter = createEmitter('r');
    const listener = vi.fn();
    emitter.on('error', listener);
    const check = (name: string) => {
      if (method === name) throw error;
    };
    const tracer: Tracer = {
      startSpan() {
        check('startSpan');
        return {
          setAttribute() {
            check('setAttribute');
          },
          recordException() {
            check('recordException');
          },
          end() {
            check('end');
          },
        };
      },
    };
    const span = startTrace(tracer, emitter, 'r', 'outbox claim', {});
    span.set('outbox.claimed', 1);
    span.error(new Error('query failure'));
    span.end();
    expect(listener).toHaveBeenCalledExactlyOnceWith({ relayId: 'r', phase: 'listener', error });
  },
);
