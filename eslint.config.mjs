import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // M1-11: Ban direct set_config calls outside withUser helper
      // Prevents GUC hazards by forcing all JWT claims through withUser()
      "no-restricted-syntax": [
        "error",
        {
          selector: "TemplateLiteral:matches([quasis.0.value.raw*='set_config'])",
          message: "Direct set_config calls are banned. Use withUser() helper from lib/db/with-user.ts to safely set JWT claims and prevent GUC hazards."
        }
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "set_config",
          message: "Direct set_config calls are banned. Use withUser() helper from lib/db/with-user.ts."
        }
      ]
    }
  },
  {
    files: ["lib/db/with-user.ts", "tests/**/*.ts", "tests/**/*.js"],
    rules: {
      // Allow set_config in withUser implementation and tests
      "no-restricted-syntax": "off"
    }
  },
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
