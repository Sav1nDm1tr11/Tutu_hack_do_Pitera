import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Границы модулей из docs/SPEC.md §4.1 держатся здесь, а не на честном слове:
 * если правило падает, значит слой начал зависеть от чужого фреймворка.
 */
const FRAMEWORK_PACKAGES_FORBIDDEN_IN_DOMAIN = [
  'react',
  'react-dom',
  'react-router',
  'fastify',
  'openai',
  'maplibre-gl',
  'zustand',
  '@tanstack/react-query',
  '@modelcontextprotocol/sdk',
  'node:fs',
  'node:path',
  'node:http',
  'node:process',
  'node:child_process',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/dev-dist/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.snapshot.json',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-param-reassign': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // packages/domain должен оставаться чистым: pure TypeScript, никаких SDK и Node-only API.
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: FRAMEWORK_PACKAGES_FORBIDDEN_IN_DOMAIN.map((name) => ({
            name,
            message:
              'packages/domain остаётся framework-agnostic (docs/SPEC.md §4.1). Перенесите зависимость в адаптер.',
          })),
          patterns: [
            {
              group: ['@tutu-plan-b/web', '@tutu-plan-b/api', '@tutu-plan-b/test-fixtures'],
              message: 'domain не может зависеть от приложений или фикстур.',
            },
          ],
        },
      ],
      // lib DOM подключён в domain только ради WHATWG URL. Остальные окружения запрещены,
      // иначе «framework-agnostic» перестаёт что-либо значить.
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'fetch', 'process', 'console'].map(
          (name) => ({
            name,
            message: 'packages/domain не имеет доступа к окружению (docs/SPEC.md §4.1).',
          }),
        ),
      ],
      // Детерминированность scoring: «сейчас» и случайность приходят параметром.
      // Разбор конкретной ISO-строки через new Date(iso) детерминирован и разрешён.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Домен должен быть детерминированным: передайте seed параметром.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Передавайте текущее время параметром (now: string), иначе тесты недетерминированны.',
        },
      ],
    },
  },

  // Raw MCP и OpenAI типы не покидают свои адаптеры.
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/adapters/llm/**', 'apps/api/src/adapters/inventory/mcp/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'openai', message: 'OpenAI типы остаются в adapters/llm (docs/SPEC.md §4.1).' },
            {
              name: '@modelcontextprotocol/sdk',
              message: 'MCP SDK остаётся в adapters/inventory/mcp (docs/SPEC.md §4.1).',
            },
          ],
          patterns: [
            {
              group: ['@modelcontextprotocol/sdk/*'],
              message: 'MCP SDK остаётся в adapters/inventory/mcp (docs/SPEC.md §4.1).',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'e2e/**/*.ts', 'packages/test-fixtures/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    files: ['apps/api/src/scripts/**/*.ts', 'e2e/**/*.ts', '*.config.{ts,js}', '**/*.config.{ts,js}'],
    rules: { 'no-console': 'off' },
  },
);
