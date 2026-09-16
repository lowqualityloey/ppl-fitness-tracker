-- M4-20 (#109): body measurements — the table the apology card promised.
-- Expand-phase shape per ADR-0003/STATE item 25: hand-authored SQL, additive,
-- no contract steps. The row identity is the triple (user_id, measured_on,
-- kind): a correction is an UPSERT, not a second row and not an id-keyed
-- update path this contract deliberately does not have.
--
-- Units ride in the kind names (ADR-0005): body_weight is kg, *_cm centimeters,
-- body_fat_pct a percentage. numeric(6,2) 0–1000 is the one scalar for all
-- three families — the same decision WeightKgSchema makes on the wire, so a
-- payload these schemas reject and one the CHECK rejects are the same event.

CREATE TABLE public.body_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  measured_on date NOT NULL,
  kind text NOT NULL,
  value numeric(6,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT body_measurements_kind_valid
    CHECK (kind IN ('body_weight', 'body_fat_pct', 'neck_cm', 'waist_cm', 'chest_cm', 'hip_cm')),
  CONSTRAINT body_measurements_value_sane
    CHECK (value >= 0 AND value <= 1000),
  CONSTRAINT body_measurements_user_day_kind_unique
    UNIQUE (user_id, measured_on, kind)
);

CREATE INDEX body_measurements_user_range_lookup
  ON public.body_measurements (user_id, measured_on);

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements FORCE ROW LEVEL SECURITY;


-- Four discrete policies per ADR-0003 — never FOR ALL (STATE §4 item 6). The
-- (SELECT auth.uid()) wrapper is deliberate: it evaluates the claim once per
-- statement instead of per row. user_id is the only relationship this table
-- has, so the direct check is complete — the dual-FK hazard 0006 had to
-- cross-check does not exist here.

DROP POLICY IF EXISTS body_measurements_select ON public.body_measurements;
CREATE POLICY body_measurements_select ON public.body_measurements
  FOR SELECT TO app_authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS body_measurements_insert ON public.body_measurements;
CREATE POLICY body_measurements_insert ON public.body_measurements
  FOR INSERT TO app_authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS body_measurements_update ON public.body_measurements;
CREATE POLICY body_measurements_update ON public.body_measurements
  FOR UPDATE TO app_authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS body_measurements_delete ON public.body_measurements;
CREATE POLICY body_measurements_delete ON public.body_measurements
  FOR DELETE TO app_authenticated
  USING (user_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.body_measurements TO app_authenticated;
