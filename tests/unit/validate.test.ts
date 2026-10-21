import { invalidMessages as invalid } from '../fixtures/invalid-messages.js';
import { describe, expect, it } from 'vitest';
import { parseOutboxConfig } from '../../src/core/config.js';
import { encodeJson } from '../../src/core/json.js';
import { collapseDuplicates, validateMessages } from '../../src/core/validate.js';

const config = parseOutboxConfig({ db: {} });
const base = { topic: 'orders.created', payload: { id: 1 } };

describe('UT-05 message validation', () => {
  it.each(invalid)('UT-05 rejects invalid %s with index, field and reason (%#)', (field, value) => {
    expect(() => validateMessages([base, { ...base, [field]: value }], config)).toThrow(
      expect.objectContaining({
        code: 'OUTBOX_INVALID_MESSAGE',
        details: expect.objectContaining({ index: 1, field, reason: expect.any(String) as unknown }) as unknown,
      }),
    );
  });
  it('UT-05 accepts field boundaries and resolves defaults', () => {
    const [defaults] = validateMessages([base], config);
    expect(defaults).toMatchObject({
      topic: base.topic,
      payload: base.payload,
      key: null,
      headers: {},
      dedupeKey: null,
      delayMs: 0,
      availableAtMs: null,
      maxAttempts: 10,
    });
    const inputs = [
      {
        ...base,
        topic: 'A0._:/-' + 'x'.repeat(193),
        key: 'x'.repeat(200),
        dedupeKey: 'x'.repeat(200),
        delayMs: 31_536_000_000,
        maxAttempts: 1000,
        headers: { ['n'.repeat(100)]: 'v'.repeat(2000) },
      },
      { ...base, topic: 'a', key: null, dedupeKey: 'x', delayMs: 0, maxAttempts: 1, headers: { n: '' } },
      {
        ...base,
        key: 'x',
        availableAt: new Date(0),
        headers: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(i), 'v'])),
      },
      { ...base, payload: null },
    ];
    expect(validateMessages(inputs, config)).toHaveLength(4);
    expect(validateMessages(inputs, config)[2]?.availableAtMs).toBe(0);
  });
  it('UT-05 rejects combined time options, malformed batches and sparse messages', () => {
    for (const input of [null, {}, Array.from({ length: 1001 }, () => base), [null], new Array(1)]) {
      expect(() => validateMessages(input, config)).toThrow(
        expect.objectContaining({ code: 'OUTBOX_INVALID_MESSAGE' }),
      );
    }
    expect(() => validateMessages([{ ...base, delayMs: 0, availableAt: new Date(0) }], config)).toThrow(
      expect.objectContaining({ code: 'OUTBOX_INVALID_MESSAGE' }),
    );
    expect(validateMessages([], config)).toEqual([]);
    expect(
      validateMessages(
        Array.from({ length: 1000 }, () => base),
        config,
      ),
    ).toHaveLength(1000);
  });
  it('UT-05 counts UTF-8 bytes and serializes payload only once', () => {
    expect(encodeJson('ğ'.repeat(1000), 2002)).toEqual({ json: '"' + 'ğ'.repeat(1000) + '"', bytes: 2002 });
    expect(() =>
      validateMessages([{ ...base, payload: 'ğ'.repeat(1000) }], { ...config, maxPayloadBytes: 2001 }),
    ).toThrow(
      expect.objectContaining({
        code: 'OUTBOX_PAYLOAD_TOO_LARGE',
        details: expect.objectContaining({ index: 0, field: 'payload' }) as unknown,
      }),
    );
    let calls = 0;
    const [message] = validateMessages(
      [
        {
          ...base,
          payload: {
            toJSON() {
              calls++;
              return { accepted: true };
            },
          },
        },
      ],
      config,
    );
    expect(message?.payload).toEqual({ accepted: true });
    expect(calls).toBe(1);
  });
  it('UT-05 collapses only matching topic and dedupeKey, preserving first payload and positions', () => {
    const validated = validateMessages(
      [
        { ...base, dedupeKey: 'same' },
        { ...base, dedupeKey: 'same', payload: 'second' },
        { ...base, topic: 'other', dedupeKey: 'same' },
        base,
        base,
      ],
      config,
    );
    const result = collapseDuplicates(validated);
    expect(result.indexes).toEqual([0, 0, 1, 2, 3]);
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0]?.payload).toEqual(base.payload);
  });
});
