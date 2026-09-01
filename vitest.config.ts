import { defineConfig } from 'vitest/config';

/**
 * Frontend tests must not accidentally execute the API integration suite.
 * The API has its own Vitest configuration and explicit database lifecycle.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'apps/api/**'],
  },
});
