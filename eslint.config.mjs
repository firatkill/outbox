import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const restricted = (patterns) => ['error', { patterns }];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'site/api/**',
      'site/.vitepress/dist/**',
      'site/.vitepress/cache/**',
      'bench/out/**',
      'examples/**/dist/**',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['site/**', 'examples/**', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-imports': restricted(['pg', 'postgres', 'bullmq']),
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': restricted([
        { group: ['**/adapters/**', '**/publishers/**'], message: 'Core cannot depend on adapters or publishers.' },
        {
          regex: '^(?!(\\.|node:crypto$|node:os$))',
          message: 'Core imports only core files, node:crypto and node:os.',
        },
      ]),
    },
  },
  {
    files: ['src/adapters/**/*.ts'],
    rules: {
      'no-restricted-imports': restricted([
        'pg',
        'postgres',
        'bullmq',
        '**/publishers/**',
        { regex: '^(?!\\.)', message: 'Adapters depend only on local core and adapter modules.' },
      ]),
    },
  },
  {
    files: ['src/publishers/**/*.ts'],
    rules: {
      'no-restricted-imports': restricted([
        {
          regex: '^(?!((\\.\\./core/(errors|json|types)\\.js)|node:crypto)$)',
          message: 'Publishers may import only errors, JSON, types and node:crypto.',
        },
      ]),
    },
  },
  prettier,
);
