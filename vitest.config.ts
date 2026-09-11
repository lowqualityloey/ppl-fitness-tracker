import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The API suites boot a `next dev` server in `beforeAll`, and
    // tests/integration/api/test-server.ts gives that boot a 30 s deadline. Vitest's
    // default hook timeout is 10 s, so the harness could never reach its own
    // diagnosis: a slow cold start surfaced as "Hook timed out in 10000ms" — which
    // names neither the server nor the reason — instead of "Next test server did not
    // become ready: <stderr>". Five seconds of headroom keeps the harness's message
    // the one a reader sees, and leaves an environment problem attributable on its
    // own rather than looking like a suite of failing assertions.
    //
    // This is a budget for infrastructure startup, not a test gate: no assertion
    // timeout was changed, and nothing that is *checked* got more tolerant.
    hookTimeout: 35_000,
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
