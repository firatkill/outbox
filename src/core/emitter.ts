import { isOutboxError } from './errors.js';
import type { RelayEvents } from './types.js';

/** Synchronous isolated listeners with a per-phase, monotonic-time error fallback. */
export function createEmitter(relayId: string) {
  const listeners = new Map<keyof RelayEvents, Set<(payload: never) => void>>();
  function off<E extends keyof RelayEvents>(event: E, listener: (payload: RelayEvents[E]) => void): void {
    listeners.get(event)?.delete(listener);
  }
  function on<E extends keyof RelayEvents>(event: E, listener: (payload: RelayEvents[E]) => void): () => void {
    let group = listeners.get(event);
    if (!group) {
      group = new Set();
      listeners.set(event, group);
    }
    group.add(listener);
    return () => {
      off(event, listener);
    };
  }
  const lastLogged = new Map<RelayEvents['error']['phase'], number>();
  function fallback({ phase, error }: RelayEvents['error']) {
    const now = performance.now();
    const previous = lastLogged.get(phase);
    if (previous !== undefined && now - previous < 10000) return;
    lastLogged.set(phase, now);
    try {
      const code = isOutboxError(error) ? error.code : error instanceof Error ? error.name : 'Error';
      const message = error instanceof Error ? error.message : String(error);
      console.error('[outbox] ' + relayId + ' ' + phase + ': ' + code + ': ' + message);
    } catch {
      /* A failing console or error formatter cannot break delivery. */
    }
  }
  function emit<E extends keyof RelayEvents>(event: E, payload: RelayEvents[E]): void {
    if (event === 'error' && !listeners.get('error')?.size) fallback(payload as RelayEvents['error']);
    for (const listener of Array.from(listeners.get(event) ?? [])) {
      try {
        listener(payload as never);
      } catch (error) {
        if (event !== 'error') emit('error', { relayId, phase: 'listener', error });
        else fallback({ relayId, phase: 'listener', error });
      }
    }
  }
  return { on, off, emit };
}
export type RelayEmitter = ReturnType<typeof createEmitter>;
