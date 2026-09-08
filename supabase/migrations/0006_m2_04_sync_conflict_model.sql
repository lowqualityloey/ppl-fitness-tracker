-- M2-04 Expand phase: additive sync metadata, entity versions, and per-session changes.
-- Keep workout_sessions.server_seq as integer/per-session for compatibility. This
-- migration intentionally does not drop or contract any legacy column.

ALTER TABLE public.sync_mutations
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS device_id uuid,
  ADD COLUMN IF NOT EXISTS operation text,
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS server_seq integer,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.sync_mutations
  ADD CONSTRAINT sync_mutations_status_valid
    CHECK (status IS NULL OR status IN ('processing', 'applied', 'rejected')),
  ADD CONSTRAINT sync_mutations_operation_valid
    CHECK (operation IS NULL OR operation IN ('set.upsert', 'task.complete', 'phase.advance', 'session.finish'));

CREATE INDEX sync_mutations_session_lookup
  ON public.sync_mutations (user_id, session_id, applied_at);

CREATE INDEX sync_mutations_sequence_lookup
  ON public.sync_mutations (user_id, session_id, server_seq);

CREATE TABLE public.sync_entity_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  client_ts timestamptz NOT NULL,
  effective_ts timestamptz NOT NULL,
  device_id uuid NOT NULL,
  mutation_id uuid NOT NULL REFERENCES public.sync_mutations(mutation_id) ON DELETE CASCADE,
  server_seq integer NOT NULL,
  CONSTRAINT sync_entity_versions_entity_type_valid
    CHECK (entity_type IN ('set', 'task', 'session')),
  CONSTRAINT sync_entity_versions_entity_key_unique
    UNIQUE (session_id, entity_type, entity_key)
);

CREATE INDEX sync_entity_versions_session_lookup
  ON public.sync_entity_versions (user_id, session_id);

CREATE INDEX sync_entity_versions_sequence_lookup
  ON public.sync_entity_versions (session_id, server_seq);

CREATE TABLE public.sync_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  server_seq integer NOT NULL,
  mutation_id uuid NOT NULL REFERENCES public.sync_mutations(mutation_id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  operation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sync_changes_entity_type_valid
    CHECK (entity_type IN ('set', 'task', 'session')),
  CONSTRAINT sync_changes_operation_valid
    CHECK (operation IN ('set.upsert', 'task.complete', 'phase.advance', 'session.finish')),
  CONSTRAINT sync_changes_session_sequence_unique
    UNIQUE (session_id, server_seq),
  CONSTRAINT sync_changes_session_mutation_unique
    UNIQUE (session_id, mutation_id)
);

CREATE INDEX sync_changes_sequence_lookup
  ON public.sync_changes (user_id, session_id, server_seq);

-- M2-04 also hardens the legacy ledger policies. The nullable session_id is
-- allowed for pre-M2-04 rows, but when present it must belong to the same user.
DROP POLICY IF EXISTS sync_mutations_select ON public.sync_mutations;
CREATE POLICY sync_mutations_select ON public.sync_mutations
  FOR SELECT TO app_authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (session_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    ))
  );
DROP POLICY IF EXISTS sync_mutations_insert ON public.sync_mutations;
CREATE POLICY sync_mutations_insert ON public.sync_mutations
  FOR INSERT TO app_authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (session_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    ))
  );
DROP POLICY IF EXISTS sync_mutations_update ON public.sync_mutations;
CREATE POLICY sync_mutations_update ON public.sync_mutations
  FOR UPDATE TO app_authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (session_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    ))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (session_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    ))
  );
DROP POLICY IF EXISTS sync_mutations_delete ON public.sync_mutations;
CREATE POLICY sync_mutations_delete ON public.sync_mutations
  FOR DELETE TO app_authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (session_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    ))
  );

-- New user-owned tables follow ADR-0003: FORCE RLS, four discrete policies,
-- explicit grants, and relationship checks for both the owned session and
-- mutation ledger row. Direct user_id checks alone are not sufficient because
-- both foreign keys can otherwise be pointed at another user's data.
ALTER TABLE public.sync_entity_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_entity_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sync_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_changes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_entity_versions_select ON public.sync_entity_versions;
CREATE POLICY sync_entity_versions_select ON public.sync_entity_versions
  FOR SELECT TO app_authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.sync_mutations m
      WHERE m.mutation_id = sync_entity_versions.mutation_id AND m.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS sync_entity_versions_insert ON public.sync_entity_versions;
CREATE POLICY sync_entity_versions_insert ON public.sync_entity_versions
  FOR INSERT TO app_authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.sync_mutations m
      WHERE m.mutation_id = sync_entity_versions.mutation_id AND m.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS sync_entity_versions_update ON public.sync_entity_versions;
CREATE POLICY sync_entity_versions_update ON public.sync_entity_versions
  FOR UPDATE TO app_authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.sync_mutations m
      WHERE m.mutation_id = sync_entity_versions.mutation_id AND m.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.sync_mutations m
      WHERE m.mutation_id = sync_entity_versions.mutation_id AND m.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS sync_entity_versions_delete ON public.sync_entity_versions;
CREATE POLICY sync_entity_versions_delete ON public.sync_entity_versions
  FOR DELETE TO app_authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.sync_mutations m
      WHERE m.mutation_id = sync_entity_versions.mutation_id AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS sync_changes_select ON public.sync_changes;
CREATE POLICY sync_changes_select ON public.sync_changes
  FOR SELECT TO app_authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.sync_mutations m
      WHERE m.mutation_id = sync_changes.mutation_id AND m.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS sync_changes_insert ON public.sync_changes;
CREATE POLICY sync_changes_insert ON public.sync_changes
  FOR INSERT TO app_authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.sync_mutations m
      WHERE m.mutation_id = sync_changes.mutation_id AND m.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS sync_changes_update ON public.sync_changes;
CREATE POLICY sync_changes_update ON public.sync_changes
  FOR UPDATE TO app_authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.sync_mutations m
      WHERE m.mutation_id = sync_changes.mutation_id AND m.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.sync_mutations m
      WHERE m.mutation_id = sync_changes.mutation_id AND m.user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS sync_changes_delete ON public.sync_changes;
CREATE POLICY sync_changes_delete ON public.sync_changes
  FOR DELETE TO app_authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = session_id AND s.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.sync_mutations m
      WHERE m.mutation_id = sync_changes.mutation_id AND m.user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_entity_versions TO app_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_changes TO app_authenticated;
