import { afterEach, expect, it, vi } from 'vitest';
import { createEmitter } from '../../src/core/emitter.js';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('UT-14 TC-098 TC-141 isolates listeners and cleans up subscriptions', () => {
  const fallback = vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
  expect(fallback).toHaveBeenCalledExactlyOnceWith('[outbox] relay listener: Error: error listener');
  expect(errors).toHaveBeenCalledWith(expect.objectContaining({ phase: 'listener' }));
  off();
  emitter.emit('claimed', event);
  expect(good).toHaveBeenCalledTimes(1);
  emitter.on('claimed', good);
  emitter.off('claimed', good);
  emitter.emit('claimed', event);
  expect(good).toHaveBeenCalledTimes(1);
});

it('UT-14 TC-141 rate limits each phase for ten seconds using monotonic time', () => {
  vi.useFakeTimers({ toFake: ['performance'] });
  const fallback = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const emitter = createEmitter('r');
  const event = { relayId: 'r', phase: 'claim' as const, error: new Error('unavailable') };
  emitter.emit('error', event);
  emitter.emit('error', event);
  emitter.emit('error', { ...event, phase: 'flush' });
  expect(fallback.mock.calls).toEqual([
    ['[outbox] r claim: Error: unavailable'],
    ['[outbox] r flush: Error: unavailable'],
  ]);
  vi.advanceTimersByTime(9999);
  emitter.emit('error', event);
  expect(fallback).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(1);
  emitter.emit('error', event);
  expect(fallback).toHaveBeenCalledTimes(3);
});
it('UT-14 TC-141 routes registered error listeners without logging and survives a broken console', () => {
  const fallback = vi.spyOn(console, 'error').mockImplementation(() => {
    throw new Error('console failed');
  });
  const emitter = createEmitter('r');
  const listener = vi.fn();
  const off = emitter.on('error', listener);
  const event = { relayId: 'r', phase: 'claim' as const, error: new Error('query') };
  emitter.emit('error', event);
  expect(listener).toHaveBeenCalledExactlyOnceWith(event);
  expect(fallback).not.toHaveBeenCalled();
  off();
  expect(() => {
    emitter.emit('error', event);
  }).not.toThrow();
  expect(fallback).toHaveBeenCalledTimes(1);
});
