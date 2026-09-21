import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * M4-05 (#94): every route handler enters the request scope.
 *
 * `contract-graph.test.ts` established why a *source* check is the only
 * honest seam here: importing a route module into a unit process drags in
 * `next/headers` (throws outside a request), and the runtime behavior is
 * already proven through HTTP in `tests/integration/api/`. What only a
 * source check can catch is the shape of the export — a handler that skips
 * `loggedRoute` compiles, passes every functional test, and quietly
 * produces request lines with no completion line and errors with no id.
 *
 * The registry below is cross-checked against the filesystem, so a new
 * `route.ts` cannot join the app without also joining the trail: the
 * set-equality assertion fails first, and the fix is to wrap the handlers,
 * not to edit this file.
 */

const ROOT = process.cwd();

const HTTP_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;

/** route file → exported HTTP methods, mirroring `contract-graph.test.ts`'s GRAPH. */
const TRAIL_REGISTRY: Array<{ route: string; methods: string[] }> = [
  { route: 'src/app/api/sessions/route.ts', methods: ['GET', 'POST'] },
  { route: 'src/app/api/sessions/[id]/route.ts', methods: ['GET'] },
  { route: 'src/app/api/sessions/prefill/route.ts', methods: ['GET'] },
  { route: 'src/app/api/profile/route.ts', methods: ['GET', 'PATCH'] },
  { route: 'src/app/api/sync/route.ts', methods: ['POST'] },
  { route: 'src/app/api/exercises/route.ts', methods: ['GET'] },
  { route: 'src/app/api/progress/[exerciseSlug]/route.ts', methods: ['GET'] },
  { route: 'src/app/api/import/legacy/route.ts', methods: ['POST'] },
  { route: 'src/app/api/export/v1/route.ts', methods: ['GET'] },
  { route: 'src/app/api/measurements/route.ts', methods: ['GET', 'POST'] },
  { route: 'src/app/api/health/route.ts', methods: ['GET'] },
  { route: 'src/app/auth/confirm/route.ts', methods: ['GET'] },
  { route: 'src/app/auth/signin/route.ts', methods: ['POST'] },
  { route: 'src/app/auth/signout/route.ts', methods: ['POST'] },
];

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function routeFilesOnDisk(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name === 'route.ts' ? [relative(ROOT, full).split(sep).join('/')] : [];
    });
  return walk(join(ROOT, 'src', 'app')).sort();
}

describe('route scope: every handler is exported through loggedRoute', () => {
  it('the registry covers exactly the route files on disk', () => {
    const registered = TRAIL_REGISTRY.map((entry) => entry.route).sort();
    expect(routeFilesOnDisk()).toEqual(registered);
  });

  it.each(TRAIL_REGISTRY.map((entry) => [entry.route, entry] as const))(
    '%s wraps each declared method and exports nothing raw',
    (_route, entry) => {
      const source = readSource(entry.route);

      // `export async function GET(` anywhere in the file — even under a
      // method this entry forgot to declare — is an unwrapped handler.
      for (const method of HTTP_METHODS) {
        expect(
          new RegExp(`export\\s+async\\s+function\\s+${method}\\b`).test(source),
          `${entry.route} exports a raw ${method} handler; wrap it in loggedRoute`,
        ).toBe(false);
      }

      for (const method of entry.methods) {
        expect(
          new RegExp(`export\\s+const\\s+${method}\\s*=\\s*loggedRoute\\s*\\(`).test(source),
          `${entry.route}.${method} must be exported as loggedRoute(handle…)`,
        ).toBe(true);
        // One wrapper call, exactly once per method: `loggedRoute(loggedRoute(…))`
        // would double every completion line, and a second stray export of the
        // same name cannot compile but can be left half-deleted in a merge.
        const wrappedCount = source
          .split(new RegExp(`export\\s+const\\s+${method}\\s*=`))
          .length - 1;
        expect(wrappedCount).toBe(1);
      }
    },
  );
});

describe('the wrapper is the single choke point it claims to be', () => {
  it('request-log.ts owns the scope and the completion line, in exactly one place', () => {
    const source = readSource('lib/http/request-log.ts');
    expect(source).toContain('withRequestScope');
    expect(source).toContain("'request completed'");
    // No route file may *enter* a scope itself — that is the wrapper's job,
    // and two entry points would be two completion-line emitters. What a
    // route may do is enrich the scope it was wrapped into:
    // `sessions/[id]` attaches the session its URL names, which no generic
    // wrapper could know. That distinction is the whole assertion below.
    for (const entry of TRAIL_REGISTRY) {
      const routeSource = readSource(entry.route);
      expect(
        routeSource.includes('withRequestScope'),
        `${entry.route} opens a scope instead of going through loggedRoute`,
      ).toBe(false);
    }
  });
});
