import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  define: { __OUTBOX_VERSION__: JSON.stringify(version) },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], testTimeout: 10_000 } },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          pool: 'forks',
          maxWorkers: 4,
          fileParallelism: true,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
