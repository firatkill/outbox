import type { Tracer } from '../../src/core/types.js';

export interface RecordedSpan {
  name: string;
  attributes: Record<string, string | number | boolean>;
  exceptions: unknown[];
  status: 'ok' | 'error' | undefined;
}
export function recordingTracer() {
  const spans: RecordedSpan[] = [];
  const tracer: Tracer = {
    startSpan(name, attributes) {
      const span: RecordedSpan = { name, attributes: { ...attributes }, exceptions: [], status: undefined };
      spans.push(span);
      return {
        setAttribute(key, value) {
          span.attributes[key] = value;
        },
        recordException(error) {
          span.exceptions.push(error);
        },
        end(status) {
          span.status = status;
        },
      };
    },
  };
  return { tracer, spans };
}
