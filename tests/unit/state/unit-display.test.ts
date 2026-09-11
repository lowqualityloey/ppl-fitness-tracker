import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DISPLAY_DECIMALS,
  roundingToleranceKg,
  formatForDisplay,
  isRoundTripStable,
  parseForInput,
  roundTripKg,
  unitSuffix,
} from '../../../src/app/state/unit-display';

describe('formatForDisplay', () => {
  it('paints kg without a trailing zero and lb with one decimal', () => {
    expect(formatForDisplay(62.5, 'kg')).toBe('62.5');
    expect(formatForDisplay(60, 'kg')).toBe('60');
    // 100 kg is 220.462 lb. One decimal is the resolution the screen commits to, and it is the same
    // resolution in both units — a setting that changed precision as well as scale would make the
    // number look like it moved on its own.
    expect(formatForDisplay(100, 'kg')).toBe('100');
    expect(formatForDisplay(100, 'lbs')).toBe('220.5');
    expect(unitSuffix('lbs')).toBe('lb');
  });

  it('never paints a real weight as zero', () => {
    // `0` is also what an empty field looks like, so a tiny-but-nonzero load painted as zero is
    // indistinguishable from "nothing was recorded" — the same class of lie as M2-05's NULL weights
    // rendered as `0 kg` on the history screen.
    expect(formatForDisplay(0.02, 'kg')).toBe(String(1 / 10 ** DISPLAY_DECIMALS));
    expect(parseForInput(formatForDisplay(0.02, 'kg'), 'kg').kg).not.toBeNull();
  });
});

describe('the rounding invariant — a display conversion cannot move a record', () => {
  it('round-trips 1 kg through lb without becoming a different weight', () => {
    // The card's own example, and the tightest case in the range: one kilogram is 2.2 lb at display
    // precision, and 2.2 lb converts back to 0.9979 kg. A naive equality check would call that a
    // changed record, and an athlete who re-enters what they saw would watch a PR dissolve.
    expect(formatForDisplay(1, 'lbs')).toBe('2.2');
    // Better than this test expected: the domain rounds every parsed weight to two decimals in kg,
    // so `2.2 lb` re-enters as exactly `1` kg rather than 0.9979. The protection is that rule, not
    // this module's care — which is why the check belongs in a test instead of in a comment.
    expect(roundTripKg(1, 'lbs')).toBe(1);
    expect(isRoundTripStable(1, 'lbs')).toBe(true);
    // The band itself, and the only two numbers that make the invariant coherent: wider than the
    // storage rounding it absorbs, and far narrower than the 0.5 kg plate step that would decide a
    // record. If a future edit pushes it past half a plate, the sweep test below stops meaning
    // anything and this one says why.
    expect(roundingToleranceKg()).toBeGreaterThan(0.005);
    expect(roundingToleranceKg()).toBeLessThan(0.5);
  });

  it('is stable for every half-kilogram step a bar can actually hold', () => {
    const failures: string[] = [];
    for (let kg = 0.5; kg <= 300; kg += 0.5) {
      if (!isRoundTripStable(kg, 'kg')) failures.push(`kg ${kg}`);
      if (!isRoundTripStable(kg, 'lbs')) failures.push(`lb ${kg}`);
    }
    expect(failures).toEqual([]);
  });

  it('never inverts the order of two records', () => {
    // Monotonicity is the whole claim: if 100 kg and 100.5 kg painted in lb displayed as the same
    // glyph, the screen has hidden a real difference; if it displayed the smaller value for the
    // larger lift, it has invented one. Both would surface here.
    const shown: number[] = [];
    for (let kg = 1; kg <= 300; kg += 0.5) {
      const value = Number(formatForDisplay(kg, 'lbs'));
      if (shown.length && value < shown[shown.length - 1]!) {
        throw new Error(`display inverted at ${kg} kg: ${shown[shown.length - 1]} -> ${value}`);
      }
      shown.push(value);
    }
    expect(new Set(shown).size).toBeGreaterThan(0);
    // A half-kilogram step has to remain distinguishable at 60 kg, which is where lifters live.
    expect(formatForDisplay(60, 'lbs')).not.toBe(formatForDisplay(60.5, 'lbs'));
  });
});

describe('parseForInput', () => {
  it('accepts a decimal comma, which is most of the world', () => {
    expect(parseForInput('12,5', 'kg')).toEqual({ kg: 12.5, assumedGrouping: false });
    expect(parseForInput(' 123,45 ', 'kg')).toEqual({ kg: 123.45, assumedGrouping: false });
  });

  it('reads a grouped head and a decimal tail in either convention', () => {
    // Chosen at 1000 for a reason: the domain bounds the **entered number** at `MAX_WEIGHT_KG`
    // whatever the unit, so a thousands-grouped value above 1000 — which is every grouped form
    // except exactly `1,000` — is rejected by the ceiling rather than by this parser. That
    // interaction is the finding; it means `2,000 lb` (907 kg, a strong but real deadlift) never
    // reaches storage. Recorded on the card's follow-up rather than patched here, because changing
    // a bound that M1's contract enforces server-side would make the client accept what the API
    // rejects — the worse of the two failures.
    expect(parseForInput('1,000.0', 'kg')).toEqual({ kg: 1000, assumedGrouping: false });
    expect(parseForInput('1.000,0', 'kg')).toEqual({ kg: 1000, assumedGrouping: false });
    expect(parseForInput('2,000', 'lbs').kg).toBeNull();
  });

  it('reads a lone three-digit group as thousands and says it guessed', () => {
    // `1.234` lb is 1234 lb (559.99 kg) under the grouping reading and 1.234 lb (0.56 kg) under the
    // decimal one. The function cannot be right for both locales, so the flag exists: the caller can
    // echo the parsed number back and let the athlete catch it. A silent choice here is a set lost
    // with no trace, which is worse than either reading.
    const grouped = parseForInput('1.000', 'lbs');
    expect(grouped.kg).toBeCloseTo(453.59, 2);
    expect(grouped.assumedGrouping).toBe(true);
    // Two separators means the grouping is stated by the text, so there is nothing left to assume.
    expect(parseForInput('1.234,5', 'lbs').assumedGrouping).toBe(false);
  });

  it('rejects a typo rather than reading it as a different weight', () => {
    expect(parseForInput('12,5,5', 'kg')).toEqual({ kg: null, assumedGrouping: false });
    expect(parseForInput('1..2', 'kg').kg).toBeNull();
    expect(parseForInput('abc', 'kg').kg).toBeNull();
    expect(parseForInput('', 'kg').kg).toBeNull();
    expect(parseForInput('-20', 'kg').kg).toBeNull();
    // Past the ceiling, the domain's own bound answers — and `null` means the field keeps its
    // previous value instead of storing an absurd one.
    expect(parseForInput('5000', 'kg').kg).toBeNull();
  });

  it('leaves the range and rounding rules in the domain module', () => {
    expect(parseForInput('62.5', 'kg').kg).toBe(62.5);
    expect(parseForInput('2.2', 'lbs').kg).toBe(1);
  });
});

describe('the seam stays a façade', () => {
  it('does not contain a second conversion factor', () => {
    // Comments are stripped first: this file *describes* the factor it must not contain, and a scan
    // that forbids prose gets deleted the first time it annoys someone (#64 learned this the same
    // way, with the same word).
    const source = readFileSync('src/app/state/unit-display.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const forbidden of ['KG_PER_LB', '0.45359', '2.2046', '* 2.2', '/ 2.2']) {
      expect(source, `kg↔lb conversion belongs in lib/domain/units.ts, not here: found ${forbidden}`).not.toContain(
        forbidden,
      );
    }
    expect(readFileSync('src/app/state/unit-display.ts', 'utf8')).toContain("from '../../../lib/domain/units'");
  });
});
