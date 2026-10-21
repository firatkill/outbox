import type { OutboxMessage } from '../../src/core/types.js';
/** Fixed neutral message fixture for spec-derived delivery/flusher unit tests. */
export function message(index = 1): OutboxMessage {
  return {
    id: '00000000-0000-7000-8000-' + String(index).padStart(12, '0'),
    seq: String(index),
    topic: 't',
    key: null,
    payload: { index },
    headers: {},
    dedupeKey: null,
    status: 'in_flight',
    attempts: 1,
    maxAttempts: 10,
    createdAt: new Date(0),
    availableAt: new Date(0),
    lastError: null,
  };
}
