import { describe, expect, it } from 'vitest';
import { formatWeight, kgToDisplay } from '../../../lib/domain/units';

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
