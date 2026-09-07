import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Legacy vanilla-JS app (push/pull/legs day pages, dashboard) — plain
    // ES6+ scripts with no build step, out of scope until M4 decommissions
    // them. See PROMPTKIT.md §2.
    "push-day-workout/**",
    "pull-day-workout/**",
    "legs-day-workout/**",
    "ppl-workout-dashboard/**",
    // Throwaway M0 spike sandbox, has its own tooling (spikes/m0-drizzle-rls/package.json).
    "spikes/**",
  ]),
]);

export default eslintConfig;
