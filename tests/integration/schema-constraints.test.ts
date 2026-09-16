import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { pgErrorCode, pgErrorMessage } from './pg-error.js';

describe('M1-03: Schema Constraints & Verification', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString: process.env.MIGRATION_DATABASE_URL,
    });
    await client.connect();

    // M4-00 (#89): migration 0007 put a real FK on profiles.id -> auth.users.id, so the
    // synthetic `00000000-…0001` profile used below must have an Auth parent the way every
    // real profile does. This is the same owner-only auth.users insert
    // handle-new-user-trigger.test.ts performs; the on_auth_user_created trigger then
    // materializes the profile row itself — demonstrating the ADR-0002 invariant rather
    // than routing around it: a profile without an identity is now a constraint violation.
    await client.query(
      `INSERT INTO auth.users (id, email)
       VALUES ('00000000-0000-0000-0000-000000000001'::uuid,
               'schema-constraints-fixture@example.com')
       ON CONFLICT DO NOTHING`,
    );
  });

  afterAll(async () => {
    // The fixtures below are keyed to literal `00000000-…` ids and inserted with
    // `ON CONFLICT DO NOTHING`, so they also have to be removed unconditionally
    // here. The per-test cleanups deleted the sessions and sets that referenced the
    // `routine_days` row but never the row itself, which left a **system** day
    // (`owner_user_id IS NULL`, slug `test-push`, name "Test Push") in the shared
    // development database after every run of this file. M3-04's dashboard was the
    // first reader of system routine days and immediately grew a fourth card called
    // "Test Push": the leak had been invisible until something displayed what it
    // left behind. Deleting in `afterAll` rather than per-test also covers the path
    // where a test throws before reaching its own cleanup.
    await client.query(
      `DELETE FROM session_sets WHERE session_id IN
         (SELECT id FROM workout_sessions WHERE routine_day_id = $1::uuid)`,
      ['00000000-0000-0000-0000-000000000002'],
    );
    await client.query('DELETE FROM workout_sessions WHERE routine_day_id = $1::uuid', [
      '00000000-0000-0000-0000-000000000002',
    ]);
    await client.query('DELETE FROM routine_days WHERE id = $1::uuid', [
      '00000000-0000-0000-0000-000000000002',
    ]);
    // Delete the synthetic user's Auth parent last: since #89/0007 that single row owns
    // the whole cleanup chain — the FK cascade takes the profile and any domain row the
    // per-test cleanups missed. It replaces the old profiles-first discipline entirely.
    await client.query("DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001'::uuid");
    await client.end();
  });

  describe('Scenario 1: Schema objects exist and are correctly configured', () => {
    it('should have all 9 tables created', async () => {
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      
      const tableNames = result.rows.map(row => row.table_name);
      const expectedTables = [
        'body_measurements',
        'exercises',
        'import_batches', 
        'personal_records',
        'profiles',
        'routine_days',
        'routine_exercises', 
        'session_sets',
        'session_tasks',
        'sync_mutations',
        'workout_sessions'
      ];
      
      expectedTables.forEach(tableName => {
        expect(tableNames).toContain(tableName);
      });
    });

    it('should have all 5 enum types', async () => {
      const result = await client.query(`
        SELECT typname 
        FROM pg_type 
        WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND typtype = 'e'
        ORDER BY typname
      `);
      
      const enumNames = result.rows.map(row => row.typname);
      const expectedEnums = [
        'session_phase',
        'session_source', 
        'session_status',
        'task_key',
        'weight_unit'
      ];
      
      expectedEnums.forEach(enumName => {
        expect(enumNames).toContain(enumName);
      });
    });

    it('should have weight_sane and reps_sane check constraints on session_sets', async () => {
      const result = await client.query(`
        SELECT con.conname, pg_get_constraintdef(con.oid) as definition
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = connamespace
        WHERE nsp.nspname = 'public'
        AND rel.relname = 'session_sets'
        AND con.contype = 'c'
        ORDER BY con.conname
      `);

      const constraints = result.rows.map(row => ({ 
        name: row.conname, 
        definition: row.definition 
      }));

      const weightConstraint = constraints.find(c => c.name === 'weight_sane');
      expect(weightConstraint).toBeDefined();
      expect(weightConstraint!.definition).toContain('weight_kg >=');
      expect(weightConstraint!.definition).toContain('1000');

      const repsConstraint = constraints.find(c => c.name === 'reps_sane');
      expect(repsConstraint).toBeDefined();  
      expect(repsConstraint!.definition).toContain('reps >=');
      expect(repsConstraint!.definition).toContain('1000');
    });

    it('should have one_active_session_per_day partial unique index', async () => {
      const result = await client.query(`
        SELECT 
          i.relname as index_name,
          pg_get_indexdef(i.oid) as index_definition
        FROM pg_class i
        JOIN pg_index ix ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
        AND t.relname = 'workout_sessions'
        AND i.relname = 'one_active_session_per_day'
      `);

      expect(result.rows).toHaveLength(1);
      const indexDef = result.rows[0].index_definition;
      expect(indexDef).toContain('user_id');
      expect(indexDef).toContain('routine_day_id'); 
      expect(indexDef).toContain('local_date');
      expect(indexDef).toContain("status = 'in_progress'");
    });
  });

  describe('Scenario 2: Check constraints reject invalid data', () => {
    it('should enforce weight_kg 0–1000 constraint', async () => {
      // Create required parent records
      await client.query(`
        INSERT INTO profiles (id, email) 
        VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'test1@example.com')
        ON CONFLICT (id) DO NOTHING
      `);
      
      await client.query(`
        INSERT INTO routine_days (id, slug, name) 
        VALUES ('00000000-0000-0000-0000-000000000002'::uuid, 'test-push', 'Test Push')
        ON CONFLICT (id) DO NOTHING
      `);

      // First insert a valid workout session and exercise to reference
      const sessionResult = await client.query(`
        INSERT INTO workout_sessions 
        (user_id, routine_day_id, client_id, local_date, started_at) 
        VALUES 
        ('00000000-0000-0000-0000-000000000001'::uuid, 
         '00000000-0000-0000-0000-000000000002'::uuid,
         '00000000-0000-0000-0000-000000000003'::uuid,
         '2024-01-01', 
         NOW())
        RETURNING id
      `);
      const sessionId = sessionResult.rows[0].id;

      const exerciseResult = await client.query(`
        INSERT INTO exercises (slug, name, muscle_groups)
        VALUES ('test-bench-press', 'Test Bench Press', '{"chest"}')
        RETURNING id
      `);
      const exerciseId = exerciseResult.rows[0].id;

      // Test: weight too high should fail
      try {
        await client.query(`
          INSERT INTO session_sets 
          (user_id, session_id, exercise_id, set_index, weight_kg, client_ts)
          VALUES 
          ('00000000-0000-0000-0000-000000000001'::uuid, 
           $1, $2, 0, 1500, NOW())
        `, [sessionId, exerciseId]);
        
        throw new Error('Should have failed with check constraint violation');
      } catch (err) {
        expect(pgErrorCode(err)).toBe('23514'); // check_violation
        expect(pgErrorMessage(err)).toContain('weight_sane');
      }

      // Test: negative weight should fail  
      try {
        await client.query(`
          INSERT INTO session_sets 
          (user_id, session_id, exercise_id, set_index, weight_kg, client_ts)
          VALUES 
          ('00000000-0000-0000-0000-000000000001'::uuid, 
           $1, $2, 1, -5, NOW())
        `, [sessionId, exerciseId]);
        
        throw new Error('Should have failed with check constraint violation');
      } catch (err) {
        expect(pgErrorCode(err)).toBe('23514'); // check_violation
        expect(pgErrorMessage(err)).toContain('weight_sane');
      }

      // Cleanup
      await client.query('DELETE FROM session_sets WHERE session_id = $1', [sessionId]);
      await client.query('DELETE FROM workout_sessions WHERE id = $1', [sessionId]);
      await client.query('DELETE FROM exercises WHERE id = $1', [exerciseId]);
    });

    it('should enforce reps 0–1000 constraint', async () => {
      // Setup session and exercise
      const sessionResult = await client.query(`
        INSERT INTO workout_sessions 
        (user_id, routine_day_id, client_id, local_date, started_at) 
        VALUES 
        ('00000000-0000-0000-0000-000000000001'::uuid, 
         '00000000-0000-0000-0000-000000000002'::uuid,
         '00000000-0000-0000-0000-000000000004'::uuid,
         '2024-01-01', 
         NOW())
        RETURNING id
      `);
      const sessionId = sessionResult.rows[0].id;

      const exerciseResult = await client.query(`
        INSERT INTO exercises (slug, name, muscle_groups)
        VALUES ('test-squats', 'Test Squats', '{"legs"}')
        RETURNING id
      `);
      const exerciseId = exerciseResult.rows[0].id;

      // Test: reps too high should fail
      try {
        await client.query(`
          INSERT INTO session_sets 
          (user_id, session_id, exercise_id, set_index, reps, client_ts)
          VALUES 
          ('00000000-0000-0000-0000-000000000001'::uuid, 
           $1, $2, 0, 2000, NOW())
        `, [sessionId, exerciseId]);
        
        throw new Error('Should have failed with check constraint violation');
      } catch (err) {
        expect(pgErrorCode(err)).toBe('23514'); // check_violation
        expect(pgErrorMessage(err)).toContain('reps_sane');
      }

      // Test: negative reps should fail
      try {
        await client.query(`
          INSERT INTO session_sets 
          (user_id, session_id, exercise_id, set_index, reps, client_ts)
          VALUES 
          ('00000000-0000-0000-0000-000000000001'::uuid, 
           $1, $2, 1, -10, NOW())
        `, [sessionId, exerciseId]);
        
        throw new Error('Should have failed with check constraint violation');
      } catch (err) {
        expect(pgErrorCode(err)).toBe('23514'); // check_violation
        expect(pgErrorMessage(err)).toContain('reps_sane');
      }

      // Cleanup
      await client.query('DELETE FROM session_sets WHERE session_id = $1', [sessionId]);
      await client.query('DELETE FROM workout_sessions WHERE id = $1', [sessionId]);
      await client.query('DELETE FROM exercises WHERE id = $1', [exerciseId]);
    });
  });

  describe('Scenario 3: Concurrency guard with partial unique index', () => {
    it('should prevent duplicate in_progress sessions per user/routine_day/date', async () => {
      const userId = '00000000-0000-0000-0000-000000000001';
      const routineDayId = '00000000-0000-0000-0000-000000000002'; 
      const localDate = '2024-01-15';

      // First session should succeed
      const firstSession = await client.query(`
        INSERT INTO workout_sessions 
        (user_id, routine_day_id, client_id, status, local_date, started_at)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'in_progress', $4, NOW())
        RETURNING id
      `, [userId, routineDayId, '00000000-0000-0000-0000-000000000005', localDate]);

      // Second session with same user/routine_day/date should fail due to unique constraint
      try {
        await client.query(`
          INSERT INTO workout_sessions 
          (user_id, routine_day_id, client_id, status, local_date, started_at)
          VALUES ($1::uuid, $2::uuid, $3::uuid, 'in_progress', $4, NOW())
        `, [userId, routineDayId, '00000000-0000-0000-0000-000000000006', localDate]);
        
        throw new Error('Should have failed with unique constraint violation');
      } catch (err) {
        expect(pgErrorCode(err)).toBe('23505'); // unique_violation
        expect(pgErrorMessage(err)).toContain('one_active_session_per_day');
      }

      // But a completed session should be allowed (partial index only on 'in_progress')
      const completedSession = await client.query(`
        INSERT INTO workout_sessions 
        (user_id, routine_day_id, client_id, status, local_date, started_at, completed_at)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'completed', $4, NOW(), NOW())
        RETURNING id
      `, [userId, routineDayId, '00000000-0000-0000-0000-000000000007', localDate]);

      expect(completedSession.rows).toHaveLength(1);

      // Cleanup
      await client.query('DELETE FROM workout_sessions WHERE id = ANY($1)', [
        [firstSession.rows[0].id, completedSession.rows[0].id]
      ]);
    });
  });

  describe('Scenario 4: Natural key enables idempotent upserts', () => {
    it('should allow ON CONFLICT on natural key for session_sets', async () => {
      // Setup session and exercise
      const sessionResult = await client.query(`
        INSERT INTO workout_sessions 
        (user_id, routine_day_id, client_id, local_date, started_at) 
        VALUES 
        ('00000000-0000-0000-0000-000000000001'::uuid, 
         '00000000-0000-0000-0000-000000000002'::uuid,
         '00000000-0000-0000-0000-000000000008'::uuid,
         '2024-01-01', 
         NOW())
        RETURNING id
      `);
      const sessionId = sessionResult.rows[0].id;

      const exerciseResult = await client.query(`
        INSERT INTO exercises (slug, name, muscle_groups)
        VALUES ('test-deadlift', 'Test Deadlift', '{"back"}')
        RETURNING id
      `);
      const exerciseId = exerciseResult.rows[0].id;

      // First insert
      await client.query(`
        INSERT INTO session_sets 
        (user_id, session_id, exercise_id, set_index, weight_kg, reps, client_ts)
        VALUES 
        ('00000000-0000-0000-0000-000000000001'::uuid, 
         $1, $2, 0, 100.5, 5, NOW())
      `, [sessionId, exerciseId]);

      // Second insert with same natural key (session_id, exercise_id, set_index)
      // should be possible with ON CONFLICT DO UPDATE
      const result = await client.query(`
        INSERT INTO session_sets 
        (user_id, session_id, exercise_id, set_index, weight_kg, reps, client_ts)
        VALUES 
        ('00000000-0000-0000-0000-000000000001'::uuid, 
         $1, $2, 0, 110.0, 6, NOW())
        ON CONFLICT (session_id, exercise_id, set_index) 
        DO UPDATE SET 
          weight_kg = EXCLUDED.weight_kg,
          reps = EXCLUDED.reps,
          updated_at = NOW()
        RETURNING weight_kg, reps
      `, [sessionId, exerciseId]);

      expect(result.rows).toHaveLength(1);
      expect(Number(result.rows[0].weight_kg)).toBe(110.0);
      expect(result.rows[0].reps).toBe(6);

      // Verify only one row exists
      const countResult = await client.query(
        'SELECT COUNT(*) FROM session_sets WHERE session_id = $1 AND exercise_id = $2 AND set_index = 0',
        [sessionId, exerciseId]
      );
      expect(Number(countResult.rows[0].count)).toBe(1);

      // Cleanup
      await client.query('DELETE FROM session_sets WHERE session_id = $1', [sessionId]);
      await client.query('DELETE FROM workout_sessions WHERE id = $1', [sessionId]);
      await client.query('DELETE FROM exercises WHERE id = $1', [exerciseId]);
    });
  });
});