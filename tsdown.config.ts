import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };
const define = { __OUTBOX_VERSION__: JSON.stringify(version) };

export default defineConfig([
  {
    define,
    entry: {
      index: 'src/index.ts',
      'postgres-js': 'src/postgres-js.ts',
      pg: 'src/pg.ts',
      bullmq: 'src/bullmq.ts',
      webhook: 'src/webhook.ts',
      testing: 'src/testing.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    tsconfig: 'tsconfig.build.json',
    target: 'node20',
    platform: 'node',
    sourcemap: true,
    clean: true,
    treeshake: true,
    deps: { neverBundle: ['pg', 'postgres'] },
    outExtensions: ({ format }) => ({ js: format === 'es' ? '.js' : '.cjs' }),
  },
  {
    define,
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    target: 'node20',
    platform: 'node',
    sourcemap: true,
    clean: false,
    deps: { neverBundle: ['pg', 'postgres'] },
    outExtensions: () => ({ js: '.js' }),
  },
]);
