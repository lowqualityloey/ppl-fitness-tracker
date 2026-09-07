import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

describe('M1-03: Schema Constraints & Verification', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString: process.env.MIGRATION_DATABASE_URL,
    });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  describe('Scenario 1: Schema objects exist and are correctly configured', () => {
    it('should have all 9 tables created', async () => {
      const result = await client.query(`
        SELECT COUNT(*) as count FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN (
          'profiles', 'exercises', 'routine_days', 'routine_exercises',
          'workout_sessions', 'session_sets', 'session_tasks',
          'personal_records', 'sync_mutations', 'import_batches'
        )
      `);
      expect(Number(result.rows[0].count)).toBe(10);
    });

    it('should have all 5 enum types', async () => {
      const result = await client.query(`
        SELECT COUNT(*) as count FROM pg_type
        WHERE typtype = 'e' AND typname IN (
          'session_status', 'session_phase', 'session_source',
          'weight_unit', 'task_key'
        )
      `);
      expect(Number(result.rows[0].count)).toBe(5);
    });

    it('should have weight_sane and reps_sane check constraints on session_sets', async () => {
      const result = await client.query(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'session_sets'::regclass
        AND conname IN ('weight_sane', 'reps_sane')
      `);
      expect(result.rows.length).toBe(2);
      expect(result.rows.map((r: any) => r.conname).sort()).toEqual([
        'reps_sane',
        'weight_sane',
      ]);
    });

    it('should have one_active_session_per_day partial unique index', async () => {
      const result = await client.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'workout_sessions'
        AND indexname = 'one_active_session_per_day'
      `);
      expect(result.rows.length).toBe(1);
    });
  });

  describe('Scenario 2: Check constraints reject invalid data', () => {
    it('should enforce weight_kg 0–1000 constraint', async () => {
      const profileId = '11111111-1111-1111-1111-111111111111';
      await client.query(
        'INSERT INTO profiles (id, email) VALUES ($1, $2)',
        [profileId, 'test@example.com'],
      );

      const routineDayId = '22222222-2222-2222-2222-222222222222';
      await client.query(
        'INSERT INTO routine_days (id, slug, name) VALUES ($1, $2, $3)',
        [routineDayId, 'test', 'Test'],
      );

      const sessionId = '33333333-3333-3333-3333-333333333333';
      await client.query(
        `INSERT INTO workout_sessions (
          id, user_id, routine_day_id, client_id, local_date, started_at, status
        ) VALUES ($1, $2, $3, gen_random_uuid(), current_date, now(), 'in_progress')`,
        [sessionId, profileId, routineDayId],
      );

      const exerciseId = '44444444-4444-4444-4444-444444444444';
      await client.query(
        'INSERT INTO exercises (id, slug, name, muscle_groups) VALUES ($1, $2, $3, $4)',
        [exerciseId, 'test', 'Test', ['test']],
      );

      try {
        await client.query(
          `INSERT INTO session_sets (
            id, user_id, session_id, exercise_id, set_index,
            weight_kg, client_ts, updated_at
          ) VALUES (gen_random_uuid(), $1, $2, $3, 1, 1500, now(), now())`,
          [profileId, sessionId, exerciseId],
        );
        throw new Error('Should have rejected weight_kg = 1500');
      } catch (err) {
        if ((err as any)?.message?.includes('Should have rejected')) {
          throw err;
        }
        expect((err as any)?.code).toBe('23514');
      }

      await client.query('DELETE FROM workout_sessions WHERE id = $1', [
        sessionId,
      ]);
      await client.query('DELETE FROM routine_days WHERE id = $1', [
        routineDayId,
      ]);
      await client.query('DELETE FROM profiles WHERE id = $1', [profileId]);
    });

    it('should enforce reps 0–1000 constraint', async () => {
      const profileId = '55555555-5555-5555-5555-555555555555';
      await client.query(
        'INSERT INTO profiles (id, email) VALUES ($1, $2)',
        [profileId, 'test2@example.com'],
      );

      const routineDayId = '66666666-6666-6666-6666-666666666666';
      await client.query(
        'INSERT INTO routine_days (id, slug, name) VALUES ($1, $2, $3)',
        [routineDayId, 'test2', 'Test2'],
      );

      const sessionId = '77777777-7777-7777-7777-777777777777';
      await client.query(
        `INSERT INTO workout_sessions (
          id, user_id, routine_day_id, client_id, local_date, started_at, status
        ) VALUES ($1, $2, $3, gen_random_uuid(), current_date, now(), 'in_progress')`,
        [sessionId, profileId, routineDayId],
      );

      const exerciseId = '88888888-8888-8888-8888-888888888888';
      await client.query(
        'INSERT INTO exercises (id, slug, name, muscle_groups) VALUES ($1, $2, $3, $4)',
        [exerciseId, 'test2', 'Test2', ['test']],
      );

      try {
        await client.query(
          `INSERT INTO session_sets (
            id, user_id, session_id, exercise_id, set_index,
            reps, client_ts, updated_at
          ) VALUES (gen_random_uuid(), $1, $2, $3, 1, 2000, now(), now())`,
          [profileId, sessionId, exerciseId],
        );
        throw new Error('Should have rejected reps = 2000');
      } catch (err) {
        if ((err as any)?.message?.includes('Should have rejected')) {
          throw err;
        }
        expect((err as any)?.code).toBe('23514');
      }

      await client.query('DELETE FROM workout_sessions WHERE id = $1', [
        sessionId,
      ]);
      await client.query('DELETE FROM routine_days WHERE id = $1', [
        routineDayId,
      ]);
      await client.query('DELETE FROM profiles WHERE id = $1', [profileId]);
    });
  });

  describe('Scenario 3: Concurrency guard with partial unique index', () => {
    it('should prevent duplicate in_progress sessions per user/routine_day/date', async () => {
      const profileId = '99999999-9999-9999-9999-999999999999';
      await client.query(
        'INSERT INTO profiles (id, email) VALUES ($1, $2)',
        [profileId, 'test3@example.com'],
      );

      const routineDayId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      await client.query(
        'INSERT INTO routine_days (id, slug, name) VALUES ($1, $2, $3)',
        [routineDayId, 'test3', 'Test3'],
      );

      const session1Id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      await client.query(
        `INSERT INTO workout_sessions (
          id, user_id, routine_day_id, client_id, local_date, started_at, status
        ) VALUES ($1, $2, $3, gen_random_uuid(), current_date, now(), 'in_progress')`,
        [session1Id, profileId, routineDayId],
      );

      try {
        await client.query(
          `INSERT INTO workout_sessions (
            id, user_id, routine_day_id, client_id, local_date, started_at, status
          ) VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), current_date, now(), 'in_progress')`,
          [profileId, routineDayId],
        );
        throw new Error(
          'Should have rejected duplicate in_progress session',
        );
      } catch (err) {
        if ((err as any)?.message?.includes('Should have rejected')) {
          throw err;
        }
        expect((err as any)?.code).toBe('23505');
      }

      await client.query('DELETE FROM workout_sessions WHERE id = $1', [
        session1Id,
      ]);
      await client.query('DELETE FROM routine_days WHERE id = $1', [
        routineDayId,
      ]);
      await client.query('DELETE FROM profiles WHERE id = $1', [profileId]);
    });
  });

  describe('Scenario 4: Natural key enables idempotent upserts', () => {
    it('should allow ON CONFLICT on natural key for session_sets', async () => {
      const profileId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      await client.query(
        'INSERT INTO profiles (id, email) VALUES ($1, $2)',
        [profileId, 'test4@example.com'],
      );

      const routineDayId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
      await client.query(
        'INSERT INTO routine_days (id, slug, name) VALUES ($1, $2, $3)',
        [routineDayId, 'test4', 'Test4'],
      );

      const sessionId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
      await client.query(
        `INSERT INTO workout_sessions (
          id, user_id, routine_day_id, client_id, local_date, started_at, status
        ) VALUES ($1, $2, $3, gen_random_uuid(), current_date, now(), 'in_progress')`,
        [sessionId, profileId, routineDayId],
      );

      const exerciseId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      await client.query(
        'INSERT INTO exercises (id, slug, name, muscle_groups) VALUES ($1, $2, $3, $4)',
        [exerciseId, 'test4', 'Test4', ['test']],
      );

      const setId1 = await client.query(
        `INSERT INTO session_sets (
          id, user_id, session_id, exercise_id, set_index,
          is_completed, weight_kg, reps, client_ts, updated_at
        ) VALUES (gen_random_uuid(), $1, $2, $3, 1, false, 100, 10, now(), now())
        RETURNING id`,
        [profileId, sessionId, exerciseId],
      );

      const setId2 = await client.query(
        `INSERT INTO session_sets (
          id, user_id, session_id, exercise_id, set_index,
          is_completed, weight_kg, reps, client_ts, updated_at
        ) VALUES (gen_random_uuid(), $1, $2, $3, 1, true, 105, 11, now() + interval '1 second', now())
        ON CONFLICT (session_id, exercise_id, set_index) DO UPDATE SET
          is_completed = EXCLUDED.is_completed,
          weight_kg = EXCLUDED.weight_kg,
          reps = EXCLUDED.reps,
          client_ts = EXCLUDED.client_ts,
          updated_at = EXCLUDED.updated_at
        RETURNING id`,
        [profileId, sessionId, exerciseId],
      );

      expect(setId1.rows[0].id).toBe(setId2.rows[0].id);

      const updated = await client.query(
        `SELECT is_completed, weight_kg, reps FROM session_sets WHERE id = $1`,
        [setId1.rows[0].id],
      );
      expect(updated.rows[0].is_completed).toBe(true);
      expect(updated.rows[0].weight_kg).toBe('105.00');
      expect(updated.rows[0].reps).toBe(11);

      await client.query('DELETE FROM session_sets WHERE id = $1', [
        setId1.rows[0].id,
      ]);
      await client.query('DELETE FROM workout_sessions WHERE id = $1', [
        sessionId,
      ]);
      await client.query('DELETE FROM exercises WHERE id = $1', [exerciseId]);
      await client.query('DELETE FROM routine_days WHERE id = $1', [
        routineDayId,
      ]);
      await client.query('DELETE FROM profiles WHERE id = $1', [profileId]);
    });
  });
});
