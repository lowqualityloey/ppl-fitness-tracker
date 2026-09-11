import { SessionStateSchema, type SessionState } from '../contracts/sessions';

/**
 * The session screen's shape assertion, which as of #73 **is** the wire contract.
 *
 * This file used to state its own subset of the session graph, and it did so for a
 * defensible reason: `SessionStateSchema` was `z.object({}).passthrough()` — an M2-01
 * placeholder — so `lib/views/` was the only place in the repo that could tell a page
 * "this payload is not a session". That made the view a second source of truth for a
 * shape that has one authoritative producer (`mapSessionState`) and three consumers
 * (`/api/sessions`, `/api/sessions/[id]`, `/api/sync`). Two sources of truth drift, and
 * the draft of the original file proves what that costs: written from memory it invented
 * `['in_progress','archived','abandoned']` and `phase: ['strength','stretch']`, neither of
 * which the database has ever contained.
 *
 * #73 closed the placeholder, so the duplicate is gone and this is a re-export. What did
 * *not* move is `parseSessionView` itself, and that is not sentiment:
 *
 * - `src/app/session/[id]/page.tsx` and `src/app/history/[id]/page.tsx` are server
 *   components. They read the session **in-process** through the repository and never
 *   touch the routes, so route-level validation cannot see them. This call is their only
 *   boundary.
 * - A shape mismatch has to *throw*. A workout screen that quietly drops the sets it could
 *   not read presents missing work as work that was never done, which is worse than an
 *   error page — hence `SessionViewShapeError` with the offending paths named.
 */
export const SessionViewSetSchema = SessionStateSchema;

export type SessionView = SessionState;

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
