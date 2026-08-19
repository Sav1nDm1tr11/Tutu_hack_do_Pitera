import { defineConfig } from 'vitest/config';

/**
 * Один прогон на весь monorepo. Домен тестируется в node-окружении и держит
 * высокий порог покрытия, потому что именно его числа попадают в интерфейс
 * как факты. Для остальных слоёв порог не выставляется намеренно.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'domain',
          root: './packages/domain',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'api',
          root: './apps/api',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          root: './apps/web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/domain/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/contracts/**'],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
    },
  },
});
