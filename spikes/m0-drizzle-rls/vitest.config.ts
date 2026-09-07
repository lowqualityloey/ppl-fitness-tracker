import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    // Shared database with a single seeded fixture set. Parallel files would
    // race on row state and produce flaky isolation results, which is the one
    // outcome this spike cannot afford.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
