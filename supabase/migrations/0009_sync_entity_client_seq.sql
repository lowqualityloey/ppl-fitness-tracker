-- 0009: record the sender's outbox position on a sync entity version (#78).
--
-- Two writes to one entity that arrive in the same millisecond are ordered by
-- this column instead of by a random UUID. The column is additive and backfills
-- 0, which the comparison reads as "unknown" and hands to the previous
-- tie-breaker, so every pre-existing row keeps the verdict it already has.
--
-- Expand phase only: nothing reads the column to decide a historical outcome,
-- so an application reverted to the previous release keeps working against a
-- migrated database.

ALTER TABLE public.sync_entity_versions
  ADD COLUMN IF NOT EXISTS client_seq integer NOT NULL DEFAULT 0;

ALTER TABLE public.sync_entity_versions
  ADD CONSTRAINT sync_entity_versions_client_seq_nonnegative
  CHECK (client_seq >= 0);
