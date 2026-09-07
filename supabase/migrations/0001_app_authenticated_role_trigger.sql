-- M1-04: Create app_authenticated role and handle_new_user trigger
-- 
-- Ported from the verified M0 spike (spikes/m0-drizzle-rls/sql/001-setup.sql)
-- with corrections from Amendment A1. This role is the target of all RLS
-- policies (M1-05, M1-06) and the foundation of the two-layer auth strategy.

-- ---------------------------------------------------------------------------
-- 1. The non-owner application role
-- ---------------------------------------------------------------------------
-- Critical attributes:
-- - NOBYPASSRLS: cannot bypass RLS policies (load-bearing for tenancy)
-- - NOSUPERUSER: cannot escalate privileges
-- - NOINHERIT: cannot inherit BYPASSRLS from any granted role
-- - LOGIN: can connect (but only with valid password)
--
-- Created once, never ALTERed for attributes. Per Amendment A1.4, subsequent
-- ALTER ROLE attempts on superuser-adjacent attributes fail with 42501 on
-- Supabase. Attribute drift is caught by tests, not silently repaired.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_authenticated') THEN
    CREATE ROLE app_authenticated LOGIN PASSWORD 'Wd7EmwRWWqY9s7jMVD3kVqnt+OaW5PowxNIxCY5Ful0='
      NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

-- Grant minimal schema access: public only, no auth schema
-- Per Amendment A1.2: GRANT USAGE ON SCHEMA auth TO app_authenticated has no
-- effect on Supabase (auth is owned by supabase_admin, grant is discarded)
-- and is not needed (RLS policies resolve auth.uid() regardless of querying
-- role's schema privileges).
GRANT USAGE ON SCHEMA public TO app_authenticated;

-- ---------------------------------------------------------------------------
-- 2. Profile creation trigger
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: runs with creator's privileges (postgres/owner), not
-- invoker's (supabase_auth_admin has no rights on public.profiles)
-- 
-- SET search_path = '': defeats search_path hijacking attacks on SECURITY
-- DEFINER functions by pinning the search path to empty (no schemas)
--
-- ON CONFLICT DO NOTHING: idempotent, handles duplicate auth.users INSERTs
-- (edge case in GoTrue admin API usage)

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

-- Install trigger on auth.users table
-- AFTER INSERT: runs after the auth.users row is committed
-- FOR EACH ROW: fires once per inserted user

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();