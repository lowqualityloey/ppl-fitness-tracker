import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Legacy app has no tests; spike sandbox has its own vitest.config.ts
    // and is run independently (see spikes/m0-drizzle-rls/README.md).
    exclude: ["node_modules", "spikes/**", ".next/**"],
    // No test files exist yet — M1-16 adds the first ones (RED phase).
    // Without this, an empty suite exits 1 and would break CI before
    // there's anything to fail on purpose.
    passWithNoTests: true,
    // Integration tests share one local Postgres instance and several
    // fixture rows (e.g. routine_days slugs 'test-push'/'test-pull',
    // named test users). Running test files in parallel workers lets one
    // file's cleanup/insert race against another's read, producing
    // intermittent FK-violation and row-count failures that have nothing
    // to do with the code under test. Serialize file execution so the
    // shared database is only ever touched by one file at a time.
    fileParallelism: false,
  },
});
