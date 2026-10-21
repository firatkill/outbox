import { render } from './render.js';
import { OutboxError } from '../errors.js';
import { collapseDuplicates } from '../validate.js';
import type { ValidatedMessage } from '../validate.js';
import type { EnqueueResult, ResolvedOutboxConfig, SqlExecutor } from '../types.js';

export const E1 = `-- $1 jsonb  messages
-- $2 text   notify channel, or null when notify is disabled
with input as (
  select e.ord, e.value as v
  from jsonb_array_elements($1::text::jsonb) with ordinality as e(value, ord)
),
ins as (
  insert into {{messages}}
    (id, topic, key, payload, headers, dedupe_key, max_attempts, available_at)
  select
    (v->>'id')::uuid,
    v->>'topic',
    v->>'key',
    v->'payload',
    v->'headers',
    v->>'dedupe_key',
    (v->>'max_attempts')::int4,
    case
      when v->>'available_at_ms' is not null
        then to_timestamp((v->>'available_at_ms')::float8 / 1000.0)
      else {{now}} + ((v->>'delay_ms')::int8 * interval '1 millisecond')
    end
  from input
  order by ord
  on conflict (topic, dedupe_key) where dedupe_key is not null do nothing
  returning id
)
select
  coalesce((select jsonb_agg(id::text) from ins), '[]'::jsonb)::text as inserted_ids,
  case
    when $2::text is not null and exists (select 1 from ins)
      then (select 1 from pg_notify($2::text, ''))
  end as notified;`;

export const E2 = `-- $1 jsonb  [{ "ord": 0, "topic": "...", "dedupe_key": "..." }]
select x.ord::int4 as ord, m.id::text as id
from jsonb_to_recordset($1::text::jsonb) as x(ord int4, topic text, dedupe_key text)
join {{messages}} m
  on m.topic = x.topic and m.dedupe_key = x.dedupe_key;`;

/** Execute the normative insert and fresh-snapshot dedupe lookup. */
export async function enqueueValidated(
  executor: SqlExecutor,
  config: ResolvedOutboxConfig,
  input: readonly ValidatedMessage[],
): Promise<EnqueueResult[]> {
  if (input.length === 0) return [];
  const { messages, indexes } = collapseDuplicates(input);
  const batch = messages.map((message) => ({
    id: message.id,
    topic: message.topic,
    key: message.key,
    payload: message.payload,
    headers: message.headers,
    dedupe_key: message.dedupeKey,
    delay_ms: message.delayMs,
    available_at_ms: message.availableAtMs,
    max_attempts: message.maxAttempts,
  }));
  const rows = await executor.query(render(E1, config), [JSON.stringify(batch), config.notify ? config.channel : null]);
  const encoded = rows[0]?.['inserted_ids'];
  if (typeof encoded !== 'string')
    throw new OutboxError('OUTBOX_INTERNAL', 'Invalid inserted_ids column. Please report.');
  const inserted: unknown = JSON.parse(encoded);
  if (!Array.isArray(inserted) || !inserted.every((id: unknown) => typeof id === 'string'))
    throw new OutboxError('OUTBOX_INTERNAL', 'Invalid inserted_ids value. Please report.');
  const ids = new Set<string>(inserted);
  const missing = messages.flatMap((message, ord) =>
    ids.has(message.id) ? [] : [{ ord, topic: message.topic, dedupe_key: message.dedupeKey }],
  );
  const existing = new Map<number, string>();
  if (missing.length > 0) {
    const found = await executor.query(render(E2, config), [JSON.stringify(missing)]);
    for (const row of found) {
      if (typeof row['ord'] !== 'number' || typeof row['id'] !== 'string')
        throw new OutboxError('OUTBOX_INTERNAL', 'Invalid dedupe lookup row. Please report.');
      existing.set(row['ord'], row['id']);
    }
  }
  const unique = messages.map((message, index): EnqueueResult => {
    if (ids.has(message.id)) return { id: message.id, topic: message.topic, deduped: false };
    const id = existing.get(index);
    if (id === undefined)
      throw new OutboxError('OUTBOX_INTERNAL', 'Missing dedupe row. Please report.', { details: { index } });
    return { id, topic: message.topic, deduped: true };
  });
  const seen = new Set<number>();
  return indexes.map((index) => {
    const result = unique[index];
    if (result === undefined) throw new OutboxError('OUTBOX_INTERNAL', 'Missing batch result. Please report.');
    const duplicate = seen.has(index);
    seen.add(index);
    return { ...result, deduped: result.deduped || duplicate };
  });
}
