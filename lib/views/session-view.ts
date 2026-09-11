import { z } from 'zod';
import {
  LocalDateSchema,
  SessionPhaseSchema,
  SessionStatusSchema,
} from '../contracts/common';

/**
 * What the read-only session screen requires of a `SessionState` payload.
 *
 * This schema exists because the API contract cannot be trusted to describe it.
 * `SessionStateSchema` (lib/contracts/sessions.ts) is `z.object({}).passthrough()`
 * — an M2-01 placeholder that was never closed — so `GET /api/sessions/[id]`
 * validates the session graph's *envelope* and nothing about its contents, and
 * `z.infer` of it is `Record<string, unknown>`. A page written against that type
 * would compile while reading `undefined` weights, which is how a screen ends up
 * printing "— kg" for a set that recorded 100.
 *
 * The enums come from `lib/contracts/common.ts` rather than being restated here.
 * That is not tidiness: writing this file against memory produced
 * `['in_progress','archived','abandoned']` and `['strength','stretch']`, and the
 * database enums are `['in_progress','completed','archived']` and five phases
 * (`pre_workout`, `exercise`, `rest`, `stretch`, `post_workout`). A hand-copied
 * enum is a second source of truth that is wrong from birth, and `.strict()`-free
 * parsing would have made `/session/[id]` a 500 on the first real workout.
 *
 * So the shape this screen depends on is stated here, once, and parsed at the
 * boundary. Two things follow honestly:
 *
 * 1. A mismatch throws rather than rendering partial data. A workout screen that
 *    quietly drops sets is worse than an error page, because the missing sets
 *    look like ones that were never done.
 * 2. This is a *view* requirement, not the wire contract. Tightening
 *    `SessionStateSchema` itself is the real fix and is tracked as a finding;
 *    once that happens, this file should shrink to a re-export.
 */
export const SessionViewSetSchema = z.object({
  id: z.string().uuid(),
  routineDayId: z.string().uuid(),
  status: SessionStatusSchema,
  phase: SessionPhaseSchema,
  localDate: LocalDateSchema,
  routineDay: z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable().optional(),
    exercises: z.array(
      z.object({
        id: z.string().uuid(),
        phase: z.enum(['main_workout', 'stretch']),
        orderIndex: z.number(),
        targetSets: z.number().nullable(),
        targetReps: z.number().nullable().optional(),
        targetRepsRange: z.string().nullable().optional(),
        restTime: z.string().nullable().optional(),
        exercise: z.object({
          id: z.string().uuid(),
          name: z.string(),
        }),
      }),
    ),
  }),
  sets: z.array(
    z.object({
      id: z.string().uuid(),
      sessionId: z.string().uuid(),
      exerciseId: z.string().uuid(),
      setIndex: z.number().int(),
      isCompleted: z.boolean(),
      weightKg: z.number().nullable(),
      reps: z.number().int().nullable(),
    }),
  ),
});

export type SessionView = z.infer<typeof SessionViewSetSchema>;

export class SessionViewShapeError extends Error {
  constructor(issues: string) {
    super(`session payload does not match the shape this screen renders: ${issues}`);
    this.name = 'SessionViewShapeError';
  }
}

export function parseSessionView(payload: unknown): SessionView {
  const parsed = SessionViewSetSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new SessionViewShapeError(issues);
  }
  return parsed.data;
}
