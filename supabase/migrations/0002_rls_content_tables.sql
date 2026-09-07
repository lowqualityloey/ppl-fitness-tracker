-- M1-05: RLS on content tables (exercises, routine_days, routine_exercises)
--
-- Implements RLS for shared content tables per ADR-0003 and spec §4.2.
-- These tables contain both system-seeded rows (owner_user_id IS NULL) readable 
-- by all users, and user-specific override rows (owner_user_id = user_id) that
-- are read/write scoped to the owner only.

-- ---------------------------------------------------------------------------
-- 1. Enable RLS on content tables
-- ---------------------------------------------------------------------------

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises FORCE ROW LEVEL SECURITY;

ALTER TABLE routine_days ENABLE ROW LEVEL SECURITY; 
ALTER TABLE routine_days FORCE ROW LEVEL SECURITY;

ALTER TABLE routine_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_exercises FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. RLS Policies for exercises table
-- ---------------------------------------------------------------------------
-- Policy shape: system rows (owner_user_id IS NULL) are readable by everyone,
-- user override rows are read/write scoped to owner only.

-- SELECT: system rows + own overrides
CREATE POLICY "Users can read system exercises and their own overrides" 
ON exercises FOR SELECT 
TO app_authenticated 
USING (owner_user_id IS NULL OR owner_user_id = (SELECT auth.uid()));

-- INSERT: only own overrides (cannot create system rows)
CREATE POLICY "Users can create their own exercise overrides"
ON exercises FOR INSERT
TO app_authenticated
WITH CHECK (owner_user_id = (SELECT auth.uid()));

-- UPDATE: only own overrides (cannot modify system rows)
CREATE POLICY "Users can update their own exercise overrides"
ON exercises FOR UPDATE
TO app_authenticated  
USING (owner_user_id = (SELECT auth.uid()))
WITH CHECK (owner_user_id = (SELECT auth.uid()));

-- DELETE: only own overrides (cannot delete system rows)
CREATE POLICY "Users can delete their own exercise overrides"
ON exercises FOR DELETE
TO app_authenticated
USING (owner_user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. RLS Policies for routine_days table  
-- ---------------------------------------------------------------------------
-- Decision: routine_days contains only system rows in v1 (push/pull/legs).
-- No user overrides are supported, so policies are simpler: read-only for
-- system rows, no write access to any rows.

-- SELECT: system rows only (owner_user_id IS NULL)
CREATE POLICY "Users can read system routine days"
ON routine_days FOR SELECT
TO app_authenticated
USING (owner_user_id IS NULL);

-- INSERT: denied (no user-created routine days in v1)
CREATE POLICY "Users cannot create routine days"
ON routine_days FOR INSERT
TO app_authenticated
WITH CHECK (false);

-- UPDATE: denied (no user modifications to system routine days)
CREATE POLICY "Users cannot update routine days"
ON routine_days FOR UPDATE
TO app_authenticated
USING (false);

-- DELETE: denied (no user deletions of system routine days)
CREATE POLICY "Users cannot delete routine days" 
ON routine_days FOR DELETE
TO app_authenticated
USING (false);

-- ---------------------------------------------------------------------------
-- 4. RLS Policies for routine_exercises table
-- ---------------------------------------------------------------------------
-- Decision: routine_exercises links exercises to routine_days. In v1, these
-- are system-defined associations (no owner_user_id), but users should be
-- able to read them to see which exercises belong to which days.
-- No user modifications supported in v1.

-- SELECT: all rows (system associations)
CREATE POLICY "Users can read routine exercise associations"
ON routine_exercises FOR SELECT
TO app_authenticated
USING (true);

-- INSERT: denied (no user-created routine associations in v1)
CREATE POLICY "Users cannot create routine exercise associations"
ON routine_exercises FOR INSERT
TO app_authenticated
WITH CHECK (false);

-- UPDATE: denied (no user modifications to system associations)
CREATE POLICY "Users cannot update routine exercise associations"
ON routine_exercises FOR UPDATE
TO app_authenticated
USING (false);

-- DELETE: denied (no user deletions of system associations)
CREATE POLICY "Users cannot delete routine exercise associations"
ON routine_exercises FOR DELETE
TO app_authenticated
USING (false);

-- ---------------------------------------------------------------------------
-- 5. Grant table-level permissions to app_authenticated
-- ---------------------------------------------------------------------------
-- RLS is a filter on top of GRANT, not a substitute. The app role needs
-- table-level permissions for RLS policies to execute properly.

GRANT SELECT, INSERT, UPDATE, DELETE ON exercises TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON routine_days TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON routine_exercises TO app_authenticated;