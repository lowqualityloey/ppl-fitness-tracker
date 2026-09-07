/**
 * Drizzle mirror of sql/001-setup.sql. Cut down from spec §4.1 to the two
 * tables the spike needs. The point is that reads go through real Drizzle
 * query building, not hand-written SQL — a hand-written SELECT would not
 * prove anything about the ORM path the app will actually use.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  preferredUnit: text('preferred_unit').notNull().default('kg'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessionSets = pgTable(
  'session_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    exerciseSlug: text('exercise_slug').notNull(),
    setIndex: integer('set_index').notNull(),
    isCompleted: boolean('is_completed').notNull().default(false),
    weightKg: numeric('weight_kg', { precision: 6, scale: 2 }),
    reps: integer('reps'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    check('weight_sane', sql`weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 1000)`),
    check('reps_sane', sql`reps IS NULL OR (reps >= 0 AND reps <= 1000)`),
  ],
);
