import { describe, expect, it } from 'vitest';
import {
  MAX_WEIGHT_KG,
  formatWeight,
  kgToDisplay,
  parseReps,
  parseWeightToKg,
} from '../../../lib/domain/units';
import { WeightKgSchema } from '../../../lib/contracts/common';

/**
 * ADR-0005 says kilograms are canonical and `preferred_unit` is display-only. That
 * is only verifiable at the display edge, which is what this file pins down: the
 * exact rounding a user sees, and the guarantee that a kg preference changes
 * nothing about the number.
 */
describe('display-unit conversion (ADR-0005)', () => {
  it('leaves kilograms untouched', () => {
    expect(kgToDisplay(62.5, 'kg')).toBe(62.5);
    expect(formatWeight(62.5, 'kg')).toBe('62.5 kg');
  });

  it('converts with the exact definition of a pound, to one decimal', () => {
    // 100 / 0.45359237 = 220.46226… → 220.5, matching the legacy app's precision.
    expect(kgToDisplay(100, 'lbs')).toBe(220.5);
    expect(formatWeight(100, 'lbs')).toBe('220.5 lb');
  });

  it('prints whole kilograms without a trailing zero', () => {
    // Stored as numeric(6,2), so the raw value is "60.00"; the screen says 60.
    expect(formatWeight(60, 'kg')).toBe('60 kg');
    expect(formatWeight(60.25, 'kg')).toBe('60.25 kg');
    expect(formatWeight(60.2, 'kg')).toBe('60.2 kg');
  });

  it('distinguishes "no weight recorded" from zero', () => {
    // session_sets.weight_kg is nullable for bodyweight and timed movements. A
    // dash says "not applicable"; "0 kg" would say the user lifted nothing, and
    // a reader scanning history cannot tell those apart after the fact.
    expect(formatWeight(null, 'kg')).toBe('—');
    expect(formatWeight(null, 'lbs')).toBe('—');
    expect(formatWeight(0, 'kg')).toBe('0 kg');
  });

  it('is not reversible, on purpose', () => {
    // Rounding to one decimal loses information, so lbs -> kg cannot round-trip
    // exactly: 62.5 kg displays as 137.8 lb, which is 62.505 kg. That asymmetry is
    // the argument against ever writing a converted value back to storage.
    const asLbs = kgToDisplay(62.5, 'lbs');
    expect(asLbs).toBe(137.8);
    expect(Number((asLbs * 0.45359237).toFixed(4))).not.toBe(62.5);
    expect(Number((asLbs * 0.45359237).toFixed(4))).toBe(62.505);
  });
});

describe('parseWeightToKg — ADR-0005 on the way in', () => {
  it('stores kilograms unchanged', () => {
    expect(parseWeightToKg('80', 'kg')).toBe(80);
    expect(parseWeightToKg(' 80.5 ', 'kg')).toBe(80.5);
  });

  it('converts a pounds entry to canonical kg before anything can store it', () => {
    // The failure this prevents is silent and permanent: storing the *typed number*
    // under a kg column means a 220 lb bench becomes 220 kg, and no later read can
    // tell the two apart.
    expect(parseWeightToKg('220', 'lbs')).toBe(99.79);
  });

  it('accepts a comma decimal separator', () => {
    expect(parseWeightToKg('80,5', 'kg')).toBe(80.5);
  });

  it('returns null for empty and unparseable input rather than zero', () => {
    // Zero is a value the user chose. Null is the absence they left. Collapsing them
    // would log a 0 kg set from a blank field.
    expect(parseWeightToKg('', 'kg')).toBeNull();
    expect(parseWeightToKg('   ', 'kg')).toBeNull();
    expect(parseWeightToKg('abc', 'kg')).toBeNull();
    expect(parseWeightToKg('-5', 'kg')).toBeNull();
  });

  it('refuses to clamp out-of-range input into a number the user never entered', () => {
    expect(parseWeightToKg(String(MAX_WEIGHT_KG + 1), 'kg')).toBeNull();
    expect(parseWeightToKg('9000', 'lbs')).toBeNull();
  });

  it('rounds to the stored precision so the contract can accept it', () => {
    // `WeightKgSchema` is `multipleOf(0.01)` against `numeric(6,2)`. An unrounded
    // lbs→kg product can be rejected by the contract on the way to the database,
    // which is the same class of bug as writing the display value straight through.
    for (const input of ['1', '7', '220.5', '0.005', '999.999']) {
      const kg = parseWeightToKg(input, 'lbs');
      expect(kg).not.toBeNull();
      expect(WeightKgSchema.safeParse(kg).success, `${input} lb -> ${kg} kg`).toBe(true);
    }
  });

  it('does not survive a full round trip through pounds, which is why the unit is display-only', () => {
    // Documented asymmetry rather than a bug to hide. 100 kg prints as "220.5 lb"
    // (one decimal, for display) and parses back as **100.02 kg** — the display
    // rounding is not invertible. This is why ADR-0005 makes the preference a rendering
    // concern only: a client that re-derived stored values from displayed ones would
    // drift a workout two hundredths of a kilo per edit, forever.
    expect(formatWeight(100, 'lbs')).toBe('220.5 lb');
    expect(parseWeightToKg('220.5', 'lbs')).toBe(100.02);
  });
});

describe('parseReps', () => {
  it('accepts integers and rejects everything fractional', () => {
    expect(parseReps('8')).toBe(8);
    expect(parseReps('0')).toBe(0);
    expect(parseReps('8.5')).toBeNull();
    expect(parseReps('')).toBeNull();
    expect(parseReps('-3')).toBeNull();
  });
});
