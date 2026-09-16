/**
 * M4-15 (#104) — the zero-JS footgun stays dead, not sleeping.
 *
 * The legacy Vite app shipped `npm run build` as a command that exited 0 while emitting
 * zero JavaScript — a decoy gate (PROMPTKIT §2). #103 deleted the estate but deliberately
 * left the scripts and the `vite` devDependency for this card; #104 rewired `dev`/`build`/
 * `start` onto the Next commands and dropped `preview` + `vite`.
 *
 * AC-2 of the card says the claim must hold "when git ls-files and node_modules are
 * examined" — so it is guarded the same way every other absence claim here is: a scan that
 * CI executes, not a promise in prose. Vitest legitimately depends on vite transitively;
 * this guard reads package.json's *own* declarations, where `\bvite\b`'s word boundary
 * keeps `vitest` legal by construction rather than by exception. The node_modules side is
 * checked as a direct-dependency claim: `vite` may exist inside `node_modules/vitest`, and
 * must not be listed by this package.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as PackageJson;

describe('M4-15: no script path or direct dependency reaches a vite build', () => {
  it('names the scripts it claims to have scanned', () => {
    // A vacuous scan is a false green — the shape every guard in this repo exists to refuse.
    const scripts = Object.keys(pkg.scripts ?? {});
    expect(scripts.length, 'no npm scripts found — this guard is scanning nothing').toBeGreaterThan(
      10,
    );
    expect(scripts).toContain('build');
    expect(scripts).toContain('start');
  });

  it('has no npm script whose command mentions vite (vitest survives the word boundary)', () => {
    const offenders = Object.entries(pkg.scripts ?? {})
      .filter(([, command]) => /\bvite\b/.test(command))
      .map(([name]) => name);
    expect(
      offenders,
      `M4-15 retired the legacy Vite scripts; a \`vite\` command is back on a script path: ` +
        `${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('does not declare vite as a direct dependency (Vitest ships its own)', () => {
    expect(pkg.dependencies ?? {}, 'vite is back in dependencies').not.toHaveProperty('vite');
    expect(pkg.devDependencies ?? {}, 'vite is back in devDependencies').not.toHaveProperty('vite');
  });

  it('tracks no dist/ artifact and no vite config remnant', () => {
    const tracked = execFileSync(
      'git',
      ['ls-files', '--', 'dist', 'vite.config.js', 'vite.config.ts', 'vite.config.mjs'],
      { cwd: ROOT, encoding: 'utf8' },
    ).trim();
    // Unlike `git grep`, `git ls-files` exits 0 on no match, so a clean tree reads as ''.
    expect(tracked, `M4-14/M4-15 removed these from the repo; tracked again:\n${tracked}`).toBe('');
  });
});
