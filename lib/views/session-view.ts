import { z } from 'zod';
import {
  IsoDateTimeSchema,
  LocalDateSchema,
  SessionPhaseSchema,
  SessionStatusSchema,
  TaskKeySchema,
} from '../contracts/common';

/**
 * A task's completion timestamp, from either of the two sources this view is built from.
 *
 * The screen reads it from the repository in-process, where `SessionTaskState.completedAt`
 * is a `Date`, and re-reads it over HTTP after a sync rejection, where the same column
 * arrives as an ISO string. Asserting one of the two would make the other throw on the
 * client's *second* fetch of the session — the worst possible time, immediately after the
 * server refused a change. So both are accepted, and exactly one type leaves this schema.
 */
const TaskCompletedAtSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  IsoDateTimeSchema.nullable(),
);

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
          /*
           * `kind` is not decoration: the storage rule `assertSetMutationAllowed` accepts a
           * set row only when the placement is in the `main_workout` phase *and* the
           * exercise is `strength`. A screen that cannot see the kind cannot know which rows
           * are legal to offer, and would hand the athlete a tick that is refused every
           * time. The enum is spelled as `exercise_kind` in db/schema/index.ts spells it.
           */
          kind: z.enum(['strength', 'stretch']),
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
  /*
   * Added for `#63`. This screen used to render no tasks because it had no tasks in its
   * view — and the phase machine turns out to be gated on them: `warm_up` blocks the move
   * into `exercise`, `main_workout` blocks `stretch`, `stretch` blocks `post_workout`, and
   * only `post_workout` may finish. A workout screen that cannot show them cannot finish a
   * workout, which is the entire point of the product.
   *
   * `label` is deliberately absent: `SessionTaskState` has none, and inventing one here
   * would put a string on the screen that no storage column backs. The labels live in the
   * client, next to the checkboxes that render them.
   */
  tasks: z.array(
    z.object({
      id: z.string().uuid(),
      sessionId: z.string().uuid(),
      taskKey: TaskKeySchema,
      completedAt: TaskCompletedAtSchema,
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
