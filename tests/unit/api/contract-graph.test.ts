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
  { route: 'src/app/api/export/v1/route.ts', contracts: ['export', 'envelope'], methods: ['GET'] },
];

function readRoute(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

/** Counted rather than eyeballed: "exactly one" is the assertion that keeps a comment from satisfying it. */
function countMatches(source: string, needle: string): number {
  return source.split(needle).length - 1;
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
        // M4-05 (#94) widened this: the export may be a raw `async function`
        // or the wrapped `const GET = loggedRoute(…)` form — what the graph
        // owns is "the method is exported", and which of the two legal shapes
        // carries it is the trail guard's business (`route-scope.test.ts`).
        expect(
          new RegExp(
            `export (async function ${method}\\(|const ${method} =\\s*loggedRoute\\()`,
          ).test(source),
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

  it('holds every producer to the contract it answers with (M3-09 #73; narrowed by #105)', () => {
    /*
     * `SessionStateSchema` stopped being a placeholder, and a contract its producers do
     * not enforce is documentation: a mapper that drifts would still ship, and the first
     * thing to notice would be a client refusing to render a workout. So each route that
     * returns a validated body must parse it on the way out. This is a source check because the
     * alternative — importing a route handler into a node process — throws on
     * `next/headers`, and the behavioral half is covered by
     * `tests/unit/contracts/outgoing-validation.test.ts` plus the API suites.
     *
     * This list used to be titled "the three session-graph producers". #105 deleted
     * `SyncResponseData.state`, so only the first two ship the graph — and the sync entry stays
     * deliberately, because the guard is about a route validating what it sends, not about which
     * schema it happens to send. Deleting a field from a `.strict()` contract *raises* the stakes
     * here: a producer that keeps emitting `state` now fails `validateOutgoing` and answers a
     * drained batch with a redacted 500. The key list itself is pinned in
     * `tests/unit/contracts/contracts.test.ts`, and the bytes are pinned in
     * `tests/integration/api/sync.test.ts`.
     *
     * The check is a *forbidding* file's positive twin: without it, deleting a
     * `validateOutgoing` call would leave every test in the repo green.
     */
    const producers: ReadonlyArray<readonly [string, string]> = [
      ['src/app/api/sessions/route.ts', 'SessionStartResponseSchema'],
      ['src/app/api/sessions/[id]/route.ts', 'SessionDetailResponseSchema'],
      ['src/app/api/sync/route.ts', 'SyncResponseSchema'],
      ['src/app/api/export/v1/route.ts', 'ExportV1Schema'],
    ];
    for (const [route, schema] of producers) {
      const source = readRoute(route);
      expect(
        source,
        `${route} must validate its outgoing body through ${schema}`,
      ).toContain(`validateOutgoing(${schema}`);
      expect(source, `${route} must import the validator from lib/contracts`).toMatch(
        /from '[^']*lib\/contracts\/envelope'/,
      );
    }

    // And the exact inverse, because this route has a documented body-less answer: the
    // `since === server_seq` short-circuit returns `{ notModified, serverSeq }` and *must
    // not* be run through the session schema, or every poll would 500.
    const detail = readRoute('src/app/api/sessions/[id]/route.ts');
    expect(
      detail,
      'the notModified short-circuit carries no session body and must stay unwrapped',
    ).toMatch(/const data: SessionNotModified = \{ notModified: true, serverSeq \};\s*return NextResponse\.json\(appSuccess\(data\)/);
    expect(countMatches(detail, 'validateOutgoing('), 'exactly one assertion in the detail route').toBe(1);
  });

  it('keeps the deleted sync `state` field out of the code that answers with it (#105)', () => {
    /*
     * Option B's first acceptance criterion is "no code path or schema mentions the removed
     * field", which is not something a comment can promise. The list below is the whole path a
     * sync answer travels: the schema, the seam that fills it, the conflict model that decides
     * it, the route that ships it — and the three client files that would have consumed it. If
     * the session graph reappears anywhere on that path — a field put back, a `getState()`
     * revived to fill a field that is not there, an import of the graph's schema, a read side
     * reaching for `body.state` — this fails before a request has to be made to find out.
     *
     * The read side is the load-bearing half. "No client reads this field" is the premise the
     * deletion rests on, and a premise is worth the control that re-checks it: the day someone
     * starts projecting server state out of a batch, that person is implementing Option A and
     * needs a red test telling them the contract says four fields.
     *
     * Comments are stripped first, on purpose: several of these files *document* the removal, and
     * prose about a deleted field is not a live reference to it. The strip is a regex, not a
     * parser, so the patterns below are ones an ordinary comment could not accidentally satisfy —
     * they look like declarations and property assignments.
     *
     * `lib/repositories/workout-repository.ts` is *not* in this list. It legitimately maps the
     * session graph to gate each mutation's lifecycle; what #105 deleted was the extra, final
     * mapping whose only consumer was a response field. Sweeping the repository in would make the
     * guard lie about the code it covers. `audio-cue.ts` and `timer-controller.ts` stay out for
     * the mirror-image reason: both own a `state` of their own — an `AudioContext`'s, a
     * controller's — which has nothing to do with a wire contract, and flagging those would only
     * teach the next reader to distrust the failure message.
     */
    const stripComments = (source: string): string => source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    const syncPath = [
      'lib/contracts/sync.ts',
      'lib/domain/sync/types.ts',
      'lib/domain/sync/sync-engine.ts',
      'src/app/api/sync/route.ts',
      'src/app/state/provider.tsx',
      'src/app/state/sync-engine.ts',
      'src/app/state/reconcile.ts',
    ];

    for (const path of syncPath) {
      const source = stripComments(readFileSync(join(ROOT, path), 'utf8'));
      const label = `${path} must not reference the session graph #105 removed`;
      expect(source, `${label}: it names SessionState`).not.toMatch(/\bSessionState\b/);
      expect(source, `${label}: it declares or reads a state field`).not.toMatch(/\bstate\s*[?+]?:|\.state\b/);
      expect(source, `${label}: it still reads state through the store`).not.toMatch(/\bgetState\s*\(/);
    }

    // This file stays a *source* check by design (see the header): the key list itself is
    // counted in `tests/unit/contracts/contracts.test.ts`, and the bytes are counted in
    // `tests/integration/api/sync.test.ts`. What lives here is the one thing only a source scan
    // can catch — a module in the sync path reaching for a type it has no business naming.
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
