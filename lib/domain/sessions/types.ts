export type SessionStatus = 'in_progress' | 'completed' | 'archived';
export type SessionPhase = 'pre_workout' | 'exercise' | 'rest' | 'stretch' | 'post_workout';
export type SessionSource = 'app' | 'legacy_import';
export type RoutineExercisePhase = 'main_workout' | 'stretch';
export type ExerciseKind = 'strength' | 'stretch';
export type TaskKey = 'warm_up' | 'main_workout' | 'stretch';

export interface ExercisePlan {
  id: string;
  slug: string;
  name: string;
  muscleGroups: string[];
  equipment: string | null;
  formTips: string | null;
  beginnerNotes: string | null;
  videoUrl: string | null;
  alternatives: string[];
  kind: ExerciseKind;
  durationSeconds: number | null;
}

export interface RoutineExercisePlan {
  id: string;
  phase: RoutineExercisePhase;
  orderIndex: number;
  targetSets: number | null;
  targetReps: number | null;
  targetRepsRange: string | null;
  restTime: string | null;
  exercise: ExercisePlan;
}

export interface SessionSetState {
  id: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  isCompleted: boolean;
  weightKg: number | null;
  reps: number | null;
  clientTs: Date;
  updatedAt: Date;
}

export interface SessionTaskState {
  id: string;
  sessionId: string;
  taskKey: TaskKey;
  completedAt: Date | null;
  clientTs: Date;
  updatedAt: Date;
}

export interface SessionSummary {
  id: string;
  routineDayId: string;
  clientId: string;
  status: SessionStatus;
  phase: SessionPhase;
  source: SessionSource;
  localDate: string;
  startedAt: Date;
  completedAt: Date | null;
  serverSeq: number;
  updatedAt: Date;
}

export interface SessionState extends SessionSummary {
  routineDay: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    exercises: RoutineExercisePlan[];
  };
  sets: SessionSetState[];
  tasks: SessionTaskState[];
}

export interface SessionPage {
  sessions: SessionSummary[];
  nextCursor: string | null;
}

export interface SessionSetMutation {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  isCompleted: boolean;
  weightKg: number | null;
  reps: number | null;
  clientTs: Date;
}

export interface SessionTaskMutation {
  sessionId: string;
  taskKey: TaskKey;
  completedAt: Date | null;
  clientTs: Date;
}

export interface SessionMutationContext {
  readonly state: SessionState;
  upsertSet(input: Omit<SessionSetMutation, 'sessionId'>): Promise<void>;
  completeTask(input: Omit<SessionTaskMutation, 'sessionId'>): Promise<void>;
  advancePhase(phase: SessionPhase): Promise<void>;
  finish(completedAt: Date): Promise<void>;
}

export type SessionMutation = (context: SessionMutationContext) => Promise<void>;

export class SessionValidationError extends Error {
  override readonly name: string = 'SessionValidationError';
}

export class SessionConflictError extends Error {
  override readonly name: string = 'SessionConflictError';
}

export class SessionNotFoundError extends Error {
  override readonly name: string = 'SessionNotFoundError';
}

export class SessionExerciseNotFoundError extends SessionNotFoundError {
  override readonly name = 'SessionExerciseNotFoundError';
}

export class SessionStartConflictError extends SessionConflictError {
  override readonly name = 'SessionStartConflictError';
}

export class InvalidSessionCursorError extends SessionValidationError {
  override readonly name = 'InvalidSessionCursorError';
}
