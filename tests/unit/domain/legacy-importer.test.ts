import { describe, expect, it } from 'vitest';
import {
  buildImportReport,
  legacyClientId,
  legacySlotToOrderIndex,
  legacySourceFingerprint,
  planLegacyImport,
  type LegacyImportPlan,
} from '../../../lib/domain/import/legacy-importer.js';
import { LegacyImportValidationError } from '../../../lib/domain/import/types.js';
import type { LegacyImportRequest } from '../../../lib/contracts/import.js';

/**
 * M2-05 unit layer: the honesty rules of the legacy importer, with no database.
 *
 * These are the failures that would produce *wrong user history* rather than an
 * error, which is why they are pinned here and not only at the HTTP edge: an
 * off-by-one in exercise slots, a phantom session minted from a page visit, a
 * real payload rejected because the browser stored a collapsed key under `""`.
 */

const IMPORTED_AT = new Date('2026-09-11T12:00:00.000Z');

function pushPayload(overrides: {
  sets?: Record<string, boolean>;
  warmup?: Record<string, boolean>;
  currentPhase?: string;
  timestamp?: number | null;
} = {}): string {
  return JSON.stringify({
    currentPhase: overrides.currentPhase ?? 'main-workout',
    state: {
      mainWorkoutSets: overrides.sets ?? { 'ex1-set1': true, 'ex1-set2': true, 'ex6-set2': true },
      warmupExercises: overrides.warmup ?? { 'cardio-done': true },
      phaseCompletion: { 'pre-workout': false, 'warm-up': false },
    },
    ...(overrides.timestamp === undefined
      ? { timestamp: Date.parse('2026-08-01T09:00:00.000Z') }
      : overrides.timestamp === null
        ? {}
        : { timestamp: overrides.timestamp }),
  });
}

function legsPayload(sets: Record<string, boolean> = { 'ex2-set1': true }): string {
  return JSON.stringify({
    currentPhase: 'main-workout',
    state: { mainWorkoutSets: sets },
    checkboxStates: sets,
    timerStates: { cardio: { seconds: 120, isRunning: false } },
  });
}

function pullPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    currentPhase: 'workout',
    completedSets: 2,
    completedExercises: 1,
    workoutStartTime: Date.parse('2026-07-15T18:00:00.000Z'),
    cardioTimeLeft: 300,
    cooldownTimeLeft: 600,
    checkboxStates: { meal: true, hydration: false },
    stretchStates: { '0': true },
    ...overrides,
  });
}

function planOf(raw: LegacyImportRequest): LegacyImportPlan {
  return planLegacyImport(raw, IMPORTED_AT);
}

function planForDay(plan: LegacyImportPlan, slug: 'push' | 'legs' | 'pull') {
  const found = plan.plans.find((candidate) => candidate.daySlug === slug);
  if (!found) throw new Error(`No ${slug} plan was produced.`);
  return found;
}

function statusOf(plan: LegacyImportPlan, key: string): string | undefined {
  return plan.outcomes.find((outcome) => outcome.key === key)?.status;
}

describe('legacy exercise slot mapping', () => {
  it('converts the legacy 1-based exercise number to 0-based content order', () => {
    // `ex1`..`ex6` come from `for (let i = 1; i <= 6; i++)` in the legacy app;
    // `db/seed/exercises.ts` writes order_index starting at 0. Getting this wrong
    // silently puts every imported set on the neighbouring exercise.
    expect(legacySlotToOrderIndex(1)).toBe(0);
    expect(legacySlotToOrderIndex(6)).toBe(5);
  });

  it('parses set keys into 0-based set indexes, keeping only checked boxes', () => {
    const plan = planOf({ pushWorkoutProgress: pushPayload({ sets: {
      'ex1-set1': true,
      'ex1-set2': false,
      'ex6-set2': true,
    } }) });

    const push = planForDay(plan, 'push');
    expect(push.sets).toEqual([
      { slot: 1, setIndex: 0 },
      { slot: 6, setIndex: 1 },
    ]);
  });

  it('drops sets whose exercise slot has no seeded counterpart and reports it', () => {
    const plan = planOf({ pushWorkoutProgress: pushPayload({ sets: {
      'ex1-set1': true,
      'ex7-set1': true,
      'ex12-set3': true,
    } }) });

    expect(planForDay(plan, 'push').unresolvableSlots).toEqual([7, 12]);
    expect(plan.fieldsNotRecovered.join('\n')).toMatch(/exercise 7, 12/);
  });
});

describe('per-key isolation', () => {
  it('imports valid siblings when another key is malformed', () => {
    const plan = planOf({
      pushWorkoutProgress: pushPayload(),
      legsWorkoutProgress: '{malformed-json',
    });

    expect(statusOf(plan, 'pushWorkoutProgress')).toBe('planned');
    expect(statusOf(plan, 'legsWorkoutProgress')).toBe('malformed');
    expect(plan.plans).toHaveLength(1);
  });

  it('names the offending path without echoing the stored value', () => {
    // A sibling is supplied because a request whose only key is broken is
    // rejected outright; the per-key detail is what this pins.
    const plan = planOf({
      pushWorkoutProgress: pushPayload(),
      legsWorkoutProgress: JSON.stringify({ currentPhase: 'secret-phase-value' }),
    });
    const detail = plan.outcomes.find((outcome) => outcome.key === 'legsWorkoutProgress')?.detail ?? '';

    expect(detail).toContain('state');
    expect(detail).not.toContain('secret-phase-value');
  });

  it('rejects a request with nothing importable rather than writing an empty batch', () => {
    expect(() => planOf({ userStats: '{"streak":9}' })).toThrow(LegacyImportValidationError);
    expect(() => planOf({ pushWorkoutProgress: 'not json at all' })).toThrow(LegacyImportValidationError);
  });
});

describe('pull day collapsed checkbox key', () => {
  it('accepts a real browser payload whose set boxes collapsed under the empty key', () => {
    // pull-day-workout/app.js:717-721 renders set checkboxes with no id, so
    // :1393 keys all 17 of them under "". z.record(z.string().min(1), ...) would
    // otherwise reject the whole payload and real history would read as garbage.
    const plan = planOf({ pullDayProgress: pullPayload({ checkboxStates: { '': true, meal: false } }) });

    expect(statusOf(plan, 'pullDayProgress')).toBe('planned');
    const pull = planForDay(plan, 'pull');
    expect(pull.sets).toEqual([]);
    expect(pull.aggregateOnly).toEqual({ completedSets: 2, completedExercises: 1 });
    expect(plan.warnings.join('\n')).toContain('""');
  });

  it('also tolerates the "undefined" spelling recorded in the RFC', () => {
    const plan = planOf({ pullDayProgress: pullPayload({ checkboxStates: { undefined: true } }) });

    expect(statusOf(plan, 'pullDayProgress')).toBe('planned');
    expect(plan.warnings.join('\n')).toContain('"undefined"');
  });

  it('reports the per-set loss explicitly instead of leaving it implied', () => {
    const plan = planOf({ pullDayProgress: pullPayload() });

    expect(plan.warnings.join('\n')).toMatch(/aggregate counts only/);
    expect(plan.warnings.join('\n')).toMatch(/2 completed sets across 1 exercises/);
    expect(plan.fieldsNotRecovered.join('\n')).toMatch(/per-set completion/);
  });
});

describe('no phantom sessions', () => {
  it('skips a push payload that records nothing but a page visit', () => {
    const plan = planOf({
      pushWorkoutProgress: pushPayload({
        sets: {},
        warmup: {},
        currentPhase: 'pre-workout',
        timestamp: null,
      }),
      legsWorkoutProgress: legsPayload(),
    });

    expect(statusOf(plan, 'pushWorkoutProgress')).toBe('empty');
    expect(plan.plans).toHaveLength(1);
    expect(plan.fieldsNotRecovered.join('\n')).toMatch(/recorded no completed items/);
  });

  it('rejects a batch where every payload is only a page visit', () => {
    expect(() => planOf({
      pushWorkoutProgress: pushPayload({ sets: {}, warmup: {}, currentPhase: 'pre-workout', timestamp: null }),
    })).toThrow(LegacyImportValidationError);
  });

  it('skips a pull payload with zero counts and no start time', () => {
    const plan = planOf({
      pullDayProgress: pullPayload({ completedSets: 0, completedExercises: 0, workoutStartTime: null }),
      pushWorkoutProgress: pushPayload(),
    });

    expect(statusOf(plan, 'pullDayProgress')).toBe('empty');
    expect(plan.plans).toHaveLength(1);
  });

  it('treats a ticked pre-workout checkbox as insufficient evidence of a workout', () => {
    const plan = planOf({
      pullDayProgress: pullPayload({
        completedSets: 0,
        completedExercises: 0,
        workoutStartTime: null,
        checkboxStates: { meal: true, hydration: true },
      }),
      pushWorkoutProgress: pushPayload(),
    });

    expect(statusOf(plan, 'pullDayProgress')).toBe('empty');
  });

  it('keeps push day whose only signal is the completion phase, which the legacy app persists', () => {
    const plan = planOf({
      pushWorkoutProgress: pushPayload({ sets: {}, warmup: {}, currentPhase: 'completion' }),
    });

    expect(statusOf(plan, 'pushWorkoutProgress')).toBe('planned');
  });
});

describe('date confidence', () => {
  it('uses the stored push timestamp when present', () => {
    const plan = planOf({ pushWorkoutProgress: pushPayload() });

    expect(planForDay(plan, 'push').localDate).toBe('2026-08-01');
    expect(planForDay(plan, 'push').dateConfidence).toBe('high');
    expect(plan.dateConfidence).toBe('high');
  });

  it('falls back to the import date at low confidence when the key stored none', () => {
    const plan = planOf({ legsWorkoutProgress: legsPayload() });
    const legs = planForDay(plan, 'legs');

    expect(legs.localDate).toBe('2026-09-11');
    expect(legs.dateConfidence).toBe('low');
    // One low-confidence session cannot let the batch claim high confidence.
    expect(plan.dateConfidence).toBe('low');
    expect(plan.fieldsNotRecovered.join('\n')).toMatch(/legs day: the legacy app stored no workout date/);
  });
});

describe('source fingerprint', () => {
  it('is stable across key insertion order, so a replay cannot fork a batch', () => {
    const first = planOf({
      pushWorkoutProgress: pushPayload(),
      pullDayProgress: pullPayload(),
    });
    const reordered = planOf({
      pullDayProgress: pullPayload(),
      pushWorkoutProgress: pushPayload(),
    });

    expect(first.fingerprint).toBe(reordered.fingerprint);
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any stored value changes', () => {
    const baseline = planOf({ pushWorkoutProgress: pushPayload() });
    const changed = planOf({ pushWorkoutProgress: pushPayload({ sets: { 'ex1-set1': true } }) });

    expect(baseline.fingerprint).not.toBe(changed.fingerprint);
  });
});

describe('derived session identity', () => {
  it('produces the same client id for the same batch and day, and a different one per day', () => {
    const fingerprint = legacySourceFingerprint({ pushWorkoutProgress: pushPayload() });
    const again = legacyClientId(fingerprint, 'push');

    expect(again).toBe(legacyClientId(fingerprint, 'push'));
    expect(again).not.toBe(legacyClientId(fingerprint, 'legs'));
    expect(again).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('userStats', () => {
  it('is accepted, ignored, and explained', () => {
    const plan = planOf({
      pushWorkoutProgress: pushPayload(),
      userStats: JSON.stringify({ streak: 99, hours: 42 }),
    });

    expect(statusOf(plan, 'userStats')).toBe('ignored');
    expect(plan.plans).toHaveLength(1);
    expect(plan.fieldsNotRecovered.join('\n')).toMatch(/userStats: dashboard figures were generated at render time/);
  });
});

describe('report assembly', () => {
  it('counts what was written, not what was asked for', () => {
    const plan = planOf({
      pushWorkoutProgress: pushPayload(),
      legsWorkoutProgress: legsPayload(),
    });

    expect(plan.plans).toHaveLength(2);
    const report = buildImportReport(plan, { sessionsInserted: 1, setsInserted: 3 });

    expect(report.sessionsCreated).toBe(1);
    expect(report.setsRecovered).toBe(3);
    expect(report.fieldsNotRecovered.join('\n')).toMatch(/1 planned session\(s\) could not be written/);
  });

  it('never reports load data it could not recover', () => {
    const plan = planOf({ pushWorkoutProgress: pushPayload() });
    const report = buildImportReport(plan, { sessionsInserted: 1, setsInserted: 3 });

    expect(report.fieldsNotRecovered.join('\n')).toMatch(/weight, reps, RPE/);
    expect(JSON.stringify(report)).not.toMatch(/\d+(\.\d+)?\s?kg/);
  });
});
