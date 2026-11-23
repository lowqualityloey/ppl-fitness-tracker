/**
 * M4-09 (#98) — the unit layer stays hermetic, enforced rather than promised.
 *
 * D2 of the 2026-09-11 intake audit: `tests/unit/with-user.test.ts` was an integration
 * test sitting in the unit layer. It reached Postgres through
 * `../integration/test-helpers.js`, so `tests/unit` was red offline **by construction** —
 * the fastest feedback loop in the repo could not run without a live database. #98 moved
 * that file to `tests/integration/`; this guard exists so the class does not come back one
 * import at a time.
 *
 * The rule is about sockets, not about directory boundaries. A unit test may import
 * application code (`lib/`, `db/`, `src/`) — that is the thing under test — or a pure
 * fixture from elsewhere in `tests/`, where shared dependency-free helpers legitimately
 * live. What it may not do is reach a socket, either directly (`import { Pool } from 'pg'`)
 * or through a shared fixture that dials one on its behalf. Because that second shape is how
 * D2 entered — the import line looked innocent while the helper opened the connection —
 * relative imports *inside `tests/`* are followed and scanned too.
 *
 * Application imports are deliberately not followed: `tests/unit/db/client.test.ts` imports
 * `lib/db/client.ts`, which imports `pg`, and is legitimately hermetic because it only builds
 * a handle and never connects. Whether a test connects is a runtime property; an import scan
 * can only police the imports, so it polices the ones whose whole purpose is infrastructure.
 *
 * What this cannot see: a bare global `fetch()`, which has no specifier to inspect. Such a
 * test still fails offline; it just fails at run time rather than at this guard.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const UNIT_DIR = 'tests/unit';

/**
 * Modules whose import opens, or is the client for, a network socket.
 * Package roots are listed so `pg` also catches `pg/lib/x`. `drizzle-orm` itself is
 * pure, so only its node-postgres driver subpath is named.
 */
const SOCKET_MODULES = new Set([
  'net',
  'tls',
  'dgram',
  'http',
  'https',
  'http2',
  'undici',
  'ws',
  'pg',
  'pg-pool',
  'pg-promise',
  'postgres',
  'mysql',
  'mysql2',
  'sqlite3',
  'better-sqlite3',
  'ioredis',
  'redis',
  'mongodb',
  '@supabase/supabase-js',
  'drizzle-orm/node-postgres',
]);

/** Covers `import x from 'y'`, `import 'y'`, `require('y')`, `await import('y')`. */
const SPECIFIER_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g;

/** How far a relative chain is followed. D2 was depth 1; 4 leaves room without fanning out. */
const MAX_CHAIN = 4;

type Source = { path: string; source: string };

/**
 * Comments dropped before scanning. A comment cannot open a socket, and this guard's own
 * doc block quotes the imports it forbids — without this it would flag itself.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
}

/** Module specifiers named by a source file, in order of appearance. */
function specifiersIn(source: string): string[] {
  return [...stripComments(source).matchAll(SPECIFIER_PATTERN)].map((match) => match[1] as string);
}

/** Package root of a bare specifier: `node:pg` → `pg`, `@scope/pkg/sub` → `@scope/pkg`. */
function packageRoot(specifier: string): string {
  const bare = specifier.replace(/^node:/, '');
  if (bare.startsWith('@')) return bare.split('/').slice(0, 2).join('/');
  return bare.split('/')[0] as string;
}

/** True when a bare specifier names a socket client. */
function isSocketModule(specifier: string): boolean {
  return SOCKET_MODULES.has(specifier) || SOCKET_MODULES.has(packageRoot(specifier));
}

/**
 * Repo-relative file a relative specifier points at, or null when it resolves outside the
 * repo. Node-style extensionless specifiers are tried with the usual suffixes.
 */
function resolveRelative(fromPath: string, specifier: string): string | null {
  const base = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  if (base.startsWith('..')) return null;
  // This repo writes NodeNext specifiers ('./x.js' for a file on disk named x.ts), so the
  // '.js' form must be retried as '.ts' — otherwise the chain never resolves and every
  // relative import silently passes.
  const withoutJs = base.endsWith('.js') ? base.slice(0, -3) : null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    posix.join(base, 'index.ts'),
    ...(withoutJs === null ? [] : [`${withoutJs}.ts`, `${withoutJs}.tsx`]),
  ];
  return (
    candidates.find((candidate) => {
      const absolute = join(ROOT, candidate);
      // A directory is not a file: `import './fixtures.js'` may name a folder that also has
      // an index.ts, and both `readFileSync` and the scan need the file, not the folder.
      return existsSync(absolute) && statSync(absolute).isFile();
    }) ?? null
  );
}

/**
 * Every reason this file's import graph can reach a socket. `via` is the chain of
 * specifiers already followed, so a report names the path that leaked rather than only the
 * innocent-looking first hop.
 */
function socketReaches(path: string, source: string, via: string[] = []): string[] {
  if (via.length > MAX_CHAIN) return [];
  const offenders: string[] = [];
  for (const specifier of specifiersIn(source)) {
    if (!specifier.startsWith('.')) {
      if (isSocketModule(specifier)) {
        offenders.push(
          `${path}: imports '${specifier}' (opens a socket)` +
            (via.length > 0 ? ` [via ${via.join(' → ')}]` : ''),
        );
      }
      continue;
    }
    const target = resolveRelative(path, specifier);
    if (target === null) continue; // outside the repo: nothing local to inspect
    // Only test-suite fixtures are followed. An application module may import `pg` and still
    // be hermetic at this layer (see the doc block); a shared test fixture may not, because
    // its only reason to exist is to reach infrastructure.
    if (!target.startsWith('tests/')) continue;
    offenders.push(
      ...socketReaches(target, readFileSync(join(ROOT, target), 'utf8'), [...via, specifier]),
    );
  }
  return offenders;
}

function findOffenders(sources: Source[]): string[] {
  return sources.flatMap(({ path, source }) => socketReaches(path, source));
}

/**
 * Unit test files on disk, repo-relative, posix separators.
 *
 * `--cached --others --exclude-standard` is deliberate: a test that is written but not yet
 * committed must fail this guard locally, because that is the moment the import is added.
 * Scanning only the index would make the guard green until the offending file is committed,
 * which is the one ordering where CI never gets a say either.
 */
function unitTestsOnDisk(): string[] {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', UNIT_DIR],
    { cwd: ROOT, encoding: 'utf8' },
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.test.ts'))
    // A tracked path that is being deleted (a rename captured as add + delete) still lists
    // in the index and has no source left to scan. Only files that exist are hermetic or not.
    .filter((line) => existsSync(join(ROOT, line)));
}

// Probe sources are assembled from a specifier string so this file's own text never looks
// like the imports it forbids — otherwise the guard would flag itself and the scan would
// be unusable at exactly the moment it matters.
const importFrom = (specifier: string): string => `import { probe } from '${specifier}';`;
const dynamicImportOf = (specifier: string): string => `const probe = await import('${specifier}');`;

describe('M4-09: the unit layer opens no socket', () => {
  const unitTests = unitTestsOnDisk();
  const sources: Source[] = unitTests.map((path) => ({
    path,
    source: readFileSync(join(ROOT, path), 'utf8'),
  }));

  it('names the files it claims to have scanned', () => {
    // A vacuous scan is a false green — the shape every guard in this repo exists to refuse.
    expect(
      unitTests.length,
      'no unit test files found — this guard is scanning nothing',
    ).toBeGreaterThan(20);
    expect(unitTests).toContain('tests/unit/infra/hermetic-unit-layer.test.ts');
    // The D2 file must be gone from here, not merely quiet: it lives in tests/integration/.
    expect(unitTests, 'with-user.test.ts is back in the unit layer').not.toContain(
      'tests/unit/with-user.test.ts',
    );
  });

  it('has no unit test whose import chain reaches a socket', () => {
    const offenders = findOffenders(sources);
    expect(
      offenders,
      'The unit layer must stay offline. Move the test to tests/integration/ instead of ' +
        `reaching live-Postgres fixtures from the unit layer:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('detects the shape it forbids (the detector is not vacuous)', () => {
    // Direct socket imports, a package root and a driver subpath.
    expect(
      findOffenders([
        { path: 'tests/unit/probe.test.ts', source: importFrom('pg') },
        { path: 'tests/unit/probe.test.ts', source: importFrom('drizzle-orm/node-postgres') },
        { path: 'tests/unit/infra/probe.test.ts', source: dynamicImportOf('node:net') },
      ]),
    ).toHaveLength(3);

    // The one-hop shape D2 also had: an innocent-looking relative import of a fixture that
    // dials Postgres itself. `tests/integration/api/fixtures.ts` is a real tracked file, so
    // this probe fails if chain-following breaks, not only if the socket list breaks.
    expect(
      findOffenders([
        {
          path: 'tests/unit/probe.test.ts',
          source: importFrom('../integration/api/fixtures.js'),
        },
      ]),
    ).toEqual([
      expect.stringContaining("'pg' (opens a socket) [via ../integration/api/fixtures.js]"),
    ]);

    // …and that legal imports stay legal: file-reading builtins, application code (which
    // may legitimately import `pg` as long as it does not connect — the chain is not
    // followed into `lib/`), a pure helper from tests/e2e, and a unit-tree fixture.
    expect(
      findOffenders([
        { path: 'tests/unit/probe.test.ts', source: importFrom('node:fs') },
        { path: 'tests/unit/probe.test.ts', source: importFrom('../../../lib/db/with-user.js') },
        { path: 'tests/unit/infra/probe.test.ts', source: importFrom('../../e2e/latency-helpers.js') },
        { path: 'tests/unit/infra/probe.test.ts', source: importFrom('./fixture.js') },
        { path: 'tests/unit/infra/probe.test.ts', source: importFrom('vitest') },
      ]),
    ).toEqual([]);
  });
});
