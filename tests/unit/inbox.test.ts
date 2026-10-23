import { describe, expect, it, vi } from 'vitest';
import { createWithInbox } from '../../src/core/inbox.js';
import { parseOutboxConfig } from '../../src/core/config.js';
import type { DriverAdapter } from '../../src/core/types.js';

const config = parseOutboxConfig({ db: {} });
function setup() {
  const tx = { sentinel: true };
  const query = vi.fn().mockResolvedValue([{ inserted: true }]);
  const forTransaction = vi.fn(() => ({ query }));
  const adapter: DriverAdapter<object, typeof tx> = {
    name: 'fake',
    db: {},
    query,
    forTransaction,
    transaction: (fn) => fn({ query }),
    withDb: () => adapter,
  };
  return { tx, query, forTransaction, withInbox: createWithInbox(adapter, config) };
}
describe('UT-22 TC-140 inbox validation', () => {
  it.each([
    ['consumer', ''],
    ['consumer', 'x'.repeat(201)],
    ['consumer', '_c'],
    ['consumer', 'c\n'],
    ['consumer', 'c\r'],
    ['consumer', 'c\u2028'],
    ['consumer', 'c\u2029'],
    ['consumer', 'é'],
    ['consumer', 'a b'],
    ['consumer', null],
    ['consumer', 3],
    ['messageId', ''],
    ['messageId', '😀'.repeat(201)],
    ['messageId', undefined],
    ['messageId', {}],
  ])('UT-22 TC-140 rejects invalid %s before SQL (%#)', async (field, value) => {
    const { tx, query, forTransaction, withInbox } = setup();
    const fn = vi.fn();
    await expect(
      withInbox(
        tx,
        (field === 'consumer' ? value : 'c') as string,
        (field === 'messageId' ? value : 'm') as string,
        fn,
      ),
    ).rejects.toMatchObject({
      code: 'OUTBOX_INVALID_MESSAGE',
      details: { field },
    });
    expect(query).not.toHaveBeenCalled();
    expect(forTransaction).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
  });
  it('UT-22 TC-140 accepts boundaries and preserves the original transaction and result', async () => {
    const { tx, query, withInbox } = setup();
    const result = { effect: true };
    const fn = vi.fn((original: typeof tx) => {
      expect(original).toBe(tx);
      return Promise.resolve(result);
    });
    for (const [consumer, id] of [
      ['c', 'm'],
      ['A0._:/-' + 'a'.repeat(193), '😀'.repeat(200)],
      ['c', '\n / arbitrary'],
    ]) {
      expect(await withInbox(tx, consumer ?? '', id ?? '', fn)).toEqual({ status: 'processed', result });
    }
    query.mockResolvedValueOnce([]);
    expect(await withInbox(tx, 'c', 'm', fn)).toEqual({ status: 'duplicate' });
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it('UT-22 TC-140 propagates callback and driver errors unchanged', async () => {
    const { tx, query, withInbox } = setup();
    const error = new Error('effect failed');
    await expect(withInbox(tx, 'c', 'm', () => Promise.reject(error))).rejects.toBe(error);
    query.mockRejectedValueOnce(error);
    const fn = vi.fn();
    await expect(withInbox(tx, 'c', 'm', fn)).rejects.toBe(error);
    expect(fn).not.toHaveBeenCalled();
  });
});
