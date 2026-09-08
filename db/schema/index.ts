/**
 * Complete Drizzle schema for the PPL Fitness Tracker
 * 
 * Implements all 9 tables from spec §4.1 with the full definitions.
 * The base tables match 0000_sleepy_sharon_carter.sql; later migrations add
 * seed-facing fields without changing the existing compatibility columns.
 */

import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ============================================================================
// Custom Enum Types (matching existing migration)
// ============================================================================

export const weightUnit = pgEnum('weight_unit', ['kg', 'lbs']);

export const sessionStatus = pgEnum('session_status', [
  'in_progress',
  'completed', 
  'archived'
]);

export const sessionPhase = pgEnum('session_phase', [
  'pre_workout',
  'exercise',
  'rest', 
  'stretch',
  'post_workout'
]);

export const sessionSource = pgEnum('session_source', [
  'app',
  'legacy_import'
]);

export const taskKey = pgEnum('task_key', [
  'warm_up',
  'main_workout', 
  'stretch'
]);

// ============================================================================
// Tables (matching existing migration exactly)
// ============================================================================

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  preferredUnit: weightUnit('preferred_unit').notNull().default('kg'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const exercises = pgTable('exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  muscleGroups: text('muscle_groups').array().notNull(),
  equipment: text('equipment'),
  formTips: text('form_tips'),
  beginnerNotes: text('beginner_notes'),
  videoUrl: text('video_url'),
  alternatives: text('alternatives').array().notNull().default(sql`'{}'`),
  ownerUserId: uuid('owner_user_id').references(() => profiles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const routineDays = pgTable('routine_days', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  ownerUserId: uuid('owner_user_id').references(() => profiles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const routineExercises = pgTable('routine_exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  routineDayId: uuid('routine_day_id').notNull().references(() => routineDays.id, { onDelete: 'cascade' }),
  exerciseId: uuid('exercise_id').notNull().references(() => exercises.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull(),
  targetSets: integer('target_sets').notNull(),
  // Compatibility projection; targetRepsRange is the lossless source value.
  targetReps: integer('target_reps').notNull(),
  targetRepsRange: text('target_reps_range'),
  restTime: text('rest_time'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  routineExerciseOrder: uniqueIndex('routine_exercises_day_order').on(t.routineDayId, t.orderIndex),
  routineExerciseDayExercise: uniqueIndex('routine_exercises_day_exercise').on(t.routineDayId, t.exerciseId),
}));

export const workoutSessions = pgTable('workout_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  routineDayId: uuid('routine_day_id').notNull().references(() => routineDays.id),
  clientId: uuid('client_id').notNull(),
  status: sessionStatus('status').notNull().default('in_progress'),
  phase: sessionPhase('phase').notNull().default('pre_workout'),
  source: sessionSource('source').notNull().default('app'),
  localDate: date('local_date').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  serverSeq: integer('server_seq').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  oneActivePerDay: uniqueIndex('one_active_session_per_day')
    .on(t.userId, t.routineDayId, t.localDate)
    .where(sql`status = 'in_progress'`),
  clientIdUnique: uniqueIndex('session_client_id').on(t.userId, t.clientId),
  historyLookup: index('session_history').on(t.userId, t.localDate.desc()),
}));

export const sessionSets = pgTable('session_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => workoutSessions.id, { onDelete: 'cascade' }),
  exerciseId: uuid('exercise_id').notNull().references(() => exercises.id),
  setIndex: integer('set_index').notNull(),
  isCompleted: boolean('is_completed').notNull().default(false),
  weightKg: numeric('weight_kg', { precision: 6, scale: 2 }),
  reps: integer('reps'),
  clientTs: timestamp('client_ts', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  naturalKey: uniqueIndex('set_natural_key').on(t.sessionId, t.exerciseId, t.setIndex),
  weightSane: check('weight_sane', sql`weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 1000)`),
  repsSane: check('reps_sane', sql`reps IS NULL OR (reps >= 0 AND reps <= 1000)`),
}));

export const sessionTasks = pgTable('session_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => workoutSessions.id, { onDelete: 'cascade' }),
  taskKey: taskKey('task_key').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  clientTs: timestamp('client_ts', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionTaskKey: uniqueIndex('session_tasks_natural_key').on(t.sessionId, t.taskKey),
}));

export const personalRecords = pgTable('personal_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  exerciseId: uuid('exercise_id').notNull().references(() => exercises.id),
  bestE1rm: numeric('best_e1rm', { precision: 6, scale: 2 }).notNull(),
  achievedAt: timestamp('achieved_at', { withTimezone: true }).notNull(),
  sessionId: uuid('session_id').references(() => workoutSessions.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userExercisePR: uniqueIndex('personal_records_user_exercise').on(t.userId, t.exerciseId),
}));

export const syncMutations = pgTable('sync_mutations', {
  mutationId: uuid('mutation_id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});

export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  sourceFingerprint: text('source_fingerprint').notNull(),
  report: text('report').notNull(), // JSON as text to match existing migration
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userSourceUnique: uniqueIndex('import_batches_fingerprint').on(t.userId, t.sourceFingerprint),
}));

// ============================================================================
// Drizzle Relations (for ORM convenience, not schema generation)
// ============================================================================

export const profilesRelations = relations(profiles, ({ many }) => ({
  workoutSessions: many(workoutSessions),
  sessionSets: many(sessionSets),
  personalRecords: many(personalRecords),
  syncMutations: many(syncMutations),
  importBatches: many(importBatches),
  ownedExercises: many(exercises),
  ownedRoutineDays: many(routineDays),
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  owner: one(profiles, {
    fields: [exercises.ownerUserId],
    references: [profiles.id],
  }),
  sessionSets: many(sessionSets),
  personalRecords: many(personalRecords),
  routineExercises: many(routineExercises),
}));

export const routineDaysRelations = relations(routineDays, ({ one, many }) => ({
  owner: one(profiles, {
    fields: [routineDays.ownerUserId],
    references: [profiles.id],
  }),
  routineExercises: many(routineExercises),
  workoutSessions: many(workoutSessions),
}));

export const routineExercisesRelations = relations(routineExercises, ({ one }) => ({
  routineDay: one(routineDays, {
    fields: [routineExercises.routineDayId],
    references: [routineDays.id],
  }),
  exercise: one(exercises, {
    fields: [routineExercises.exerciseId],
    references: [exercises.id],
  }),
}));

export const workoutSessionsRelations = relations(workoutSessions, ({ one, many }) => ({
  user: one(profiles, {
    fields: [workoutSessions.userId],
    references: [profiles.id],
  }),
  routineDay: one(routineDays, {
    fields: [workoutSessions.routineDayId],
    references: [routineDays.id],
  }),
  sessionSets: many(sessionSets),
  sessionTasks: many(sessionTasks),
  personalRecords: many(personalRecords),
}));

export const sessionSetsRelations = relations(sessionSets, ({ one }) => ({
  user: one(profiles, {
    fields: [sessionSets.userId],
    references: [profiles.id],
  }),
  session: one(workoutSessions, {
    fields: [sessionSets.sessionId],
    references: [workoutSessions.id],
  }),
  exercise: one(exercises, {
    fields: [sessionSets.exerciseId],
    references: [exercises.id],
  }),
}));

export const sessionTasksRelations = relations(sessionTasks, ({ one }) => ({
  session: one(workoutSessions, {
    fields: [sessionTasks.sessionId],
    references: [workoutSessions.id],
  }),
}));

export const personalRecordsRelations = relations(personalRecords, ({ one }) => ({
  user: one(profiles, {
    fields: [personalRecords.userId],
    references: [profiles.id],
  }),
  exercise: one(exercises, {
    fields: [personalRecords.exerciseId],
    references: [exercises.id],
  }),
  session: one(workoutSessions, {
    fields: [personalRecords.sessionId],
    references: [workoutSessions.id],
  }),
}));

export const syncMutationsRelations = relations(syncMutations, ({ one }) => ({
  user: one(profiles, {
    fields: [syncMutations.userId],
    references: [profiles.id],
  }),
}));

export const importBatchesRelations = relations(importBatches, ({ one }) => ({
  user: one(profiles, {
    fields: [importBatches.userId],
    references: [profiles.id],
  }),
}));