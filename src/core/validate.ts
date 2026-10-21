import { isOutboxError, OutboxError } from './errors.js';
import { encodeJson } from './json.js';
import type { ResolvedOutboxConfig } from './types.js';
import { uuidv7 } from './uuid.js';

export interface ValidatedMessage {
  id: string;
  topic: string;
  payload: unknown;
  key: string | null;
  headers: Record<string, string>;
  dedupeKey: string | null;
  delayMs: number;
  availableAtMs: number | null;
  maxAttempts: number;
}
const fields = new Set(['topic', 'payload', 'key', 'headers', 'dedupeKey', 'delayMs', 'availableAt', 'maxAttempts']);
function invalid(index: number, field: string, reason: string): never {
  throw new OutboxError('OUTBOX_INVALID_MESSAGE', reason, { details: { index, field, reason } });
}
function stringLength(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && Array.from(value).length >= min && Array.from(value).length <= max;
}
function plainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
/** Validate the entire batch before its caller can issue any SQL. */
export function validateMessages(input: unknown, config: ResolvedOutboxConfig): ValidatedMessage[] {
  if (!Array.isArray(input) || input.length > 1000) invalid(0, 'batch', 'Expected an array of 0..1000 messages');
  return Array.from(input, (message: unknown, index) => {
    if (!plainObject(message)) invalid(index, 'message', 'Expected a message object');
    for (const field of Object.keys(message)) {
      if (!fields.has(field)) invalid(index, field, 'Unknown property');
    }
    const { topic, key, dedupeKey, delayMs, availableAt, maxAttempts } = message;
    if (typeof topic !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(topic))
      invalid(index, 'topic', 'Invalid topic');
    if (key !== undefined && key !== null && !stringLength(key, 1, 200))
      invalid(index, 'key', 'Expected 1..200 characters');
    if (dedupeKey !== undefined && !stringLength(dedupeKey, 1, 200))
      invalid(index, 'dedupeKey', 'Expected 1..200 characters');
    if (
      delayMs !== undefined &&
      (typeof delayMs !== 'number' || !Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 31_536_000_000)
    )
      invalid(index, 'delayMs', 'Expected an integer in 0..31536000000');
    if (availableAt !== undefined && (!(availableAt instanceof Date) || !Number.isFinite(availableAt.getTime())))
      invalid(index, 'availableAt', 'Expected a finite Date');
    if (delayMs !== undefined && availableAt !== undefined)
      invalid(index, 'availableAt', 'Cannot combine availableAt and delayMs');
    if (
      maxAttempts !== undefined &&
      (typeof maxAttempts !== 'number' || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 1000)
    )
      invalid(index, 'maxAttempts', 'Expected an integer in 1..1000');
    const headers = message['headers'] === undefined ? {} : message['headers'];
    if (!plainObject(headers) || Object.keys(headers).length > 50)
      invalid(index, 'headers', 'Expected a plain object with at most 50 entries');
    for (const [name, value] of Object.entries(headers)) {
      if (!stringLength(name, 1, 100) || !stringLength(value, 0, 2000))
        invalid(index, 'headers', 'Invalid header name or value');
    }
    let payload: unknown;
    try {
      payload = JSON.parse(encodeJson(message['payload'], config.maxPayloadBytes).json) as unknown;
    } catch (error) {
      if (isOutboxError(error)) {
        throw new OutboxError(error.code, error.message, {
          cause: error,
          details: { ...error.details, index, field: 'payload', reason: error.message },
        });
      }
      throw error;
    }
    return {
      id: uuidv7(),
      topic,
      payload,
      key: key ?? null,
      headers: Object.fromEntries(Object.entries(headers)) as Record<string, string>,
      dedupeKey: dedupeKey ?? null,
      delayMs: delayMs ?? 0,
      availableAtMs: availableAt?.getTime() ?? null,
      maxAttempts: maxAttempts ?? config.maxAttempts,
    };
  });
}
/** Preserve the first duplicate and map every original position to its unique row. */
export function collapseDuplicates(messages: readonly ValidatedMessage[]): {
  messages: ValidatedMessage[];
  indexes: number[];
} {
  const unique: ValidatedMessage[] = [];
  const seen = new Map<string, Map<string, number>>();
  const indexes = messages.map((message) => {
    const topic = seen.get(message.topic) ?? new Map<string, number>();
    const previous = message.dedupeKey === null ? undefined : topic.get(message.dedupeKey);
    if (previous !== undefined) return previous;
    const index = unique.length;
    unique.push(message);
    if (message.dedupeKey !== null) {
      topic.set(message.dedupeKey, index);
      seen.set(message.topic, topic);
    }
    return index;
  });
  return { messages: unique, indexes };
}
