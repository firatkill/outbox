import { expect, it } from 'vitest';
import { migrationChecksum } from '../../src/core/migrations/index.js';
it('UT-18 TC-064 hashes templates with SHA-256 and normalizes CRLF', () => {
  expect(migrationChecksum('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(migrationChecksum('a\r\nb\r\n')).toBe(migrationChecksum('a\nb\n'));
});
