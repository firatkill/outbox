import { OutboxError } from './errors.js';

/** Serialize once and measure the actual UTF-8 wire representation. */
export function encodeJson(value: unknown, maxBytes: number): { json: string; bytes: number } {
  let json: unknown;
  try {
    json = JSON.stringify(value);
  } catch (cause) {
    throw new OutboxError('OUTBOX_INVALID_MESSAGE', 'Payload cannot be serialized', { cause });
  }
  if (typeof json !== 'string') {
    throw new OutboxError('OUTBOX_INVALID_MESSAGE', 'Payload must serialize to JSON');
  }
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > maxBytes) {
    throw new OutboxError(
      'OUTBOX_PAYLOAD_TOO_LARGE',
      `Payload is ${String(bytes)} bytes; limit is ${String(maxBytes)} bytes`,
      {
        details: { size: bytes, limit: maxBytes },
      },
    );
  }
  return { json, bytes };
}
