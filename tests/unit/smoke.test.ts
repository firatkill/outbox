import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { VERSION } from '../../src/index.js';

it('UT-15 TC-006 exports the package version inlined at build time', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
  expect(VERSION).toBe(pkg.version);
});
