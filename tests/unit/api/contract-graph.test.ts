import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * M3-00 (#57): the contract graph — routes must be *thin adapters* over
 * `lib/contracts/`, and drift here is silent: a route that declares its own
 * response shape keeps passing its own tests forever while the shared
 * contract rots next to it.
 *
 * This is a static check on purpose. Importing route modules into a unit
 * process would either drag in `next/headers` (throws outside a request) or
 * prove nothing, since the behavior is already proven through HTTP in
 * `tests/integration/api/`. What only a *source* check can catch is shape
 * ownership: `z.` must appear in `lib/contracts/`, not in `src/app/api/`.
 *
 * Every route handler in the app is listed, so a new route cannot join the
 * graph without declaring which contracts it is an adapter for.
 */

const ROOT = process.cwd();

type GraphEntry = {
  route: string;
  /** basenames under lib/contracts/ the route must import from */
  contracts: string[];
  methods: string[];
};

const GRAPH: GraphEntry[] = [
  { route: 'src/app/api/sessions/route.ts', contracts: ['sessions', 'envelope'], methods: ['GET', 'POST'] },
  { route: 'src/app/api/sessions/[id]/route.ts', contracts: ['sessions', 'envelope'], methods: ['GET'] },
  { route: 'src/app/api/sessions/prefill/route.ts', contracts: ['sessions', 'envelope'], methods: ['GET'] },
  { route: 'src/app/api/profile/route.ts', contracts: ['profile', 'envelope'], methods: ['GET', 'PATCH'] },
  { route: 'src/app/api/sync/route.ts', contracts: ['sync', 'envelope'], methods: ['POST'] },
  { route: 'src/app/api/exercises/route.ts', contracts: ['exercises', 'envelope'], methods: ['GET'] },
  { route: 'src/app/api/progress/[exerciseSlug]/route.ts', contracts: ['progress', 'envelope'], methods: ['GET'] },
  { route: 'src/app/api/import/legacy/route.ts', contracts: ['import', 'envelope'], methods: ['POST'] },
];

function readRoute(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('contract graph: every API route is an adapter over lib/contracts', () => {
  it.each(GRAPH.map((entry) => [entry.route, entry] as const))(
    '%s imports its declared contracts and exports its declared methods',
    (_route, entry) => {
      const source = readRoute(entry.route);
      for (const contract of entry.contracts) {
        expect(
          new RegExp(`from '[^']*lib/contracts/${contract}'`).test(source),
          `${entry.route} must import from lib/contracts/${contract}`,
        ).toBe(true);
      }
      for (const method of entry.methods) {
        expect(
          new RegExp(`export async function ${method}\\(`).test(source),
          `${entry.route} must export ${method}`,
        ).toBe(true);
      }
    },
  );

  it('keeps every schema declaration in lib/contracts — routes own none', () => {
    for (const entry of GRAPH) {
      const source = readRoute(entry.route);
      // A route building `z.object(...)` is a second owner of the wire shape.
      expect(source, `${entry.route} must not import zod directly`).not.toMatch(/from ['"]zod['"]/);
      expect(source, `${entry.route} must not declare schemas inline`).not.toMatch(/\bz\.(object|array|enum|string|number|union|literal|discriminatedUnion)\(/);
    }
  });

  it('ships a route for each contract that promises one (M3 additions)', () => {
    // These two sentences used to be the whole gap #57/#58 exist to close:
    // contracts committed while zero routes served them.
    expect(readFileSync(join(ROOT, 'src/app/api/profile/route.ts'), 'utf8')).toContain('ProfilePatchSchema');
    const detail = readRoute('src/app/api/sessions/[id]/route.ts');
    expect(detail).toContain('SessionDetailQuerySchema');
    // The `since` discard that hid behind a false comment must never return.
    expect(detail).not.toMatch(/void parsedQuery\.data\.since/);
    expect(detail).not.toMatch(/M2-04 owns true deltas/);
  });
});
