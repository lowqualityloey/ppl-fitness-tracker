-- M0 spike schema. Run as the OWNER role (postgres) via MIGRATION_DATABASE_URL.
--
-- Deliberately minimal: two tables, the smallest shape that still exercises
-- every claim in spec §4.2. profiles.id IS auth.users.id (ADR-0002), and
-- session_sets.user_id points at profiles.id so policies can compare it to
-- auth.uid() with no resolver function.
--
-- Idempotent so the harness can re-run it without a teardown dance.

-- ---------------------------------------------------------------------------
-- 1. The non-owner application role.
-- ---------------------------------------------------------------------------
-- NOBYPASSRLS is the load-bearing attribute. NOINHERIT keeps it from picking up
-- BYPASSRLS via some future GRANT of a privileged role. It owns nothing.
-- Note: created, never re-ALTERed. On the stock Supabase image the `postgres`
-- role may CREATE a role with these attributes but is refused when it tries to
-- ALTER superuser-adjacent attributes afterwards (supautils raises 42501:
-- "Only roles with the SUPERUSER attribute may alter roles with the SUPERUSER
-- attribute"). So attribute correctness is asserted by
-- tests/01-non-vacuity.test.ts instead of being re-forced here. That is the
-- better arrangement anyway: a drifted role fails a test rather than being
-- silently repaired.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_authenticated') THEN
    CREATE ROLE app_authenticated LOGIN PASSWORD 'spike_only_not_a_secret'
      NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_authenticated;

-- Deliberately NOT granted: USAGE on schema auth.
--
-- Two findings behind that, both measured (see the spike write-up):
--
--   1. `GRANT USAGE ON SCHEMA auth TO app_authenticated` issued by the
--      `postgres` role returns success and changes nothing.
--      has_schema_privilege() still reports false afterwards. The auth schema
--      is owned by supabase_admin and the grant is silently discarded. A
--      migration can therefore appear to grant a privilege it did not grant.
--
--   2. It is not needed. RLS policy expressions that call auth.uid() evaluate
--      correctly even though the querying role has no USAGE on auth — the
--      policy expression is not subject to the querying role's schema check.
--      Verified both directions: 1 row with claims set, 0 without.
--
-- Consequence: the app role has no reach into the auth schema at all, which is
-- a stricter posture than the spec assumed. Application code must never call
-- auth.uid() directly; it gets the user id from requireUser() instead.

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id             uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email          text NOT NULL,
  display_name   text,
  preferred_unit text NOT NULL DEFAULT 'kg',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_sets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  exercise_slug text NOT NULL,
  set_index    integer NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  weight_kg    numeric(6, 2),
  reps         integer,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weight_sane CHECK (weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 1000)),
  CONSTRAINT reps_sane   CHECK (reps IS NULL OR (reps >= 0 AND reps <= 1000))
);

-- A table with NO policies at all. Exists purely so the pg_tables drift test in
-- tests/03-drift.test.ts has something to catch. Mirrors the real failure mode:
-- a future migration adds a table and forgets RLS.
CREATE TABLE IF NOT EXISTS public.unprotected_future_table (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  secret  text NOT NULL
);
GRANT SELECT ON public.unprotected_future_table TO app_authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS. ENABLE + FORCE on every table.
-- ---------------------------------------------------------------------------
-- FORCE matters because the owner (postgres) would otherwise bypass its own
-- policies. It does not help against a role with the BYPASSRLS *attribute* —
-- that is what NOBYPASSRLS on app_authenticated is for. Two different escapes.
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles      FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.session_sets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_sets  FORCE  ROW LEVEL SECURITY;

-- Four discrete policies, never FOR ALL. auth.uid() wrapped in a scalar
-- subselect so the planner hoists it out of the per-row loop.
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
-- 4. Table privileges for the app role
-- ---------------------------------------------------------------------------
-- RLS is a filter on top of GRANTs, not a replacement for them. Without these
-- the app role gets "permission denied for table", which is a different
-- (and misleadingly reassuring) failure than "0 rows".
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles     TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_sets TO app_authenticated;

-- ---------------------------------------------------------------------------
-- 5. handle_new_user trigger (spec M1) — verified cheaply here
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because auth.users triggers run as supabase_auth_admin,
-- which has no rights on public.profiles. search_path is pinned to defeat
-- search_path hijacking on a SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
