import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // A `list` reporter prints and forgets: per-spec durations evaporate with the process, so "which spec
  // is close to its ceiling" was something to remember rather than something to measure. The JSON file is
  // what makes a red legible afterwards, which is the gap every incident in
  // docs/rca/m4-100-contention-ledger.md was investigated through.
  reporter: [["list"], ["json", { outputFile: "test-results/playwright.json" }]],
  use: {
    baseURL: "http://localhost:3001",
    // `on-first-retry` was unreachable configuration. `retries` is unset in this file and in every spec,
    // so Playwright's default of 0 applies, no test is ever retried, and **no trace has ever been
    // produced by this suite** — the CI red on `a11y.spec.ts:102` and the four in #105's pass D were each
    // investigated from a console line and nothing else. `retain-on-failure` records on the failure
    // itself. Retries stay off on purpose: retrying turns a red gate into "flaky but green", which is the
    // one outcome #100 exists to prevent.
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
