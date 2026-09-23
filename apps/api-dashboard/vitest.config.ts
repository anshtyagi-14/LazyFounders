import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Without this, `src/lib/articles.test.ts` cannot run at all: vitest does not know
 * the `@/` alias that tsconfig defines, and it would also collect the copies of
 * every test inside `.next/standalone`.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['.next/**', 'node_modules/**', 'src/generated/**'],
  },
});
