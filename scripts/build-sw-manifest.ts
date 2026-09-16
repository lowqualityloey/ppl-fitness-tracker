/**
 * M4-22 (#111) — the offline shell's build-side half: pre-build knowledge for `public/sw.js`.
 *
 * Runs *after* `next build` (chained in the `build` script) because nothing else can
 * know this build's hashed chunk URLs or its build id: `next.config.ts` evaluates before
 * `.next/BUILD_ID` exists, and anything that inlines the id earlier either races it or fakes
 * it. Two outputs, both deterministic:
 *
 *  1. `public/sw-manifest.json` — `{ version, urls }`, fetched at SW install time.
 *  2. `public/sw.js` in place — the `const BUILD_VERSION` marker line stamped with the real
 *     build id. The stamp is what makes deployed `sw.js` bytes differ across builds, which is
 *     the *only* update trigger the platform gives a hand-written worker (the browser
 *     byte-checks the script URL); an unstamped worker is never updated.
 *
 * The runtime policy lives in `public/sw.js` and is verified exclusively in the browser
 * (tests/e2e/offline-shell.spec.ts) — see design spec PD-4 for why this file deliberately
 * contains none of it.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface SwManifest {
  version: string;
  urls: string[];
}

const PRECACHE_EXTENSIONS = new Set(['.js', '.css', '.woff', '.woff2']);

/**
 * Map a build-output file path to its precache URL, or reject it. Only `/_next/static/**`
 * is cacheable at runtime (that is where `next build`'s content-hashed chunks, CSS and
 * self-hosted fonts land); source maps are devtools-only and skipped deliberately — they
 * are the largest files in the tree and no runtime request ever asks for them.
 *
 * Runtime *policy* — what the worker caches and evicts once it has these URLs — lives in
 * `public/sw.js` and is asserted only in the browser (PD-4's deviation, recorded on the
 * card): a Node-side copy of the eviction predicate could never run in the worker, so a
 * unit test against it would grade a double. The worker's eviction is observed through
 * `caches.keys()` in the e2e instead.
 */
function precacheUrlFor(file: string): string | null {
  const normalized = file.split(path.sep).join('/');
  if (normalized.startsWith('.next/static/')) {
    const url = `/_next/${normalized.slice('.next/'.length)}`;
    const ext = path.posix.extname(url);
    if (!PRECACHE_EXTENSIONS.has(ext)) return null;
    return url;
  }
  return null;
}

/** Deterministic precache URL list from a build-output file walk (sorted, deduped). */
export function selectPrecacheUrls(files: string[]): string[] {
  const urls = new Set<string>();
  for (const file of files) {
    const url = precacheUrlFor(file);
    if (url !== null) urls.add(url);
  }
  return [...urls].sort();
}

export function buildManifest(version: string, files: string[]): SwManifest {
  return { version, urls: selectPrecacheUrls(files) };
}

/**
 * Replace the worker's version marker line. Fails loud when the marker is missing: a stamp
 * that silently no-ops produces byte-identical `sw.js` across deploys, and a worker whose
 * URL never changes is *never* updated — the exact stale-code landmine #111's AC-2 names.
 * The replacement is positional (`^…$` over the line, `m` flag), so any prior stamp value —
 * including a previous build's id — is a valid target, making the replace idempotent per
 * version and clean across versions.
 */
export function stampVersion(swSource: string, version: string): string {
  const marker = /^const BUILD_VERSION = .*$/m;
  if (!marker.test(swSource)) {
    throw new Error(
      'sw.js BUILD_VERSION marker not found — refusing to ship an unstamped worker (no update detection).',
    );
  }
  return swSource.replace(marker, `const BUILD_VERSION = ${JSON.stringify(version)};`);
}

function walkFiles(dir: string, onFile: (relativePath: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, onFile);
    else onFile(path.relative('.next', full));
  }
}

export function main(root = process.cwd()): void {
  const nextDir = path.join(root, '.next');
  const buildIdFile = path.join(nextDir, 'BUILD_ID');
  if (!existsSync(buildIdFile)) {
    throw new Error(`.next/BUILD_ID missing at ${buildIdFile} — run next build first.`);
  }
  const rawBuildId = readFileSync(buildIdFile, 'utf8').trim();
  // Stable, readable cache keys: build ids are content hashes, but a future build id cannot
  // be allowed to collide with the *absence* of one, so the version is a short digest.
  const version = createHash('sha256').update(rawBuildId).digest('hex').slice(0, 12);

  const files: string[] = [];
  walkFiles(nextDir, (relativeFromNext) => files.push(`.next/${relativeFromNext}`));
  const manifest = buildManifest(version, files);
  if (manifest.urls.length === 0) {
    throw new Error('manifest has zero precache URLs — .next/static walk found nothing; refusing to ship an empty shell.');
  }

  writeFileSync(
    path.join(root, 'public', 'sw-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const swPath = path.join(root, 'public', 'sw.js');
  writeFileSync(swPath, stampVersion(readFileSync(swPath, 'utf8'), version));
  console.log(`[sw-manifest] version ${version}: ${manifest.urls.length} precache URLs, sw.js stamped.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
