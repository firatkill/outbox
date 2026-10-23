import type { RelayEmitter } from '../emitter.js';
import type { Span, Tracer } from '../types.js';

/** Isolate every user tracer callback from relay execution. */
export function startTrace(
  tracer: Tracer | undefined,
  emitter: RelayEmitter,
  relayId: string,
  name: string,
  attributes: Readonly<Record<string, string | number | boolean>>,
) {
  let span: Span | undefined;
  let failed = false;
  function safely(fn: () => void) {
    try {
      fn();
    } catch (error) {
      emitter.emit('error', { relayId, phase: 'listener', error });
    }
  }
  safely(() => {
    span = tracer?.startSpan(name, attributes);
  });
  return {
    set(key: string, value: string | number | boolean) {
      safely(() => {
        span?.setAttribute(key, value);
      });
    },
    error(error: unknown) {
      failed = true;
      safely(() => {
        span?.recordException(error);
      });
    },
    end() {
      safely(() => {
        span?.end(failed ? 'error' : 'ok');
      });
    },
  };
}
