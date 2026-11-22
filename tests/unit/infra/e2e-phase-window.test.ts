/**
 * #100 — the phase-label fence is a property of the code, so it is tested as one.
 *
 * Three things had to stop being true by accident, and each is asserted here rather than agreed to in a
 * code review:
 *
 * 1. **The window is derived, not remembered.** An assertion on a poll-delivered server label needs a
 *    window that accounts for the poll. If someone edits `PHASE_LABEL_WINDOW_MS` to a number that is no
 *    longer tied to `POLL_INTERVAL_VISIBLE_MS`, the fence silently becomes the old flake again.
 * 2. **The labels the tests assert are the labels the app renders.** `PHASE_LABEL` lives in a client
 *    component (`src/app/session/[id]/runner.tsx:75`) and is not exported, so `expectPhase`'s union is
 *    hand-written. Hand-written lists drift. This makes the drift a red test.
 * 3. **Nobody bypasses the helper.** The whole point of `expectPhase` is that a bare
 *    `toContainText('Resting')` carries Playwright's 5 000 ms default — shorter than the propagation path
 *    it waits on. One such line reintroduced is one incident reintroduced.
 *
 * Provoked red, each on exactly one test: window set to `1_000`; a site rewritten back to a bare
 * `expect(...).toContainText('Resting')`; and `'Stretching'` removed from the union while the app still
 * renders it. All three restored before commit.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POLL_INTERVAL_VISIBLE_MS } from '../../../src/app/state/sync-engine';
import { PHASE_LABEL_WINDOW_MS } from '../../e2e/runner-fixtures';

const ROOT = join(__dirname, '..', '..', '..');
const E2E_DIR = join(ROOT, 'tests', 'e2e');

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<!:)\/\/[^\n]*/g, '');
}

/** The app's own label table, read out of the client component that owns it. */
function appPhaseLabels(): string[] {
  const runner = readFileSync(join(ROOT, 'src', 'app', 'session', '[id]', 'runner.tsx'), 'utf8');
  const block = runner.match(/const PHASE_LABEL: Record<string, string> = \{([\s\S]*?)\};/);
  if (!block) {
    throw new Error(
      'PHASE_LABEL not found in runner.tsx. This guard is not "passing" — it has lost its subject, ' +
        'and the label list it protects would now drift silently.',
    );
  }
  // `pre_workout: 'Warming up'` — the keys are unquoted identifiers, so the first version of this
  // parser, which looked for a quoted key, returned an empty list and the guard below would have
  // "passed" against nothing. A scanner that silently finds zero subjects is the failure mode this
  // file's own third rule exists to catch.
  const body = block[1] ?? '';
  const labels = [...body.matchAll(/\w+\s*:\s*'([^']+)'/g)]
    .map(([, label]) => label)
    .filter((label): label is string => typeof label === 'string');
  if (labels.length === 0) throw new Error('PHASE_LABEL block found but parsed to no labels.');
  return labels;
}

const specFiles = readdirSync(E2E_DIR).filter((name) => name.endsWith('.spec.ts'));
const helperSources = [
  'tests/e2e/runner-fixtures.ts',
  ...specFiles.map((name) => join('tests/e2e', name)),
].map((rel) => [rel, stripComments(readFileSync(join(ROOT, rel), 'utf8'))] as const);

describe('#100: the phase-label fence holds as code, not as intent', () => {
  it('scans the files it claims to have scanned', () => {
    // Asserted first: an empty glob would turn every guard below into a silent pass.
    expect(specFiles.length).toBeGreaterThan(10);
    expect(helperSources.length).toBe(specFiles.length + 1);
    for (const [, source] of helperSources) expect(source.length).toBeGreaterThan(0);
  });

  it('allows a label at least two poll cycles plus a refetch', () => {
    expect(POLL_INTERVAL_VISIBLE_MS).toBe(4_000);
    expect(PHASE_LABEL_WINDOW_MS).toBeGreaterThanOrEqual(2 * POLL_INTERVAL_VISIBLE_MS);
  });

  it('asserts exactly the labels the app renders, no more and no fewer', () => {
    // This parser's anchors are lines, so a CRLF checkout (Windows with `core.autocrlf=true`)
    // makes `[^\n]+` swallow the `\r` and run past the union. Normalize first; an LF checkout
    // is byte-identical after this.
    const helper = readFileSync(join(ROOT, 'tests', 'e2e', 'runner-fixtures.ts'), 'utf8')
      .replace(/\r\n/g, '\n');
    const union = helper.match(/label:\s*([^\n]+(?:\n[^\n]+)*?),\s*\n\s*\)\: Promise/);
    if (!union) {
      throw new Error(
        'expectPhase label union not found. It did not "pass" — the guard lost its subject, so the ' +
          'comparison below would have run against an empty list.',
      );
    }
    const asserted = [...(union[1] ?? '').matchAll(/'([^']+)'/g)]
      .map(([, label]) => label)
      .filter((label): label is string => typeof label === 'string')
      .sort();
    expect(asserted).toEqual(appPhaseLabels().sort());
  });

  it('keeps every server-truth label assertion inside the helper', () => {
    const bypassing: string[] = [];
    for (const [file, source] of helperSources) {
      // String literals only. `a11y.spec.ts:243` asserts that the subtitle carries *one of* the phase
      // words — that is the "colour is not the only carrier" rule, not a transition wait, and routing it
      // through `expectPhase` would assert a single expected label it has no business picking. A bare
      // `toContainText('Resting')`, which is the regression being fenced, is still caught.
      const bare = source.match(
        /expect\(\s*\w+\.getByTestId\('session-subtitle'\)\s*\)\s*\.toContainText\(\s*'/g,
      );
      if (bare && !(file.endsWith('runner-fixtures.ts') && source.includes('export async function expectPhase'))) {
        bypassing.push(`${file}: ${bare.length}`);
      } else if (bare) {
        // Inside the helper, the one occurrence *is* the helper's own body. Anything more is a bypass.
        const body = source.match(/export async function expectPhase[\s\S]*?\n\}/g) ?? [];
        const outsideHelper = bare.length - body.length;
        if (outsideHelper > 0) bypassing.push(`${file}: ${outsideHelper} outside expectPhase`);
      }
    }
    expect(bypassing, 'a phase label asserted without the poll-derived window').toEqual([]);
  });
});
