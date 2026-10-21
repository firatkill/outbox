import { describe, expect, it } from 'vitest';
import { createUuidV7 } from '../../src/core/uuid.js';

describe('UT-06 UUIDv7', () => {
  it.each([0, 255])('UT-06 stays unique and increasing through counter overflow (random %i)', (fill) => {
    const now = 1_700_000_000_000;
    const uuid = createUuidV7(
      () => now,
      (bytes) => {
        bytes.fill(fill);
      },
    );
    const ids = Array.from({ length: 10_000 }, uuid);
    expect(new Set(ids).size).toBe(10_000);
    expect([...ids].sort()).toEqual(ids);
    const timestamps = ids.map((id) => Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16));
    expect(timestamps[0]).toBe(now);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(Math.min(...timestamps)).toBe(now);
    expect(Math.max(...timestamps)).toBeLessThanOrEqual(now + Math.ceil(10_000 / 2048));
    expect(Math.max(...timestamps)).toBeGreaterThan(now);
  });
  it('UT-06 never decreases when the clock moves backwards', () => {
    let now = 10_000;
    const uuid = createUuidV7(() => now);
    const a = uuid();
    now -= 1000;
    const b = uuid();
    now += 2000;
    const c = uuid();
    expect(a < b && b < c).toBe(true);
  });
});
