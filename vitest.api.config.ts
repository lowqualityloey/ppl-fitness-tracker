import { defineConfig, mergeConfig } from 'vitest/config';
// `.js` on purpose: it maps to `./vitest.config.ts` under `moduleResolution: bundler`
// and keeps Vite's config loader from warning about an extensionless import on
// every run — a warning that becomes a hard failure when `configLoader: 'native'`
// stops being opt-in.
import base from './vitest.config.js';

/**
 * The API suite's config: the base config plus one server for the whole run.
 *
 * A separate file rather than an entry in `vitest.config.ts` because the
 * `globalSetup` must not run for `npm test`. That command runs the unit and
 * integration files with the API directory excluded — booting a Next dev server
 * for it would be dead weight and a new way for the fast lane to fail.
 *
 * `npm run test:api` is the only caller. Running a single file without this
 * config still works: `startApiServer()` falls back to spawning a server this
 * process owns, which is what a developer debugging one file expects.
 *
 * `passWithNoTests: false` is the one thing this config takes away from the
 * base, and it is the difference between a gate and a green light. The base
 * keeps `true` because `npm test` is a broad lane that has to tolerate an empty
 * match. This suite is named: `test:api` exists to run the API directory, so
 * matching zero files is not "nothing to do", it
 * is a broken invocation. With the inherited `true`, measured 2026-11-19,
 * `vitest run --config vitest.api.config.ts tests/integration/api/does-not-exist.test.ts`
 * printed `No test files found, exiting with code 0` and exited **0** — and
 * because `globalSetup` never ran, no server was booted and no manifest was
 * written, so nothing else in the harness had a chance to notice. A CI step
 * that lost its file list, or a path typo in the script, would have read as a
 * pass. `mergeConfig` is a deep merge, so the child value wins; the installed
 * Vitest honours it at
 * `node_modules/vitest/dist/chunks/index.1TqnEahn.js:8499`.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      globalSetup: ['tests/integration/api/global-setup.ts'],
      passWithNoTests: false,
    },
  }),
);
