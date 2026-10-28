import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    // Some scenario tests simulate minutes of play.
    testTimeout: 30_000,
  },
});
