import { SessionValidationError } from '../sessions/types';

export interface E1rmInput {
  isCompleted: boolean;
  weightKg: number | null;
  reps: number | null;
}

export interface ProgressionSet {
  sessionId: string;
  setIndex: number;
  isCompleted: boolean;
  weightKg: number | null;
  reps: number | null;
  clientTs: Date;
}

export interface PersonalRecordValue {
  exerciseId: string;
  bestE1rm: number;
  achievedAt: Date;
  sessionId: string | null;
}

/** Bound to one verified user and one transaction by WorkoutRepository. */
export interface ProgressionStore {
  listSets(exerciseId: string): Promise<readonly ProgressionSet[]>;
  lockPersonalRecord(exerciseId: string): Promise<PersonalRecordValue | null>;
  insertPersonalRecordIfAbsent(record: PersonalRecordValue): Promise<boolean>;
  replacePersonalRecord(record: PersonalRecordValue): Promise<void>;
  deletePersonalRecord(exerciseId: string): Promise<void>;
}

export class ProgressionValidationError extends SessionValidationError {
  override readonly name = 'ProgressionValidationError';
}
