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
  {
    // M4-05 (#94): the logging seam is the only thing that writes application
    // logs. `console.*` beside it is not a style preference but a second,
    // unredacted, uncorrelated channel — the shape #125 was filed against,
    // where the causes existed in the output and could not be tied to anything.
    //
    // Scope is `src/app/api` (the handlers the card names) and `lib` (where the
    // domain and the auth hop actually log from: `requireUserContext`'s shed
    // line lived in `lib/`, not in a route file, and a ban that stopped at
    // `src/app/api` would have left it exactly where it was).
    //
    // `tests/**` is exempt: a spec asserting a line was written must be able to
    // capture stdout, and #94's own verification asks for that via an injected
    // sink rather than by rewriting the assertion into a spy.
    files: ["src/app/api/**/*.ts", "src/app/api/**/*.tsx", "lib/**/*.ts"],
    ignores: ["lib/logger/**"],
    rules: {
      // `"no-console": ["error", { allow: [] }]` — the shape this rule's own
      // documentation shows for "ban everything" — makes ESLint 9.39 fail to
      // load the config at all ("Key \"no-console\": Value [] should NOT have
      // fewer than 1 items"), which breaks lint for every file in the repo
      // rather than merely the new ban. Watched red in `console-ban.test.ts`,
      // where a fatal looks exactly like a clean run unless it is asserted
      // against. Plain `"error"` is the ban, and it does cover `warn` and
      // `error`: `no-console` alone flags all three (checked against 9.39.5,
      // whatever the older documented default was).
      //
      // `no-restricted-properties` therefore adds no coverage. It is here for
      // the message. `console.error` is precisely the call an engineer believes
      // is safe — it is how #125's cause got shed — so the line that refuses it
      // should name the seam instead of printing "Unexpected console statement".
      //
      // `no-restricted-syntax` is deliberately left alone: the top-level entry
      // carries M1-11's `set_config` ban for `lib/**`, and re-declaring that rule
      // here would override it for those files.
      "no-console": "error",
      "no-restricted-properties": [
        "error",
        {
          object: "console",
          property: "warn",
          message: "Warnings go through `log.warn` from lib/logger (#94): console.warn bypasses redaction and the request correlation."
        },
        {
          object: "console",
          property: "error",
          message: "Failures go through `log.error` from lib/logger (#94) so the cause lands on the same line as the request_id (#125)."
        }
      ]
    }
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Throwaway M0 spike sandbox, has its own tooling (spikes/m0-drizzle-rls/package.json).
    "spikes/**",
  ]),
]);

export default eslintConfig;
