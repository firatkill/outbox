/** Create a process-local monotonic UUIDv7 generator (PRD D-51). */
export function createUuidV7(
  clock: () => number = Date.now,
  random: (bytes: Uint8Array) => void = (bytes) => {
    globalThis.crypto.getRandomValues(bytes);
  },
): () => string {
  let lastTime = -1;
  let counter = 0;
  return () => {
    const bytes = new Uint8Array(16);
    random(bytes);
    const now = clock();
    if (now > lastTime) {
      lastTime = now;
      counter = (((bytes[6] ?? 0) << 8) | (bytes[7] ?? 0)) & 2047;
    } else if (++counter > 4095) {
      lastTime += 1;
      counter = (((bytes[6] ?? 0) << 8) | (bytes[7] ?? 0)) & 2047;
    }
    let timestamp = lastTime;
    for (let i = 5; i >= 0; i--) {
      bytes[i] = timestamp % 256;
      timestamp = Math.floor(timestamp / 256);
    }
    bytes[6] = 0x70 | (counter >> 8);
    bytes[7] = counter & 255;
    bytes[8] = 0x80 | ((bytes[8] ?? 0) & 63);
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

export const uuidv7 = createUuidV7();
