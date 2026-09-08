import type {
  exercises,
  routineDays,
  routineExercises,
  sessionSets,
  sessionTasks,
  workoutSessions,
} from '../../../db/schema/index.js';
import type {
  ExercisePlan,
  RoutineExercisePlan,
  SessionSetState,
  SessionState,
  SessionSummary,
  SessionTaskState,
} from './types.js';

export type WorkoutSessionRow = typeof workoutSessions.$inferSelect;
export type RoutineDayRow = typeof routineDays.$inferSelect;
export type RoutineExerciseRow = typeof routineExercises.$inferSelect;
export type ExerciseRow = typeof exercises.$inferSelect;
export type SessionSetRow = typeof sessionSets.$inferSelect;
export type SessionTaskRow = typeof sessionTasks.$inferSelect;

function nullableNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}

export function mapSessionSummary(row: WorkoutSessionRow): SessionSummary {
  return {
    id: row.id,
    routineDayId: row.routineDayId,
    clientId: row.clientId,
    status: row.status,
    phase: row.phase,
    source: row.source,
    localDate: row.localDate,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    serverSeq: row.serverSeq,
    updatedAt: row.updatedAt,
  };
}

export function mapExercisePlan(row: ExerciseRow): ExercisePlan {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    muscleGroups: row.muscleGroups,
    equipment: row.equipment,
    formTips: row.formTips,
    beginnerNotes: row.beginnerNotes,
    videoUrl: row.videoUrl,
    alternatives: row.alternatives,
    kind: row.kind,
    durationSeconds: row.durationSeconds,
  };
}

export function mapRoutineExercisePlan(
  placement: RoutineExerciseRow,
  exercise: ExerciseRow,
): RoutineExercisePlan {
  return {
    id: placement.id,
    phase: placement.phase,
    orderIndex: placement.orderIndex,
    targetSets: placement.targetSets,
    targetReps: placement.targetReps,
    targetRepsRange: placement.targetRepsRange,
    restTime: placement.restTime,
    exercise: mapExercisePlan(exercise),
  };
}

export function mapSessionSet(row: SessionSetRow): SessionSetState {
  return {
    id: row.id,
    sessionId: row.sessionId,
    exerciseId: row.exerciseId,
    setIndex: row.setIndex,
    isCompleted: row.isCompleted,
    weightKg: nullableNumber(row.weightKg),
    reps: row.reps,
    clientTs: row.clientTs,
    updatedAt: row.updatedAt,
  };
}

export function mapSessionTask(row: SessionTaskRow): SessionTaskState {
  return {
    id: row.id,
    sessionId: row.sessionId,
    taskKey: row.taskKey,
    completedAt: row.completedAt,
    clientTs: row.clientTs,
    updatedAt: row.updatedAt,
  };
}

export function mapSessionState(
  session: WorkoutSessionRow,
  routineDay: RoutineDayRow,
  plan: RoutineExercisePlan[],
  sets: SessionSetState[],
  tasks: SessionTaskState[],
): SessionState {
  return {
    ...mapSessionSummary(session),
    routineDay: {
      id: routineDay.id,
      slug: routineDay.slug,
      name: routineDay.name,
      description: routineDay.description,
      exercises: plan,
    },
    sets,
    tasks,
  };
}
