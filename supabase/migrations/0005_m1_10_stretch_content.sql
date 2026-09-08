-- M1-10 expand phase: model stretches as non-liftable exercise content.
-- Existing exercises default to strength; stretch target programming is nullable
-- because duration is stored on the content row instead of in rest_time/reps.

CREATE TYPE public.exercise_kind AS ENUM ('strength', 'stretch');
CREATE TYPE public.routine_exercise_phase AS ENUM ('main_workout', 'stretch');

ALTER TABLE public.exercises
  ADD COLUMN kind public.exercise_kind NOT NULL DEFAULT 'strength',
  ADD COLUMN duration_seconds integer,
  ADD CONSTRAINT exercise_kind_duration_consistent
    CHECK (
      (kind = 'stretch' AND duration_seconds IS NOT NULL AND duration_seconds > 0)
      OR (kind = 'strength' AND duration_seconds IS NULL)
    );

ALTER TABLE public.routine_exercises
  ALTER COLUMN target_sets DROP NOT NULL,
  ALTER COLUMN target_reps DROP NOT NULL,
  ADD COLUMN phase public.routine_exercise_phase NOT NULL DEFAULT 'main_workout';

DROP INDEX public.routine_exercises_day_order;
CREATE UNIQUE INDEX routine_exercises_day_phase_order
  ON public.routine_exercises (routine_day_id, phase, order_index);
