/**
 * Declared-pending registry for API specs whose route handler does not exist yet.
 *
 * History this file replaces: the whole `tests/integration/api/` directory was
 * excluded from `npm test` by a glob, and CI ran only `npm test`. That made the
 * exclusion the *only* thing standing between a permanently-red pipeline and a
 * green tick — and it hid the 13 specs whose handlers do exist and pass, right
 * alongside the 11 that target unbuilt routes. `npm test` still excludes the
 * directory (the API suites boot a `next dev` server and need a live stack);
 * CI now runs them explicitly via `npm run test:api`.
 *
 * So a spec here is a *counted, attributable* skip in the test report, not an
 * invisible one.
 *
 * **When you implement a route, delete its entry from this file.**
 * `tests/unit/api/pending-handlers.test.ts` fails if an entry names a route
 * surface that has since been created, so a stale entry cannot quietly keep a
 * suite switched off. If the suite then fails, that is the gate working — not a
 * reason to re-add the entry.
 */
export interface PendingRoute {
  /** Route surface that must not exist while this entry is live. */
  handlerPath: string;
  /** GitHub issue that owns building the handler. */
  issue: string;
  /** What is actually missing, for the test report. */
  reason: string;
}

export const PENDING_ROUTES = {
  signout: {
    handlerPath: 'src/app/auth/signout',
    issue: '#42',
    reason: 'POST /auth/signout handler is not implemented',
  },
  exercises: {
    handlerPath: 'src/app/api/exercises',
    issue: '#42',
    reason: 'GET /api/exercises handler is not implemented',
  },
  progress: {
    handlerPath: 'src/app/api/progress',
    issue: '#42',
    reason: 'GET /api/progress/:exerciseSlug handler is not implemented',
  },
  importLegacy: {
    handlerPath: 'src/app/api/import',
    issue: '#40',
    reason: 'POST /api/import/legacy handler is not implemented (M2-05 importer)',
  },
} as const satisfies Record<string, PendingRoute>;

export type PendingRouteKey = keyof typeof PENDING_ROUTES;

/**
 * Condition for `describe.skipIf` / `it.skipIf`. Returns the reason string so a
 * caller can also name the skip: `describe(\`... (${pending('signout')})\`)`.
 */
export function pending(key: PendingRouteKey): string | undefined {
  const entry = PENDING_ROUTES[key];
  return entry ? `${entry.reason} — ${entry.issue}` : undefined;
}

/** Boolean form for `*.skipIf(...)`. Reads better at the call site. */
export function isPending(key: PendingRouteKey): boolean {
  return PENDING_ROUTES[key] !== undefined;
}
