import {
  mapExercisePlan,
  mapSessionSet,
  mapSessionState,
  mapSessionTask,
  type ExerciseRow,
  type RoutineDayRow,
  type SessionSetRow,
  type SessionTaskRow,
  type WorkoutSessionRow,
} from '../../../lib/domain/sessions/mappers';

/**
 * Shared fixtures for the session-graph contract tests (#73).
 *
 * Deliberately not a `.test.ts` file, following `tests/unit/state/fixtures.ts`: vitest's
 * include pattern collects only test files, so this is imported rather than run. It exists
 * because two files need the same question answered — "what does `mapSessionState` actually
 * produce?" — and a divergent second copy of that answer would let the contract test and the
 * envelope test agree with each other while both disagree with the mapper, which is the exact
 * failure mode #73 was filed about.
 *
 * The rows are typed `satisfies …$inferSelect`, i.e. they are the database's shape as drizzle
 * describes it. Neither the fixture nor the schema is hand-written to fit the other: the
 * mapper builds the object, and the contract is asserted against it.
 */

export const CONTRACT_UUID = {
  session: '11111111-1111-4111-8111-111111111111',
  day: '22222222-2222-4222-8222-222222222222',
  client: '33333333-3333-4333-8333-333333333333',
  placement: '44444444-4444-4444-8444-444444444444',
  exercise: '55555555-5555-5555-8555-555555555555',
  set: '66666666-6666-4666-8666-666666666666',
  task: '77777777-7777-4777-8777-777777777777',
};

export const CONTRACT_STARTED_AT = new Date('2026-09-11T09:00:00.000Z');
export const CONTRACT_UPDATED_AT = new Date('2026-09-11T09:05:00.000Z');

export const sessionRow = {
  id: CONTRACT_UUID.session,
  userId: CONTRACT_UUID.client,
  routineDayId: CONTRACT_UUID.day,
  clientId: CONTRACT_UUID.client,
  status: 'in_progress',
  phase: 'exercise',
  source: 'app',
  localDate: '2026-09-11',
  startedAt: CONTRACT_STARTED_AT,
  completedAt: null,
  serverSeq: 12,
  updatedAt: CONTRACT_UPDATED_AT,
} satisfies WorkoutSessionRow;

export const routineDayRow = {
  id: CONTRACT_UUID.day,
  slug: 'push',
  name: 'Push Day',
  description: 'Pressing, in order.',
  ownerUserId: null,
  createdAt: CONTRACT_STARTED_AT,
} satisfies RoutineDayRow;

export const exerciseRow = {
  id: CONTRACT_UUID.exercise,
  slug: 'bench-press',
  name: 'Bench Press',
  muscleGroups: ['chest', 'triceps'],
  equipment: 'barbell',
  formTips: 'Shoulders packed.',
  beginnerNotes: null,
  videoUrl: null,
  alternatives: ['push-ups'],
  kind: 'strength',
  durationSeconds: null,
  ownerUserId: null,
  createdAt: CONTRACT_STARTED_AT,
} satisfies ExerciseRow;

export const sessionSetRow = {
  id: CONTRACT_UUID.set,
  userId: CONTRACT_UUID.client,
  sessionId: CONTRACT_UUID.session,
  exerciseId: CONTRACT_UUID.exercise,
  setIndex: 0,
  isCompleted: true,
  // `'82.50'` on purpose: `numeric(6,2)` arrives as a string and the mapper converts it.
  // A contract that rejected the converted value would reject every real set row.
  weightKg: '82.50',
  reps: 8,
  clientTs: CONTRACT_STARTED_AT,
  updatedAt: CONTRACT_UPDATED_AT,
} satisfies SessionSetRow;

/** One completed task and one unanswered, so both `completedAt` arms are exercised. */
export const taskRows = [
  {
    id: CONTRACT_UUID.task,
    sessionId: CONTRACT_UUID.session,
    taskKey: 'warm_up',
    completedAt: CONTRACT_STARTED_AT,
    clientTs: CONTRACT_STARTED_AT,
    updatedAt: CONTRACT_UPDATED_AT,
  },
  {
    id: '88888888-8888-4888-8888-888888888888',
    sessionId: CONTRACT_UUID.session,
    taskKey: 'stretch',
    completedAt: null,
    clientTs: CONTRACT_STARTED_AT,
    updatedAt: CONTRACT_UPDATED_AT,
  },
] satisfies SessionTaskRow[];

/** A whole `mapSessionState` output, built the way the repository builds it. */
export function mapperOutput() {
  return mapSessionState(
    sessionRow,
    routineDayRow,
    [
      {
        id: CONTRACT_UUID.placement,
        phase: 'main_workout',
        orderIndex: 0,
        targetSets: 3,
        targetReps: null,
        targetRepsRange: '6-8',
        restTime: '90s',
        exercise: mapExercisePlan(exerciseRow),
      },
    ],
    [mapSessionSet(sessionSetRow)],
    taskRows.map(mapSessionTask),
  );
}
