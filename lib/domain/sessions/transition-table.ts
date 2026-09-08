import {
  SessionConflictError,
  SessionExerciseNotFoundError,
  SessionValidationError,
  type SessionPhase,
  type SessionSetMutation,
  type SessionState,
  type SessionTaskMutation,
  type TaskKey,
} from './types';

/**
 * Server-visible lifecycle edges. `rest` is a persisted bridge for a client
 * timer; the server does not measure elapsed rest time.
 */
export const SESSION_PHASE_TRANSITIONS: Readonly<Record<SessionPhase, readonly SessionPhase[]>> = {
  pre_workout: ['exercise'],
  exercise: ['rest', 'stretch'],
  rest: ['exercise', 'stretch'],
  stretch: ['post_workout'],
  post_workout: [],
};

/** A task is mutable only while its owning phase is active. */
export const TASK_PHASES: Readonly<Record<TaskKey, readonly SessionPhase[]>> = {
  warm_up: ['pre_workout'],
  main_workout: ['exercise', 'rest'],
  stretch: ['stretch'],
};

const SESSION_PHASE_VALUES: readonly SessionPhase[] = [
  'pre_workout',
  'exercise',
  'rest',
  'stretch',
  'post_workout',
];
const TASK_KEY_VALUES: readonly TaskKey[] = ['warm_up', 'main_workout', 'stretch'];

function isValidDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isValidWeight(value: number | null): boolean {
  if (value === null) return true;
  if (!Number.isFinite(value) || value < 0 || value > 1000) return false;

  // Compare against the rounded cent value with a scale-aware tolerance. Exact
  // multiplication by 100 is not reliable for binary floating-point values
  // such as 0.29.
  const rounded = Math.round(value * 100) / 100;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(rounded));
  return Math.abs(value - rounded) <= tolerance;
}

function isValidReps(value: number | null): boolean {
  return value === null || (Number.isInteger(value) && value >= 0 && value <= 1000);
}

export function isSessionPhase(value: unknown): value is SessionPhase {
  return typeof value === 'string' && SESSION_PHASE_VALUES.includes(value as SessionPhase);
}

export function isTaskKey(value: unknown): value is TaskKey {
  return typeof value === 'string' && TASK_KEY_VALUES.includes(value as TaskKey);
}

export function assertSessionMutable(state: SessionState): void {
  if (state.status !== 'in_progress') {
    throw new SessionConflictError('Only in-progress sessions can be mutated.');
  }
}

export function assertTaskMutationAllowed(state: SessionState, input: SessionTaskMutation): void {
  assertSessionMutable(state);
  if (!isTaskKey(input.taskKey)) {
    throw new SessionValidationError('Unknown session task.');
  }
  if (!TASK_PHASES[input.taskKey].includes(state.phase)) {
    throw new SessionValidationError(`Task ${input.taskKey} is not valid in phase ${state.phase}.`);
  }
  if (!isValidDate(input.clientTs) || (input.completedAt !== null && !isValidDate(input.completedAt))) {
    throw new SessionValidationError('Task timestamps must be valid dates.');
  }
}

export function assertSetMutationAllowed(state: SessionState, input: SessionSetMutation): void {
  assertSessionMutable(state);
  if (state.phase !== 'exercise' && state.phase !== 'rest') {
    throw new SessionConflictError('Sets can only be changed during the main workout.');
  }
  if (!Number.isInteger(input.setIndex) || input.setIndex < 0 || input.setIndex > 50) {
    throw new SessionValidationError('Set index must be an integer from 0 through 50.');
  }
  if (!isValidWeight(input.weightKg)) {
    throw new SessionValidationError('Weight must be null or a value from 0 through 1000 kg with two decimals.');
  }
  if (!isValidReps(input.reps)) {
    throw new SessionValidationError('Reps must be null or an integer from 0 through 1000.');
  }
  if (!isValidDate(input.clientTs)) {
    throw new SessionValidationError('Set client timestamp must be a valid date.');
  }

  const placement = state.routineDay.exercises.find(({ exercise }) => exercise.id === input.exerciseId);
  if (!placement || placement.phase !== 'main_workout' || placement.exercise.kind !== 'strength') {
    throw new SessionExerciseNotFoundError('Exercise is not part of this session.');
  }
  if (placement.targetSets === null || !Number.isInteger(placement.targetSets) || placement.targetSets < 0) {
    throw new SessionValidationError('The routine exercise does not define a valid target set count.');
  }
  if (input.setIndex >= placement.targetSets) {
    throw new SessionValidationError('Set index exceeds the routine target set count.');
  }
}

function hasCompletedTask(state: SessionState, taskKey: TaskKey): boolean {
  return state.tasks.some((task) => task.taskKey === taskKey && task.completedAt !== null);
}

function assertMainWorkoutComplete(state: SessionState): void {
  if (!hasCompletedTask(state, 'main_workout')) {
    throw new SessionConflictError('The main workout task must be completed before leaving the main workout.');
  }

  const mainExercises = state.routineDay.exercises.filter(({ phase, exercise }) =>
    phase === 'main_workout' && exercise.kind === 'strength');
  for (const placement of mainExercises) {
    if (placement.targetSets === null || !Number.isInteger(placement.targetSets) || placement.targetSets < 0) {
      throw new SessionValidationError('The routine exercise does not define a valid target set count.');
    }
    for (let setIndex = 0; setIndex < placement.targetSets; setIndex += 1) {
      const completed = state.sets.some((set) =>
        set.exerciseId === placement.exercise.id &&
        set.setIndex === setIndex &&
        set.isCompleted,
      );
      if (!completed) {
        throw new SessionConflictError('All required main-workout sets must be completed first.');
      }
    }
  }
}

export function assertPhaseAdvance(state: SessionState, nextPhase: SessionPhase): void {
  assertSessionMutable(state);
  if (!isSessionPhase(nextPhase)) {
    throw new SessionValidationError('Unknown session phase.');
  }
  if (!SESSION_PHASE_TRANSITIONS[state.phase].includes(nextPhase)) {
    throw new SessionValidationError(`Cannot advance from ${state.phase} to ${nextPhase}.`);
  }

  if (nextPhase === 'exercise' && state.phase === 'pre_workout' && !hasCompletedTask(state, 'warm_up')) {
    throw new SessionConflictError('The warm-up task must be completed before starting the main workout.');
  }
  if (nextPhase === 'stretch') {
    assertMainWorkoutComplete(state);
  }
  if (nextPhase === 'post_workout' && !hasCompletedTask(state, 'stretch')) {
    throw new SessionConflictError('The stretch task must be completed before post-workout.');
  }
}

export function assertCompletionTimestamp(value: Date): void {
  if (!isValidDate(value)) {
    throw new SessionValidationError('Completion timestamp must be a valid date.');
  }
}

export function assertFinishAllowed(state: SessionState): void {
  assertSessionMutable(state);
  if (state.phase !== 'post_workout') {
    throw new SessionConflictError('A session can only finish from post-workout.');
  }
}
