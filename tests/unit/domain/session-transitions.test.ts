import { describe, expect, it } from 'vitest';
import {
  assertFinishAllowed,
  assertPhaseAdvance,
  assertSetMutationAllowed,
  assertTaskMutationAllowed,
} from '../../../lib/domain/sessions/transition-table.js';
import {
  SessionConflictError,
  SessionValidationError,
  type SessionPhase,
  type SessionState,
} from '../../../lib/domain/sessions/types.js';

const ids = {
  session: '11111111-1111-4111-8111-111111111111',
  routineDay: '22222222-2222-4222-8222-222222222222',
  exercise: '33333333-3333-4333-8333-333333333333',
};
const timestamp = new Date('2026-09-08T12:00:00.000Z');

function sessionState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: ids.session,
    routineDayId: ids.routineDay,
    clientId: '44444444-4444-4444-8444-444444444444',
    status: 'in_progress',
    phase: 'pre_workout',
    source: 'app',
    localDate: '2026-09-08',
    startedAt: timestamp,
    completedAt: null,
    serverSeq: 0,
    updatedAt: timestamp,
    routineDay: {
      id: ids.routineDay,
      slug: 'transition-day',
      name: 'Transition Day',
      description: null,
      exercises: [{
        id: '55555555-5555-4555-8555-555555555555',
        phase: 'main_workout',
        orderIndex: 0,
        targetSets: 2,
        targetReps: 8,
        targetRepsRange: '8-10',
        restTime: '90s',
        exercise: {
          id: ids.exercise,
          slug: 'transition-exercise',
          name: 'Transition Exercise',
          muscleGroups: ['test'],
          equipment: null,
          formTips: null,
          beginnerNotes: null,
          videoUrl: null,
          alternatives: [],
          kind: 'strength',
          durationSeconds: null,
        },
      }],
    },
    sets: [],
    tasks: [],
    ...overrides,
  };
}

function task(taskKey: 'warm_up' | 'main_workout' | 'stretch') {
  return {
    id: `${taskKey}-task`,
    sessionId: ids.session,
    taskKey,
    completedAt: timestamp,
    clientTs: timestamp,
    updatedAt: timestamp,
  };
}

function completedSets() {
  return [0, 1].map((setIndex) => ({
    id: `${setIndex}-set`,
    sessionId: ids.session,
    exerciseId: ids.exercise,
    setIndex,
    isCompleted: true,
    weightKg: 60,
    reps: 8,
    clientTs: timestamp,
    updatedAt: timestamp,
  }));
}

function stateForTransition(from: SessionPhase, to: SessionPhase): SessionState {
  const tasks = [];
  if (from === 'pre_workout') tasks.push(task('warm_up'));
  if (to === 'stretch') tasks.push(task('main_workout'));
  if (to === 'post_workout') tasks.push(task('stretch'));
  return sessionState({ phase: from, tasks, sets: to === 'stretch' ? completedSets() : [] });
}

describe('SessionEngine transition table', () => {
  it.each([
    ['pre_workout', 'exercise'],
    ['exercise', 'rest'],
    ['rest', 'exercise'],
    ['exercise', 'stretch'],
    ['rest', 'stretch'],
    ['stretch', 'post_workout'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(() => assertPhaseAdvance(stateForTransition(from, to), to)).not.toThrow();
  });

  it.each([
    ['pre_workout', 'stretch'],
    ['pre_workout', 'post_workout'],
    ['exercise', 'post_workout'],
    ['stretch', 'exercise'],
    ['post_workout', 'exercise'],
  ] as const)('rejects the illegal %s -> %s edge', (from, to) => {
    expect(() => assertPhaseAdvance(stateForTransition(from, to), to))
      .toThrow(SessionValidationError);
  });

  it('requires phase-specific task and set work before leaving a gated phase', () => {
    expect(() => assertPhaseAdvance(sessionState(), 'exercise')).toThrow(SessionConflictError);
    expect(() => assertPhaseAdvance(
      sessionState({ phase: 'exercise', tasks: [task('main_workout')] }),
      'stretch',
    )).toThrow(SessionConflictError);
    expect(() => assertPhaseAdvance(
      sessionState({ phase: 'stretch' }),
      'post_workout',
    )).toThrow(SessionConflictError);
  });

  it('allows task mutations only in their owning phase', () => {
    expect(() => assertTaskMutationAllowed(sessionState(), {
      sessionId: ids.session,
      taskKey: 'warm_up',
      completedAt: timestamp,
      clientTs: timestamp,
    })).not.toThrow();

    expect(() => assertTaskMutationAllowed(sessionState(), {
      sessionId: ids.session,
      taskKey: 'stretch',
      completedAt: timestamp,
      clientTs: timestamp,
    })).toThrow(SessionValidationError);
  });

  it('requires a configured main-workout placement and bounds set writes', () => {
    const state = sessionState({ phase: 'exercise' });
    const valid = {
      sessionId: ids.session,
      exerciseId: ids.exercise,
      setIndex: 1,
      isCompleted: true,
      weightKg: 60.25,
      reps: 8,
      clientTs: timestamp,
    };
    expect(() => assertSetMutationAllowed(state, valid)).not.toThrow();
    expect(() => assertSetMutationAllowed(state, { ...valid, weightKg: 0.29 })).not.toThrow();
    expect(() => assertSetMutationAllowed(state, { ...valid, setIndex: 2 }))
      .toThrow(SessionValidationError);
    expect(() => assertSetMutationAllowed(state, { ...valid, weightKg: 1000.001 }))
      .toThrow(SessionValidationError);
    expect(() => assertSetMutationAllowed(state, {
      ...valid,
      exerciseId: '66666666-6666-4666-8666-666666666666',
    })).toThrow();
  });

  it('rejects all lifecycle mutations after completion or archive', () => {
    for (const status of ['completed', 'archived'] as const) {
      const state = sessionState({ status, phase: 'post_workout' });
      expect(() => assertFinishAllowed(state)).toThrow(SessionConflictError);
      expect(() => assertTaskMutationAllowed(state, {
        sessionId: ids.session,
        taskKey: 'stretch',
        completedAt: timestamp,
        clientTs: timestamp,
      })).toThrow(SessionConflictError);
    }
  });
});
