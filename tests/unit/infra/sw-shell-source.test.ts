/**
 * M4-22 (#111) — the update policy, pinned as a property of the shipped bytes.
 *
 * PD-4 moved all *runtime* worker behaviour to `tests/e2e/offline-shell.spec.ts`, because a
 * classic worker cannot import Node modules and a unit suite could otherwise only grade a
 * second copy of the logic. What a source test CAN pin — and what belongs here rather than
 * in a browser — is the negative half of ASSUMPTION-m4-004: the things the worker must
 * never do, no matter which fetch happens to be in flight.
 *
 *   1. never `skipWaiting()` and never `clients.claim()` — the mid-workout asset swap is
 *      the exact state M3's outbox contract protects, and the e2e harness cannot conjure a
 *      second deploy to catch a regression (`next start` snapshots `public/` at boot; see
 *      the e2e file header). So this is the fence;
 *   2. never cache `/api/` or `/auth/` — the server is sole truth for data (DECISION-m4-003's
 *      reason for existing), and `sla.spec.ts`'s offline-drain witness assumes every JSON
 *      exchange passes through the worker untouched;
 *   3. refuse a mismatched manifest — install must reject when the two build outputs
 *      disagree, or the worker precaches an unknown set of URLs under a version it stamped
 *      itself.
 *
 * Controls, each watched red then restored: added `self.skipWaiting()` to the activate
 * handler (test 1 red); deleted the `/api/` early-return (test 2 red); removed the version
 * comparison (test 3 red).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SW_SOURCE = readFileSync(join(__dirname, '..', '..', '..', 'public', 'sw.js'), 'utf8');

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<!:)\/\/[^\n]*/g, '');
}

const code = stripComments(SW_SOURCE);

/** The body of a top-level `async function NAME(...)`, up to its closing brace at column 0. */
function functionBody(name: string): string {
  const start = code.indexOf(`async function ${name}(`);
  expect(start, `${name} must exist as a top-level async function`).toBeGreaterThan(-1);
  const end = code.indexOf('\n}', start);
  expect(end, `${name} must close at column 0`).toBeGreaterThan(start);
  return code.slice(start, end);
}

describe('public/sw.js — never-do policy (the shipped bytes, not a copy of them)', () => {
  it('never steals control: no skipWaiting, no clients.claim', () => {
    expect(code).not.toMatch(/\.skipWaiting\s*\(/);
    expect(code).not.toMatch(/clients\s*\.\s*claim\s*\(/);
  });

  it('passes /api/ and /auth/ through before any respondWith, and the caching handlers never name them', () => {
    const fetchGuard = code.match(
      /if\s*\(url\.pathname\.startsWith\((["'])\/api\/\1\)\s*\|\|\s*url\.pathname\.startsWith\((["'])\/auth\/\2\)\s*\)\s*return;/,
    );
    expect(fetchGuard, 'the /api + /auth early-return must stay in the fetch handler').not.toBeNull();
    // The guard must sit in the fetch listener ahead of the first respondWith, not next to it.
    const fetchListener = code.slice(
      code.indexOf('addEventListener("fetch"'),
      code.indexOf('async function networkFirstDocument'),
    );
    expect(fetchListener.indexOf('/api/')).toBeLessThan(fetchListener.indexOf('respondWith'));
    for (const name of ['networkFirstDocument', 'cacheFirstAsset']) {
      const body = functionBody(name);
      expect(body).not.toContain('/api/');
      expect(body).not.toContain('/auth/');
    }
  });

  it('refuses to install when the manifest and the stamped version disagree', () => {
    expect(code).toMatch(/manifest\.version\s*!==\s*BUILD_VERSION/);
    expect(code).toMatch(/addEventListener\(\s*["']install["']/);
  });
});
