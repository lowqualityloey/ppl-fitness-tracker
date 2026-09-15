import { describe, expect, it } from 'vitest';

import {
  buildManifest,
  selectPrecacheUrls,
  stampVersion,
} from '../../../scripts/build-sw-manifest';

/**
 * M4-22 (#111) — the offline shell's only unit-testable half.
 *
 * Per the design spec (docs/design/2026-09-16-m4-22-offline-shell.md PD-4), everything the
 * service worker *does at runtime* is browser behavior and is e2e-only (tests/e2e/
 * offline-shell.spec.ts); the D2 discipline here is the inverse: no fake `ServiceWorkerGlobalScope`
 * mocks, because a policy test that passes against a doubled `fetch` event is exactly the
 * "gate that cannot go red" this repo refuses. What *is* pure and load-bearing is the build
 * side: which URLs get precached, how the version is stamped into the shipped file, and which
 * caches survive activation. A wrong answer in any of the three is an offline reload that
 * silently serves a broken shell.
 *
 * The D2 discipline here is the pure build-side only: which URLs get precached, how the
 * version is stamped into the shipped file, and the loud failure when the marker is absent.
 * A wrong answer in any of them is an offline reload that silently serves a broken shell or
 * a worker that is never updated.
 */

describe('selectPrecacheUrls', () => {
  it('keeps js/css/font assets under /_next/static and nothing else', () => {
    const urls = selectPrecacheUrls([
      '.next/static/chunks/framework-abc123.js',
      '.next/static/chunks/main-def456.js',
      '.next/static/css/globals-ghi789.css',
      '.next/static/media/outfit-latin-400-woff2.font2',
      '.next/static/media/outfit-latin-400-jk0l1m.woff2',
      '.next/static/chunks/framework-abc123.js.map',
      '.next/server/app/page.js',
      '.next/package.json',
    ]);
    expect(urls).toEqual([
      '/_next/static/chunks/framework-abc123.js',
      '/_next/static/chunks/main-def456.js',
      '/_next/static/css/globals-ghi789.css',
      '/_next/static/media/outfit-latin-400-jk0l1m.woff2',
    ]);
  });

  it('is deterministic: same file set, same order, regardless of input order', () => {
    const files = [
      'b/z.js',
      'a/y.css',
      'b/a.js',
    ].map((f) => `.next/static/${f}`);
    const one = selectPrecacheUrls(files);
    const two = selectPrecacheUrls([...files].reverse());
    expect(one).toEqual(two);
  });
});

describe('buildManifest', () => {
  it('locks the { version, urls } shape the worker parses', () => {
    const manifest = buildManifest('v1', ['.next/static/a/app.js']);
    expect(manifest).toEqual({ version: 'v1', urls: ['/_next/static/a/app.js'] });
  });
});

describe('stampVersion', () => {
  const SOURCE = `const BUILD_VERSION = "dev";\nself.addEventListener("install", () => {});\n`;

  it('replaces only the marker line with the real build id', () => {
    const stamped = stampVersion(SOURCE, 'abc123');
    expect(stamped).toContain('const BUILD_VERSION = "abc123";');
    expect(stamped).toContain('self.addEventListener("install"');
  });

  it('is idempotent per version and replaces cleanly across versions', () => {
    const once = stampVersion(SOURCE, 'abc123');
    expect(stampVersion(once, 'abc123')).toBe(once);
    expect(stampVersion(once, 'def456')).toContain('const BUILD_VERSION = "def456";');
    expect(stampVersion(once, 'def456')).not.toContain('abc123');
  });

  it('fails loud when the marker is missing — a silent no-op stamp is the update-detection bug', () => {
    expect(() => stampVersion('const Nope = 1;\n', 'abc123')).toThrow(/BUILD_VERSION/);
  });
});

/*
 * Cache eviction (design spec PD-5: keep current + most-recent-other generation) is NOT
 * exercised here on purpose. The predicate's only runtime home is `public/sw.js`, a classic
 * worker that cannot `import` this file; unit-testing a second copy in TS would grade a
 * double — the exact "passes against a fake" failure this repo refuses. Eviction is observed
 * through `caches.keys()` in tests/e2e/offline-shell.spec.ts against the worker that actually
 * runs. See the note in scripts/build-sw-manifest.ts (PD-4 deviation).
 */
