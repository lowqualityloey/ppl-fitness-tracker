-- M4-00 (#89): Make Auth-user deletion cascade to the profile — and to everything under it.
--
-- ADR-0002 / STATE §4 item 2 say `profiles.id` IS `auth.users.id`, but until now that was a
-- prose agreement: `profiles` carried no foreign key to `auth.users`, so deleting an Auth user
-- left the profile row (and every domain row cascading from it) stranded. Fixture teardown had
-- been ordered around the missing FK ("remove domain data/profiles before Auth users"), and
-- years of fixture residue proved what happens when that order is missed — the local database
-- held 2 026 profile rows whose auth.users parent was gone (measured on 2026-09-12, pre-fix).
--
-- Every domain table already cascades from `profiles` (0000), so one FK closes the whole
-- chain: auth.users -> profiles -> sessions/sets/tasks/records/mutations/batches. This is the
-- evaluation STATE §5 deferred to "before production hardening"; the decision — cascade rather
-- than restrict, and repair rather than tolerate residue — is recorded in ADR-0006 and
-- docs/STATE.md §5 (M4-00).
--
-- Expand→Contract (STATE §4 item 12): pure Expand. Nothing is dropped; no application code
-- changes; fixture-side cleanup keeps working either way because deleting a profile before its
-- auth user, or relying on the cascade, are both legal orders from here on.
--
-- The DELETE before the ADD exists because a validated constraint cannot coexist with the
-- residue, and because such rows were never *data* in any reachable sense: with no auth.users
-- parent no JWT can exist, so both authorization layers (app-layer scoping and RLS via
-- auth.uid()) can never return them. They are stranded fixture debris, and the NOTICE reports
-- the count on every apply so the number is measured, not assumed (fresh databases: zero).
--
-- Runs owner-only via the Supabase CLI apply path (`supabase start` / `db reset` as postgres,
-- STATE §4 item 18). Creating an FK INTO the auth schema is a migration-time privilege; the
-- runtime app role needs no auth-schema access for the cascade to work, and gains none
-- (ADR-0003 Amendment A1.2 unchanged). Enforcement is physical: verified on the local
-- stack by tests/integration/auth-user-cascade.test.ts (#89), which deletes real GoTrue
-- users over the admin API — the production deletion path — and watches the rows vanish.
--
-- Idempotent by guard (0001 convention): the cleanup and the ADD run once per database; a
-- re-apply against a database that already has the constraint is a no-op.

DO $$
DECLARE
  stranded bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.profiles'::regclass
       AND conname = 'profiles_id_auth_users_fkey'
  ) THEN
    DELETE FROM public.profiles p
     WHERE NOT EXISTS (
       SELECT 1 FROM auth.users u WHERE u.id = p.id
     );
    GET DIAGNOSTICS stranded = ROW_COUNT;
    IF stranded > 0 THEN
      RAISE NOTICE 'M4-00/0007: deleted % stranded profile row(s) with no auth.users parent (issue #89)', stranded;
    END IF;

    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_auth_users_fkey
      FOREIGN KEY (id) REFERENCES auth.users (id)
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END $$;
