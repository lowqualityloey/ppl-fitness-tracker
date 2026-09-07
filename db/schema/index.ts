import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ============================================================================
// PostgreSQL Enum Types
// ============================================================================
export const sessionStatusEnum = pgEnum('session_status', [
  'in_progress',
  'completed',
  'archived',
]);

export const sessionPhaseEnum = pgEnum('session_phase', [
  'pre_workout',
  'exercise',
  'rest',
  'stretch',
  'post_workout',
]);

export const sessionSourceEnum = pgEnum('session_source', [
  'app',
  'legacy_import',
]);

export const weightUnitEnum = pgEnum('weight_unit', ['kg', 'lbs']);

export const taskKeyEnum = pgEnum('task_key', [
  'warm_up',
  'main_workout',
  'stretch',
]);

// ============================================================================
// PROFILES — mirrors auth.users.id, FK target for everything else
// ============================================================================
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  preferredUnit: weightUnitEnum('preferred_unit').notNull().default('kg'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// EXERCISES — system-owned seed data (ownerUserId IS NULL)
// ============================================================================
export const exercises = pgTable('exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  muscleGroups: text('muscle_groups').array().notNull(),
  equipment: text('equipment'),
  formTips: text('form_tips'),
  videoUrl: text('video_url'),
  alternatives: text('alternatives').array().notNull().default(sql`'{}'`),
  ownerUserId: uuid('owner_user_id').references(() => profiles.id, {
    onDelete: 'cascade',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// ROUTINE_DAYS — PPL structure (push/pull/legs), system-owned
// ============================================================================
export const routineDays = pgTable('routine_days', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  ownerUserId: uuid('owner_user_id').references(() => profiles.id, {
    onDelete: 'cascade',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// ROUTINE_EXERCISES — join table: routine_day <-> exercise
// ============================================================================
export const routineExercises = pgTable(
  'routine_exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routineDayId: uuid('routine_day_id')
      .notNull()
      .references(() => routineDays.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    targetSets: integer('target_sets').notNull(),
    targetReps: integer('target_reps').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orderUnique: uniqueIndex('routine_exercises_day_order').on(
      t.routineDayId,
      t.orderIndex,
    ),
  }),
);

// ============================================================================
// WORKOUT_SESSIONS — record of record; one per user per routine_day per day
// ============================================================================
export const workoutSessions = pgTable(
  'workout_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    routineDayId: uuid('routine_day_id')
      .notNull()
      .references(() => routineDays.id),
    clientId: uuid('client_id').notNull(),
    status: sessionStatusEnum('status').notNull().default('in_progress'),
    phase: sessionPhaseEnum('phase').notNull().default('pre_workout'),
    source: sessionSourceEnum('source').notNull().default('app'),
    localDate: date('local_date').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    serverSeq: integer('server_seq').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    oneActivePerDay: uniqueIndex('one_active_session_per_day')
      .on(t.userId, t.routineDayId, t.localDate)
      .where(sql`status = 'in_progress'`),
    clientIdUnique: uniqueIndex('session_client_id').on(t.userId, t.clientId),
    historyLookup: index('session_history').on(
      t.userId,
      sql`${t.localDate} DESC`,
    ),
  }),
);

// ============================================================================
// SESSION_SETS — individual set completion + logging
// ============================================================================
export const sessionSets = pgTable(
  'session_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    setIndex: integer('set_index').notNull(),
    isCompleted: boolean('is_completed').notNull().default(false),
    weightKg: numeric('weight_kg', { precision: 6, scale: 2 }),
    reps: integer('reps'),
    clientTs: timestamp('client_ts', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    naturalKey: uniqueIndex('set_natural_key').on(
      t.sessionId,
      t.exerciseId,
      t.setIndex,
    ),
    weightSane: check(
      'weight_sane',
      sql`weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 1000)`,
    ),
    repsSane: check(
      'reps_sane',
      sql`reps IS NULL OR (reps >= 0 AND reps <= 1000)`,
    ),
  }),
);

// ============================================================================
// SESSION_TASKS — checklist completion (warm-up, main, stretch)
// ============================================================================
export const sessionTasks = pgTable(
  'session_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    taskKey: taskKeyEnum('task_key').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    clientTs: timestamp('client_ts', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    naturalKey: uniqueIndex('session_tasks_natural_key').on(
      t.sessionId,
      t.taskKey,
    ),
  }),
);

// ============================================================================
// PERSONAL_RECORDS — e1RM tracking per user per exercise
// ============================================================================
export const personalRecords = pgTable(
  'personal_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id),
    bestE1rm: numeric('best_e1rm', { precision: 6, scale: 2 }).notNull(),
    achievedAt: timestamp('achieved_at', { withTimezone: true }).notNull(),
    sessionId: uuid('session_id').references(() => workoutSessions.id),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userExerciseUnique: uniqueIndex('personal_records_user_exercise').on(
      t.userId,
      t.exerciseId,
    ),
  }),
);

// ============================================================================
// SYNC_MUTATIONS — idempotency ledger for offline outbox
// ============================================================================
export const syncMutations = pgTable('sync_mutations', {
  mutationId: uuid('mutation_id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  appliedAt: timestamp('applied_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// IMPORT_BATCHES — legacy localStorage import idempotency + reporting
// ============================================================================
export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    sourceFingerprint: text('source_fingerprint').notNull(),
    report: text('report').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    fingerprintUnique: uniqueIndex('import_batches_fingerprint').on(
      t.userId,
      t.sourceFingerprint,
    ),
  }),
);

// ============================================================================
// Relations (for Drizzle ORM convenience)
// ============================================================================
export const profilesRelations = relations('profiles', ({ one, many }) => ({
  exercises: many('exercises'),
  routineDays: many('routine_days'),
  workoutSessions: many('workout_sessions'),
  sessionSets: many('session_sets'),
  personalRecords: many('personal_records'),
  syncMutations: many('sync_mutations'),
  importBatches: many('import_batches'),
}));

export const exercisesRelations = relations('exercises', ({ one, many }) => ({
  owner: one('profiles', {
    fields: ['ownerUserId'],
    references: ['id'],
  }),
  routineExercises: many('routine_exercises'),
  sessionSets: many('session_sets'),
  personalRecords: many('personal_records'),
}));

export const routineDaysRelations = relations(
  'routine_days',
  ({ one, many }) => ({
    owner: one('profiles', {
      fields: ['ownerUserId'],
      references: ['id'],
    }),
    routineExercises: many('routine_exercises'),
    workoutSessions: many('workout_sessions'),
  }),
);

export const routineExercisesRelations = relations(
  'routine_exercises',
  ({ one }) => ({
    routineDay: one('routine_days', {
      fields: ['routineDayId'],
      references: ['id'],
    }),
    exercise: one('exercises', {
      fields: ['exerciseId'],
      references: ['id'],
    }),
  }),
);

export const workoutSessionsRelations = relations(
  'workout_sessions',
  ({ one, many }) => ({
    user: one('profiles', {
      fields: ['userId'],
      references: ['id'],
    }),
    routineDay: one('routine_days', {
      fields: ['routineDayId'],
      references: ['id'],
    }),
    sets: many('session_sets'),
    tasks: many('session_tasks'),
  }),
);

export const sessionSetsRelations = relations('session_sets', ({ one }) => ({
  user: one('profiles', {
    fields: ['userId'],
    references: ['id'],
  }),
  session: one('workout_sessions', {
    fields: ['sessionId'],
    references: ['id'],
  }),
  exercise: one('exercises', {
    fields: ['exerciseId'],
    references: ['id'],
  }),
}));

export const sessionTasksRelations = relations('session_tasks', ({ one }) => ({
  session: one('workout_sessions', {
    fields: ['sessionId'],
    references: ['id'],
  }),
}));

export const personalRecordsRelations = relations(
  'personal_records',
  ({ one }) => ({
    user: one('profiles', {
      fields: ['userId'],
      references: ['id'],
    }),
    exercise: one('exercises', {
      fields: ['exerciseId'],
      references: ['id'],
    }),
    session: one('workout_sessions', {
      fields: ['sessionId'],
      references: ['id'],
    }),
  }),
);

export const syncMutationsRelations = relations(
  'sync_mutations',
  ({ one }) => ({
    user: one('profiles', {
      fields: ['userId'],
      references: ['id'],
    }),
  }),
);

export const importBatchesRelations = relations(
  'import_batches',
  ({ one }) => ({
    user: one('profiles', {
      fields: ['userId'],
      references: ['id'],
    }),
  }),
);
