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
  },
});
