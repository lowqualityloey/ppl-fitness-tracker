/**
 * #100 — the suite's ability to explain a red is itself a gated property.
 *
 * For the whole life of this project, a Playwright failure has produced a console line and nothing else.
 * Not because nobody configured evidence: `playwright.config.ts` said `trace: "on-first-retry"`, while
 * `retries` was unset in the config and in every spec — so the default of 0 applied, no test was ever
 * retried, and **the retry condition could never be reached.** Every incident in
 * `docs/rca/m4-100-contention-ledger.md` was investigated through that gap, including one on CI.
 *
 * `retain-on-failure` and the `json` reporter close it, and were watched producing output: a deliberate
 * failing spec left `trace.zip` and a `status: "failed", duration: 1558` entry, while its passing
 * neighbour left no trace and `duration: 3440`. This file exists so that configuration cannot quietly
 * revert to a comment that describes intent nobody can observe.
 *
 * It scans text rather than importing the config on purpose: `retries` must be absent from *every* spec
 * too, and importing `@playwright/test` into the unit layer would make a fast guard depend on a browser
 * harness. The trade is that a value computed at runtime would be invisible here — which is why the
 * assertions name the exact strings a future editor would have to write instead.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const E2E_DIR = join(ROOT, 'tests', 'e2e');

/**
 * Code only. A guard that reads prose fails on the first comment that *names* the thing it forbids —
 * which is what happened here: the block comment explaining why `on-first-retry` was dead tripped the
 * assertion meant to catch a regression to it. Stripping block comments, and line comments whose `//` is
 * not preceded by `:` (so `"http://localhost:3001"` survives), leaves the settings and drops the argument.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<!:)\/\/[^\n]*/g, '');
}

const config = stripComments(readFileSync(join(ROOT, 'playwright.config.ts'), 'utf8'));
const specFiles = readdirSync(E2E_DIR).filter((name) => name.endsWith('.spec.ts'));
const specSources = specFiles.map((name) => [name, readFileSync(join(E2E_DIR, name), 'utf8')] as const);

describe('#100: the e2e layer leaves evidence behind when it goes red', () => {
  it('finds the spec files it claims to have scanned', () => {
    // A glob that silently matches nothing turns every guard below into a pass. Seen once already
    // (#105's fixture guard), so the scan's own coverage is asserted before its conclusions are trusted.
    expect(specFiles.length, 'no e2e specs found — this guard is scanning nothing').toBeGreaterThan(10);
    expect(specFiles).toContain('sla.spec.ts');
    expect(specFiles).toContain('a11y.spec.ts');
  });

  it('records a trace on failure rather than on a retry that never happens', () => {
    expect(config).toContain('trace: "retain-on-failure"');
    // The specific dead setting, named so reverting to it is a decision and not a typo.
    expect(config).not.toContain('on-first-retry');
    expect(config).not.toContain('on-all-retries');
  });

  it('keeps retries off, so a red gate still means red', () => {
    // `retries` anywhere would make the old trace setting live again *and* turn flakes into greens.
    expect(config).not.toMatch(/\bretries\s*:/);
    for (const [name, raw] of specSources) {
      const source = stripComments(raw);
      expect(source, `${name} sets retries; a flake would now report as green`).not.toMatch(
        /\bretries\s*:|test\.describe\.configure\(\{[^}]*retries/,
      );
    }
  });

  it('writes a machine-readable duration per spec, so a near-miss is measurable', () => {
    expect(config).toMatch(/"json",\s*\{\s*outputFile:\s*"test-results\/playwright\.json"/);
    // `list` stays: a human watching a run should still see it. The JSON is for the run nobody watched.
    expect(config).toContain('"list"');
  });
});
