import { OutboxError } from './errors.js';
import type { MessageStatus, OutboxMessage } from './types.js';

function mismatch(column: string): never {
  throw new OutboxError('OUTBOX_INTERNAL', `Unexpected type for column ${column}. Please report.`, {
    details: { column },
  });
}
/** Validate driver-neutral SQL columns and decode their public representation. */
export function mapMessageRow(row: Record<string, unknown>): OutboxMessage {
  const text = (column: string): string => {
    const value = row[column];
    return typeof value === 'string' ? value : mismatch(column);
  };
  const nullableText = (column: string): string | null => (row[column] === null ? null : text(column));
  const numeric = (column: string): number => {
    const value = row[column];
    return typeof value === 'number' && Number.isFinite(value) ? value : mismatch(column);
  };
  const json = (column: string): unknown => {
    const value = text(column);
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return mismatch(column);
    }
  };
  const date = (column: string): Date => {
    const value = new Date(numeric(column));
    return Number.isFinite(value.getTime()) ? value : mismatch(column);
  };
  const status = text('status');
  const statuses: readonly string[] = ['pending', 'in_flight', 'done', 'dead', 'skipped'];
  if (!statuses.includes(status)) mismatch('status');
  const headers = json('headers');
  if (
    typeof headers !== 'object' ||
    headers === null ||
    Array.isArray(headers) ||
    Object.values(headers).some((v: unknown) => typeof v !== 'string')
  )
    mismatch('headers');
  return {
    id: text('id'),
    seq: text('seq'),
    topic: text('topic'),
    key: nullableText('key'),
    payload: json('payload'),
    headers: headers as Record<string, string>,
    dedupeKey: nullableText('dedupe_key'),
    status: status as MessageStatus,
    attempts: numeric('attempts'),
    maxAttempts: numeric('max_attempts'),
    createdAt: date('created_at_ms'),
    availableAt: date('available_at_ms'),
    lastError: nullableText('last_error'),
  };
}

/** Convert driver-neutral database epoch milliseconds without reading local time. */
export function dateFromEpoch(value: unknown, column: string): Date {
  if (typeof value !== 'number' || !Number.isFinite(value)) mismatch(column);
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : mismatch(column);
}
