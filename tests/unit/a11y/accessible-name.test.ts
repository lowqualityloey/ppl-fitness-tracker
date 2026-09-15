/**
 * M4-12 (#101): the stripper behind the zero-width-space name gate is enumerated, not
 * guessed (AC Scenario 3).
 *
 * No invisible literal appears in this file on purpose: every invisible case is built from
 * `INVISIBLE_NAME_CODEPOINTS`, so a wrong codepoint in the source under test fails here by
 * name rather than hiding in review. (The module once held U+2009 where U+200B belonged —
 * this suite is what would have caught it.)
 */
import { describe, expect, it } from 'vitest';

import {
  INVISIBLE_NAME_CODEPOINTS,
  INVISIBLE_NAME_PATTERN,
  scanForBlankAccessibleNames,
  stripInvisibleForName,
} from '../../e2e/accessible-name';

describe('stripInvisibleForName', () => {
  it.each(INVISIBLE_NAME_CODEPOINTS)('strips $name as sole content', ({ code }) => {
    expect(stripInvisibleForName(code)).toBe('');
  });

  it('strips a run mixing every enumerated codepoint', () => {
    const run = INVISIBLE_NAME_CODEPOINTS.map(({ code }) => code).join('');
    expect(stripInvisibleForName(run)).toBe('');
  });

  it('strips invisible padding around visible text', () => {
    const run = INVISIBLE_NAME_CODEPOINTS.map(({ code }) => code).join('');
    expect(stripInvisibleForName(`${run}Today${run}`)).toBe('Today');
  });

  // The gate only asks "is anything left" (`strip(name).length === 0`), so internal
  // spaces are stripped too — the card says "strip all zero-width and whitespace
  // codepoints". The property the gate needs is non-blankness, asserted here; exact
  // identity holds only for single-word names, asserted above it.
  it.each(['Today', 'Close'])('leaves single-word name %p byte-identical', (name) => {
    expect(stripInvisibleForName(name)).toBe(name);
  });

  it.each(['Today', 'Older workouts', 'Email address', 'Close', 'Not logged'])(
    'leaves visible name %p non-blank',
    (name) => {
      expect(stripInvisibleForName(name).length).toBeGreaterThan(0);
    },
  );
});

describe('INVISIBLE_NAME_PATTERN', () => {
  it('compiles as a global regex', () => {
    expect(() => new RegExp(INVISIBLE_NAME_PATTERN, 'g')).not.toThrow();
  });

  it('covers the whole enumerated family through the pattern alone', () => {
    const re = new RegExp(INVISIBLE_NAME_PATTERN, 'g');
    for (const { code, name } of INVISIBLE_NAME_CODEPOINTS) {
      expect(code.replace(re, ''), name).toBe('');
    }
  });
});

describe('scanForBlankAccessibleNames serialization invariant', () => {
  // The scan runs inside `page.evaluate`, which serializes the function *alone*. A closure
  // over any module binding fails at runtime with an error that names nothing about the
  // cause — so the unit suite forbids the reference statically instead.
  it('references no module-scope binding', () => {
    const source = scanForBlankAccessibleNames.toString();
    expect(source).not.toContain('INVISIBLE_NAME_PATTERN');
    expect(source).not.toContain('stripInvisibleForName');
  });

  it('builds its regex from its parameter', () => {
    expect(scanForBlankAccessibleNames.toString()).toContain('invisiblePattern');
  });
});
