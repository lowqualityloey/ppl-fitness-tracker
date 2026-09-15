/**
 * M4-12 (#101): structural gate against zero-width-space accessible names.
 *
 * Provenance: `docs/tests/2026-09-11-m3-verification-audit.md` entry 11 — replacing the
 * "Today" link's text on `/history` with U+200B measured Lighthouse accessibility `100` and
 * passed axe. A name that renders as nothing is a violation only in the eye of the user, so
 * neither score-based gate can see this class. This module is the layer they cannot see.
 *
 * Two halves, one pattern source:
 * - `stripInvisibleForName` / `INVISIBLE_NAME_PATTERN`: pure, unit-tested in
 *   `tests/unit/a11y/accessible-name.test.ts` (table-driven: every enumerated codepoint
 *   must strip, so dropping one from the pattern fails the unit suite first).
 * - `scanForBlankAccessibleNames`: the in-page DOM walk, executed via
 *   `page.evaluate(scanForBlankAccessibleNames, INVISIBLE_NAME_PATTERN)`.
 *
 * Serialization invariant: the scan takes the pattern as a *parameter* and builds its
 * `RegExp` from that parameter. It must never close over `INVISIBLE_NAME_PATTERN` (or any
 * other module binding) — Playwright serializes the function alone, and a closure reference
 * fails at runtime with an error that names nothing about the cause. A unit test pins this.
 *
 * Every invisible codepoint below is written as an ASCII `\uXXXX` escape, never as a
 * literal: a literal zero-width character is unauditable in review (this file once held
 * U+2009 where U+200B was meant, and no reader could see it).
 */

export const INVISIBLE_NAME_PATTERN = '[\\u200B-\\u200D\\uFEFF\\s]';

/**
 * The enumerated invisible family, kept as data so the unit suite can assert each member
 * strips. U+200B/U+200C/U+200D are ZWSP/ZWNJ/ZWJ, U+FEFF is the zero-width no-break space,
 * and plain whitespace covers spaces, tabs, and newlines. Anything outside this set that
 * renders as nothing (e.g. U+2060 word joiner) is deliberately *not* claimed — extending
 * the family is a card-sized decision with its own injection, not a drive-by edit here.
 */
export const INVISIBLE_NAME_CODEPOINTS: ReadonlyArray<{ code: string; name: string }> = [
  { code: '\u200B', name: 'U+200B ZERO WIDTH SPACE' },
  { code: '\u200C', name: 'U+200C ZERO WIDTH NON-JOINER' },
  { code: '\u200D', name: 'U+200D ZERO WIDTH JOINER' },
  { code: '\uFEFF', name: 'U+FEFF ZERO WIDTH NO-BREAK SPACE' },
  { code: ' \t\n\r', name: 'plain whitespace' },
];

export function stripInvisibleForName(raw: string): string {
  return raw.replace(new RegExp(INVISIBLE_NAME_PATTERN, 'g'), '');
}

export interface BlankNameViolation {
  tag: string;
  id: string | null;
  nameSource: 'aria-labelledby' | 'aria-label' | 'label' | 'text';
  snippet: string;
}

export function scanForBlankAccessibleNames(invisiblePattern: string): BlankNameViolation[] {
  const strip = (raw: string): string => raw.replace(new RegExp(invisiblePattern, 'g'), '');
  const violations: BlankNameViolation[] = [];
  const candidates = document.querySelectorAll(
    'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"]):not(:disabled)',
  );
  candidates.forEach((el) => {
    if (el.hasAttribute('disabled')) return;
    let name = '';
    let nameSource: BlankNameViolation['nameSource'] = 'text';
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy !== null) {
      nameSource = 'aria-labelledby';
      name = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ');
    } else if (el.hasAttribute('aria-label')) {
      nameSource = 'aria-label';
      name = el.getAttribute('aria-label') ?? '';
    } else if (
      'labels' in el &&
      el.labels instanceof NodeList &&
      el.labels.length > 0
    ) {
      // Deliberate extension beyond the card's shorthand (text + aria-label +
      // aria-labelledby): the sign-in email input is named by `<label for>`, which is the
      // standard accessible-name step the card omitted. Without it the shipped app fails
      // its own gate — Scenario 2 ("legitimate names survive") requires this branch.
      nameSource = 'label';
      name = Array.from(el.labels, (label) => label.textContent ?? '').join(' ');
    } else {
      name = el.textContent ?? '';
    }
    if (strip(name).length === 0) {
      violations.push({
        tag: el.tagName.toLowerCase(),
        id: el.getAttribute('id'),
        nameSource,
        snippet: (el.outerHTML ?? '').slice(0, 160),
      });
    }
  });
  return violations;
}
