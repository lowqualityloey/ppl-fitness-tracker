-- M1-06: Row Level Security policies for user-data tables
--
-- All seven tables where every row belongs to exactly one user:
-- profiles, workout_sessions, session_sets, session_tasks, 
-- personal_records, sync_mutations, import_batches
--
-- Policy pattern: user_id = (SELECT auth.uid()) for FK columns,
--                 id = (SELECT auth.uid()) for profiles (PK is user ID)
--
-- Four discrete policies per table (SELECT/INSERT/UPDATE/DELETE), never FOR ALL.
-- Scalar subselect pattern for planner optimization: (SELECT auth.uid())
--
-- This completes RLS coverage for all application tables.
-- Combined with M1-05 (content tables), every table now has defense-in-depth
-- protection against forgotten WHERE clauses in application code.

-- ---------------------------------------------------------------------------
-- 1. Enable ROW LEVEL SECURITY on all 7 user-data tables
-- ---------------------------------------------------------------------------

-- ENABLE: Activates RLS for all non-superuser roles
-- FORCE: Ensures RLS applies even to table owners and privileged roles
-- Both required per ADR-0003 for complete protection

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.session_sets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_sets     FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.session_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_tasks    FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_records FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.sync_mutations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_mutations   FORCE  ROW LEVEL SECURITY;

ALTER TABLE public.import_batches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches   FORCE  ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Policies for profiles table
-- ---------------------------------------------------------------------------

-- profiles.id IS the user ID (references auth.users.id)
-- Policy predicate: id = (SELECT auth.uid()) for all operations
-- UPDATE includes WITH CHECK to prevent users from changing their own ID

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO app_authenticated USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO app_authenticated WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO app_authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles
  FOR DELETE TO app_authenticated USING (id = (SELECT auth.uid()));
-- ---------------------------------------------------------------------------
-- 3. Policies for workout_sessions table
-- ---------------------------------------------------------------------------

-- workout_sessions.user_id references profiles.id (which is auth.users.id)
-- Policy predicate: user_id = (SELECT auth.uid()) for all operations

DROP POLICY IF EXISTS workout_sessions_select ON public.workout_sessions;
CREATE POLICY workout_sessions_select ON public.workout_sessions
  FOR SELECT TO app_authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS workout_sessions_insert ON public.workout_sessions;
CREATE POLICY workout_sessions_insert ON public.workout_sessions
  FOR INSERT TO app_authenticated WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS workout_sessions_update ON public.workout_sessions;
CREATE POLICY workout_sessions_update ON public.workout_sessions
  FOR UPDATE TO app_authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS workout_sessions_delete ON public.workout_sessions;
CREATE POLICY workout_sessions_delete ON public.workout_sessions
  FOR DELETE TO app_authenticated USING (user_id = (SELECT auth.uid()));
-- ---------------------------------------------------------------------------
-- 4. Policies for session_sets table
-- ---------------------------------------------------------------------------

-- session_sets.user_id references profiles.id (which is auth.users.id)
-- Policy predicate: user_id = (SELECT auth.uid()) for all operations
-- Ported directly from proven M0 spike policies

DROP POLICY IF EXISTS session_sets_select ON public.session_sets;
CREATE POLICY session_sets_select ON public.session_sets
  FOR SELECT TO app_authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS session_sets_insert ON public.session_sets;
CREATE POLICY session_sets_insert ON public.session_sets
  FOR INSERT TO app_authenticated WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS session_sets_update ON public.session_sets;
CREATE POLICY session_sets_update ON public.session_sets
  FOR UPDATE TO app_authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS session_sets_delete ON public.session_sets;
CREATE POLICY session_sets_delete ON public.session_sets
  FOR DELETE TO app_authenticated USING (user_id = (SELECT auth.uid()));
-- ---------------------------------------------------------------------------
-- 5. Policies for session_tasks table
-- ---------------------------------------------------------------------------

-- session_tasks references user indirectly via session_id -> workout_sessions.user_id
-- Policy predicate: session_id IN (SELECT id FROM workout_sessions WHERE user_id = auth.uid())
-- This ensures tasks are only accessible through sessions owned by the current user

DROP POLICY IF EXISTS session_tasks_select ON public.session_tasks;
CREATE POLICY session_tasks_select ON public.session_tasks
  FOR SELECT TO app_authenticated 
  USING (session_id IN (SELECT id FROM workout_sessions WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS session_tasks_insert ON public.session_tasks;
CREATE POLICY session_tasks_insert ON public.session_tasks
  FOR INSERT TO app_authenticated 
  WITH CHECK (session_id IN (SELECT id FROM workout_sessions WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS session_tasks_update ON public.session_tasks;
CREATE POLICY session_tasks_update ON public.session_tasks
  FOR UPDATE TO app_authenticated
  USING (session_id IN (SELECT id FROM workout_sessions WHERE user_id = (SELECT auth.uid()))) 
  WITH CHECK (session_id IN (SELECT id FROM workout_sessions WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS session_tasks_delete ON public.session_tasks;
CREATE POLICY session_tasks_delete ON public.session_tasks
  FOR DELETE TO app_authenticated 
  USING (session_id IN (SELECT id FROM workout_sessions WHERE user_id = (SELECT auth.uid())));

-- ---------------------------------------------------------------------------
-- 6. Policies for personal_records table
-- ---------------------------------------------------------------------------

-- personal_records.user_id references profiles.id (which is auth.users.id)
-- Policy predicate: user_id = (SELECT auth.uid()) for all operations

DROP POLICY IF EXISTS personal_records_select ON public.personal_records;
CREATE POLICY personal_records_select ON public.personal_records
  FOR SELECT TO app_authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS personal_records_insert ON public.personal_records;
CREATE POLICY personal_records_insert ON public.personal_records
  FOR INSERT TO app_authenticated WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS personal_records_update ON public.personal_records;
CREATE POLICY personal_records_update ON public.personal_records
  FOR UPDATE TO app_authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS personal_records_delete ON public.personal_records;
CREATE POLICY personal_records_delete ON public.personal_records
  FOR DELETE TO app_authenticated USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. Policies for sync_mutations table
-- ---------------------------------------------------------------------------

-- sync_mutations.user_id references profiles.id (which is auth.users.id)
-- Policy predicate: user_id = (SELECT auth.uid()) for all operations
-- Note: Application may only INSERT in practice, but all four policies
-- required per ADR-0003 ("never FOR ALL" is not conditional on usage patterns)

DROP POLICY IF EXISTS sync_mutations_select ON public.sync_mutations;
CREATE POLICY sync_mutations_select ON public.sync_mutations
  FOR SELECT TO app_authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS sync_mutations_insert ON public.sync_mutations;
CREATE POLICY sync_mutations_insert ON public.sync_mutations
  FOR INSERT TO app_authenticated WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS sync_mutations_update ON public.sync_mutations;
CREATE POLICY sync_mutations_update ON public.sync_mutations
  FOR UPDATE TO app_authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS sync_mutations_delete ON public.sync_mutations;
CREATE POLICY sync_mutations_delete ON public.sync_mutations
  FOR DELETE TO app_authenticated USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 8. Policies for import_batches table
-- ---------------------------------------------------------------------------

-- import_batches.user_id references profiles.id (which is auth.users.id)
-- Policy predicate: user_id = (SELECT auth.uid()) for all operations
-- Note: Application may only INSERT in practice, but all four policies
-- required per ADR-0003 ("never FOR ALL" is not conditional on usage patterns)

DROP POLICY IF EXISTS import_batches_select ON public.import_batches;
CREATE POLICY import_batches_select ON public.import_batches
  FOR SELECT TO app_authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS import_batches_insert ON public.import_batches;
CREATE POLICY import_batches_insert ON public.import_batches
  FOR INSERT TO app_authenticated WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS import_batches_update ON public.import_batches;
CREATE POLICY import_batches_update ON public.import_batches
  FOR UPDATE TO app_authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS import_batches_delete ON public.import_batches;
CREATE POLICY import_batches_delete ON public.import_batches
  FOR DELETE TO app_authenticated USING (user_id = (SELECT auth.uid()));
-- ---------------------------------------------------------------------------
-- 9. Table privileges for app_authenticated role
-- ---------------------------------------------------------------------------

-- RLS is a filter on top of GRANTs, not a replacement for them.
-- Without these grants, app_authenticated gets "permission denied for table"
-- instead of RLS-filtered results. Defense-in-depth: GRANT + RLS policy.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles         TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_sessions TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_sets     TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_tasks    TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_records TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_mutations   TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches   TO app_authenticated;