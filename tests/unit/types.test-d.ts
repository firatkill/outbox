import { expectTypeOf } from 'vitest';
import type { Outbox, EnqueueResult, MessageInput, SqlExecutor } from '../../src/core/types.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Concrete topic maps need a type alias to satisfy Record without widening their keys.
type Topics = { 'order.created': { id: number }; 'order.paid': { paid: boolean } };
declare const outbox: Outbox<SqlExecutor, Topics>;
declare const tx: SqlExecutor;
expectTypeOf(outbox.enqueue(tx, { topic: 'order.created', payload: { id: 1 } })).toEqualTypeOf<
  Promise<EnqueueResult>
>();
expectTypeOf(outbox.enqueue(tx, [{ topic: 'order.paid', payload: { paid: true } }])).toEqualTypeOf<
  Promise<EnqueueResult[]>
>();
// @ts-expect-error Payload id must match the topic's numeric id type.
void outbox.enqueue(tx, { topic: 'order.created', payload: { id: 'wrong' } });
// @ts-expect-error Unknown topics are rejected for concrete maps.
void outbox.enqueue(tx, { topic: 'missing', payload: {} });
// @ts-expect-error The paid payload cannot be attached to the created topic.
const invalid: MessageInput<Topics> = { topic: 'order.created', payload: { paid: true } };
expectTypeOf(invalid).toEqualTypeOf<MessageInput<Topics>>();
