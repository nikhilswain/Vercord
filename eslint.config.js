import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const browserFiles = [
  'src/main.tsx',
  'src/app/**/*.{ts,tsx}',
  'src/components/**/*.{ts,tsx}',
  'src/features/**/*.{ts,tsx}',
  'src/domain/map/**/*.{ts,tsx}',
  'src/domain/layout/**/*.{ts,tsx}',
];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      '.wrangler',
      '.worktrees/**',
      'playwright-report',
      'test-results',
      'assets/**',
      'worker-configuration.d.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'src/**/*.{ts,tsx}',
      'tests/unit/app/**/*.{ts,tsx}',
      'tests/unit/domain/map/**/*.ts',
      'tests/unit/domain/layout/**/*.ts',
      'tests/client/**/*.{ts,tsx}',
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    files: browserFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/domain/discord',
                '**/domain/discord/**',
                'src/domain/discord',
                'src/domain/discord/**',
                '**/worker',
                '**/worker/**',
                'worker',
                'worker/**',
              ],
              message: 'Browser code must consume only the browser-safe map domain.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'Browser code must use static imports so private boundaries remain auditable.',
        },
        {
          selector: 'TSImportType',
          message: 'Browser code must not reference private modules through import types.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.flat.recommended.rules },
  },
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: [
      'worker/**/*.ts',
      'tests/integration/worker/**/*.ts',
      'tests/unit/domain/discord/**/*.ts',
    ],
    languageOptions: { globals: globals.worker },
  },
  {
    files: ['*.config.ts', 'scripts/**/*.ts', 'tests/e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
