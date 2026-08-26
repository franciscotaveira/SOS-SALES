import { defineConfig } from 'vitest/config';

/**
 * Keep API tests independent from the frontend Vite configuration.
 * The API CI job installs only apps/api dependencies.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
