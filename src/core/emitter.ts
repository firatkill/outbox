import type { RelayEvents } from './types.js';

/** Synchronous, isolated relay listeners. Console fallback is introduced in T-27. */
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
  function emit<E extends keyof RelayEvents>(event: E, payload: RelayEvents[E]): void {
    for (const listener of Array.from(listeners.get(event) ?? [])) {
      try {
        listener(payload as never);
      } catch (error) {
        if (event !== 'error') emit('error', { relayId, phase: 'listener', error });
      }
    }
  }
  return { on, off, emit };
}
export type RelayEmitter = ReturnType<typeof createEmitter>;
