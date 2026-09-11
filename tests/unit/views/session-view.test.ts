import { describe, expect, it } from 'vitest';
import { parseSessionView, SessionViewShapeError } from '../../../lib/views/session-view';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

/** Shaped exactly as `mapSessionState` emits it (lib/domain/sessions/mappers.ts). */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID_A,
    routineDayId: UUID_B,
    clientId: UUID_C,
    status: 'in_progress',
    phase: 'exercise',
    source: 'app',
    localDate: '2026-09-11',
    startedAt: '2026-09-11T09:00:00.000Z',
    completedAt: null,
    serverSeq: 4,
    updatedAt: '2026-09-11T09:05:00.000Z',
    routineDay: {
      id: UUID_B,
      slug: 'push',
      name: 'Push Day',
      description: null,
      exercises: [
        {
          id: UUID_C,
          phase: 'main_workout',
          orderIndex: 0,
          targetSets: 3,
          targetReps: null,
          targetRepsRange: '6-8',
          restTime: '90s',
          exercise: { id: UUID_A, name: 'Bench Press' },
        },
      ],
    },
    sets: [
      {
        id: UUID_C,
        sessionId: UUID_A,
        exerciseId: UUID_A,
        setIndex: 1,
        isCompleted: true,
        weightKg: 100,
        reps: 8,
        clientTs: '2026-09-11T09:01:00.000Z',
        updatedAt: '2026-09-11T09:01:00.000Z',
      },
    ],
    tasks: [],
    ...overrides,
  };
}

describe('session view boundary (M3-04)', () => {
  it('accepts the payload the mapper actually produces', () => {
    const view = parseSessionView(payload());
    expect(view.routineDay.name).toBe('Push Day');
    expect(view.sets[0]?.weightKg).toBe(100);
  });

  it('rejects a status that is not in the database enum', () => {
    // Written because of a mistake, not in the abstract: this file was first
    // drafted with `['in_progress','archived','abandoned']`. The real enum
    // (db/schema/index.ts, mirrored by contracts/common.ts) is
    // `in_progress | completed | archived` — there is no `abandoned`. A hand-copied
    // enum would have 500'd the session screen on the first completed workout, so
    // the guard is asserted in both directions here.
    expect(() => parseSessionView(payload({ status: 'abandoned' }))).toThrow(
      SessionViewShapeError,
    );
    expect(() => parseSessionView(payload({ status: 'completed' }))).not.toThrow();
  });

  it('rejects a phase outside the five the runner can report', () => {
    // `session_phase` is pre_workout | exercise | rest | stretch | post_workout.
    // 'strength' is a *section* of the day, not a phase, and conflating the two is
    // how a rest period would render as an unknown value.
    expect(() => parseSessionView(payload({ phase: 'strength' }))).toThrow(
      SessionViewShapeError,
    );
    expect(() => parseSessionView(payload({ phase: 'post_workout' }))).not.toThrow();
  });

  it('names the offending path instead of failing opaque', () => {
    const broken = payload({ sets: undefined });
    let message = '';
    try {
      parseSessionView(broken);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('sets');
    // Without a path in the message, a shape mismatch on a real workout is an
    // unreadable sentence about the payload as a whole.
    expect(message).toContain('does not match the shape this screen renders');
  });

  it('refuses to render a set with a missing weight field', () => {
    // `weightKg: null` is meaningful (bodyweight); *absent* means the graph changed
    // under this screen, which is the case the guard exists for.
    const set = { ...(payload().sets as Record<string, unknown>[])[0]! };
    delete set.weightKg;
    expect(() => parseSessionView(payload({ sets: [set] }))).toThrow(SessionViewShapeError);
  });
});
