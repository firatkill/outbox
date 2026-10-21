import { expect, it, vi } from 'vitest';
import { createEmitter } from '../../src/core/emitter.js';
it('UT-14 TC-098 isolates listeners and cleans up subscriptions (console fallback is T-27)', () => {
  const emitter = createEmitter('relay');
  const good = vi.fn(),
    errors = vi.fn();
  emitter.on('claimed', () => {
    throw new Error('listener');
  });
  const off = emitter.on('claimed', good);
  emitter.on('error', errors);
  emitter.on('error', () => {
    throw new Error('error listener');
  });
  const event = { relayId: 'relay', count: 1, ids: ['id'], durationMs: 1 };
  emitter.emit('claimed', event);
  expect(good).toHaveBeenCalledExactlyOnceWith(event);
  expect(errors).toHaveBeenCalledWith(expect.objectContaining({ phase: 'listener' }));
  off();
  emitter.emit('claimed', event);
  expect(good).toHaveBeenCalledTimes(1);
  emitter.on('claimed', good);
  emitter.off('claimed', good);
  emitter.emit('claimed', event);
  expect(good).toHaveBeenCalledTimes(1);
});
