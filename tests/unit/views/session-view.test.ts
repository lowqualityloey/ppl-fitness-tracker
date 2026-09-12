import { describe, expect, it } from 'vitest';
import {
  parseSessionView,
  SessionViewSetSchema,
  SessionViewShapeError,
} from '../../../lib/views/session-view';
import { SessionStateSchema } from '../../../lib/contracts/sessions';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

/** One exercise, as `mapExercisePlan` emits it: all eleven fields. */
function exercisePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID_A,
    slug: 'bench-press',
    name: 'Bench Press',
    muscleGroups: ['chest', 'triceps'],
    equipment: 'barbell',
    formTips: 'Keep your shoulders packed.',
    beginnerNotes: 'Use a spotter.',
    videoUrl: null,
    alternatives: ['push-ups'],
    kind: 'strength',
    durationSeconds: null,
    ...overrides,
  };
}

/**
 * Shaped exactly as `mapSessionState` emits it (lib/domain/sessions/mappers.ts).
 *
 * Since #73 closed `SessionStateSchema`, this fixture has to carry the **whole** graph: the
 * view is that contract now, and the contract is `.strict()` with nothing `.optional()` that
 * the mapper always emits. The version of this function it replaced carried four of an
 * exercise's eleven fields and no task rows at all, and parsed fine — against a schema that
 * could not fail. Filling the fixture in is what makes every
 * assertion below about the real payload rather than a subset of it.
 */
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
          exercise: exercisePlan(),
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
    tasks: [
      {
        id: UUID_C,
        sessionId: UUID_A,
        taskKey: 'warm_up',
        completedAt: null,
        clientTs: '2026-09-11T09:00:30.000Z',
        updatedAt: '2026-09-11T09:00:30.000Z',
      },
    ],
    ...overrides,
  };
}

describe('session view boundary (M3-04, closed by #73)', () => {
  it('is the contract itself, not a second description of it', () => {
    // Reference identity, not structural equality: two definitions of "what a session
    // is" is the defect this file used to be a workaround for, and a fork introduced
    // later has to fail here rather than in production.
    expect(SessionViewSetSchema).toBe(SessionStateSchema);
  });

  it('accepts the payload the mapper actually produces', () => {
    const view = parseSessionView(payload());
    expect(view.routineDay.name).toBe('Push Day');
    expect(view.sets[0]?.weightKg).toBe(100);
    expect(view.tasks[0]?.taskKey).toBe('warm_up');
    // Fields the old view could not see, and the reason `z.infer` mattered: a screen
    // typed against `Record<string, unknown>` read these as `undefined` and compiled.
    expect(view.serverSeq).toBe(4);
    expect(view.source).toBe('app');
    expect(view.routineDay.exercises[0]?.exercise.muscleGroups).toEqual(['chest', 'triceps']);
  });

  it('accepts a Date wherever the wire carries a string, because the server reads in-process', () => {
    /*
     * `/session/[id]` and `/history/[id]` are server components: they call the repository
     * directly and hold `Date` objects, while the runner re-reads the same columns as ISO
     * strings over HTTP. A schema that asserted only one of the two would throw on the
     * other — so the coercion lives in the contract, and both forms are pinned here.
     */
    const firstSet = (payload().sets as Record<string, unknown>[])[0]!;
    const view = parseSessionView(
      payload({
        startedAt: new Date('2026-09-11T09:00:00.000Z'),
        updatedAt: new Date('2026-09-11T09:05:00.000Z'),
        completedAt: new Date('2026-09-11T10:00:00.000Z'),
        sets: [
          {
            ...firstSet,
            clientTs: new Date('2026-09-11T09:01:00.000Z'),
            updatedAt: new Date('2026-09-11T09:01:00.000Z'),
          },
        ],
      }),
    );
    // Exactly one type leaves the schema, whichever form went in.
    expect(view.startedAt).toBe('2026-09-11T09:00:00.000Z');
    expect(view.completedAt).toBe('2026-09-11T10:00:00.000Z');
    expect(view.sets[0]?.clientTs).toBe('2026-09-11T09:01:00.000Z');
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

  it('rejects a plan field the mapper stopped emitting', () => {
    // The four target/rest fields were `.optional()` in the old view precisely because it
    // could not see the mapper. They are required here, so a mapper that drops one is a
    // throw, not a screen that quietly stops showing sets.
    const broken = payload();
    delete (broken.routineDay.exercises as Record<string, unknown>[])[0]!.targetSets;
    expect(() => parseSessionView(broken)).toThrow(SessionViewShapeError);
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
