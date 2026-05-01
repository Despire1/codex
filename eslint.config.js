import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'legacy/**',
      'design-system/**',
      '.playwright-cli/**',
      'output/**',
      'tmp/**',
      'prisma/migrations/**',
      'public/**',
      'scripts/**',
      'src/types/prisma-client.d.ts',
      '*.cjs',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
        node: true,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',

      // Прагматичные настройки для текущего состояния кода
      '@typescript-eslint/no-explicit-any': 'off', // 471 any — отдельная задача
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
      'prefer-const': 'warn',
      'no-useless-escape': 'warn',

      // import-plugin — мягкие правила, чтобы не утопить codebase в warning'ах.
      // no-duplicates отключено: TS-резолвер ошибочно сливает 'date-fns' и 'date-fns/locale/ru'
      // в один модуль, ломая обходной импорт `ru` (который не экспортируется из корня в v2).
      'import/no-duplicates': 'off',
      'import/no-cycle': ['warn', { maxDepth: 1, ignoreExternal: true }],
    },
  },
  {
    files: ['src/backend/**/*.ts', 'src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettierConfig,
);
