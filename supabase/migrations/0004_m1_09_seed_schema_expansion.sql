-- M1-09 expand phase: preserve legacy exercise programming without lossy casts.
--
-- target_reps remains the existing integer compatibility column. New readers
-- should use target_reps_range, which preserves values such as "8-10" exactly.
-- rest_time is text because the sources mix ranges and exact seconds.

ALTER TABLE public.exercises
  ADD COLUMN beginner_notes text;

ALTER TABLE public.routine_exercises
  ADD COLUMN target_reps_range text,
  ADD COLUMN rest_time text;

-- The 18 M1-09 exercises are each canonical to one day. The per-day
-- uniqueness rule still permits future shared content, such as M1-10 stretches,
-- to be associated with more than one routine day.
CREATE UNIQUE INDEX routine_exercises_day_exercise
  ON public.routine_exercises (routine_day_id, exercise_id);
