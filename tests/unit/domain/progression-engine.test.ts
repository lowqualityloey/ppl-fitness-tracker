import { describe, expect, it } from 'vitest';
import {
  MAX_PROGRESSABLE_E1RM,
  ProgressionEngine,
  calculateE1rm,
} from '../../../lib/domain/progression/progression-engine.js';
import { ProgressionValidationError, type PersonalRecordValue, type ProgressionSet, type ProgressionStore } from '../../../lib/domain/progression/types.js';

const timestamp = new Date('2028-03-01T12:00:00.000Z');

function set(overrides: Partial<ProgressionSet> = {}): ProgressionSet {
  return {
    sessionId: '11111111-1111-4111-8111-111111111111',
    setIndex: 0,
    isCompleted: true,
    weightKg: 60,
    reps: 8,
    clientTs: timestamp,
    ...overrides,
  };
}

function storeWith(
  sets: ProgressionSet[],
  current: PersonalRecordValue | null = null,
): { store: ProgressionStore; state: PersonalRecordValue | null; deleted: boolean } {
  let state = current;
  let deleted = false;
  const store: ProgressionStore = {
    listSets: async () => sets,
    lockPersonalRecord: async () => state,
    insertPersonalRecordIfAbsent: async (record) => {
      if (state) return false;
      state = record;
      return true;
    },
    replacePersonalRecord: async (record) => {
      state = record;
    },
    deletePersonalRecord: async () => {
      state = null;
      deleted = true;
    },
  };
  return {
    store,
    get state() {
      return state;
    },
    get deleted() {
      return deleted;
    },
  };
}

describe('ProgressionEngine', () => {
  it.each([
    [{ isCompleted: true, weightKg: 60, reps: 8 }, 76],
    [{ isCompleted: true, weightKg: 60.5, reps: 8 }, 76.63],
    [{ isCompleted: false, weightKg: 60, reps: 8 }, null],
    [{ isCompleted: true, weightKg: null, reps: 8 }, null],
    [{ isCompleted: true, weightKg: 60, reps: null }, null],
    [{ isCompleted: true, weightKg: 0, reps: 8 }, null],
    [{ isCompleted: true, weightKg: 60, reps: 0 }, null],
  ] as const)('calculates the documented Epley/null/zero policy for %o', (input, expected) => {
    expect(calculateE1rm(input)).toBe(expected);
  });

  it.each([
    { isCompleted: true, weightKg: -1, reps: 8 },
    { isCompleted: true, weightKg: 1000.01, reps: 8 },
    { isCompleted: true, weightKg: Number.NaN, reps: 8 },
    { isCompleted: true, weightKg: 60, reps: 8.5 },
    { isCompleted: true, weightKg: 60, reps: 1001 },
    { isCompleted: true, weightKg: 1000, reps: 1000 },
  ])('rejects invalid or unrepresentable progression inputs: %o', (input) => {
    expect(() => calculateE1rm(input)).toThrow(ProgressionValidationError);
  });

  it('materializes the highest completed set with deterministic equal-value ties', async () => {
    const later = new Date('2028-03-01T13:00:00.000Z');
    const fixture = storeWith([
      set({ sessionId: '33333333-3333-4333-8333-333333333333', weightKg: 60, reps: 8 }),
      set({ sessionId: '22222222-2222-4222-8222-222222222222', weightKg: 70, reps: 5 }),
      set({ sessionId: '44444444-4444-4444-8444-444444444444', weightKg: 70, reps: 5, clientTs: later }),
    ]);

    const record = await new ProgressionEngine(fixture.store)
      .materializePersonalRecord('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    expect(record).toEqual({
      exerciseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      bestE1rm: 81.67,
      achievedAt: later,
      sessionId: '44444444-4444-4444-8444-444444444444',
    });
    expect(fixture.state).toEqual(record);
  });

  it('keeps a higher existing record for a lower candidate and recomputes after an edit-down', async () => {
    const exerciseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const high = set({ sessionId: '22222222-2222-4222-8222-222222222222', weightKg: 80, reps: 5 });
    const lower = set({ sessionId: '33333333-3333-4333-8333-333333333333', weightKg: 60, reps: 8 });
    const current: PersonalRecordValue = {
      exerciseId,
      bestE1rm: 93.33,
      achievedAt: high.clientTs,
      sessionId: high.sessionId,
    };
    const fixture = storeWith([high, lower], current);
    const engine = new ProgressionEngine(fixture.store);

    expect(await engine.materializePersonalRecord(exerciseId)).toEqual(current);

    const edited = storeWith([lower], current);
    expect(await new ProgressionEngine(edited.store).materializePersonalRecord(exerciseId)).toEqual({
      exerciseId,
      bestE1rm: 76,
      achievedAt: lower.clientTs,
      sessionId: lower.sessionId,
    });
  });

  it('deletes a materialized record when no eligible completed set remains', async () => {
    const exerciseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const current: PersonalRecordValue = {
      exerciseId,
      bestE1rm: MAX_PROGRESSABLE_E1RM,
      achievedAt: timestamp,
      sessionId: '22222222-2222-4222-8222-222222222222',
    };
    const fixture = storeWith([set({ isCompleted: false })], current);

    await expect(new ProgressionEngine(fixture.store).materializePersonalRecord(exerciseId))
      .resolves.toBeNull();
    expect(fixture.deleted).toBe(true);
    expect(fixture.state).toBeNull();
  });
});
