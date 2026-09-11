import { notFound, redirect } from 'next/navigation';

import { requireUserContext } from '../../../../lib/auth/require-user';
import { AppErrorException } from '../../../../lib/contracts/envelope';
import { getDb } from '../../../../lib/db/client';
import { ProfileRepository } from '../../../../lib/repositories/profile-repository';
import { WorkoutRepository } from '../../../../lib/repositories/workout-repository';
import { parseSessionView } from '../../../../lib/views/session-view';
import SessionScreen from './runner';

/**
 * M3-06 (#63): the session screen's server half.
 *
 * `#61` shipped this route as a read-only view, and that view is deleted here: a
 * workout is written, not browsed. What stays in this file is everything that must not
 * move to the client — the auth check, the user-scoped reads, the shape assertion — and
 * what moves to `runner.tsx` is everything a user can touch.
 *
 * `force-dynamic` is not a performance note. This page answers with another athlete's
 * workout if it is ever prerendered or cached, and its content changes on every tap.
 */
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  let context;
  try {
    context = await requireUserContext();
  } catch (error) {
    if (error instanceof AppErrorException && error.appError.code === 'UNAUTHENTICATED') {
      redirect('/sign-in');
    }
    throw error;
  }

  const workoutRepository = new WorkoutRepository(getDb(), context.claims);
  const profileRepository = new ProfileRepository(getDb(), context.claims);

  const [state, profile] = await Promise.all([
    workoutRepository.findSession(context.userId, id),
    profileRepository.getProfile(context.userId),
  ]);

  if (state === null) notFound();

  // Throws `SessionViewShapeError` on an unexpected shape rather than rendering a screen
  // full of `undefined`s. Carried over unchanged from #61, and the reason is still #73:
  // the server's `SessionStateSchema` is a passthrough, so nothing above this line
  // validates the graph, and this is the only place the two sides are checked against
  // each other.
  const view = parseSessionView(state);
  const unit = profile?.preferredUnit ?? 'kg';

  // A second await, and it is not laziness: prefill is keyed by *routine day*, and the
  // only way to learn this session's day is to load the session. Fusing the two into one
  // repository call is possible (`getPrefillForSession`) and deliberately not done here —
  // #62 left `getPrefill` with one caller-shaped contract, and inventing a second read
  // path to save one round trip is how two copies of "the previous session" start to
  // disagree. The cost is one indexed query on a page that already runs three.
  //
  // A failure here is not allowed to take the workout down: prefill is a convenience, and
  // an athlete mid-set must still be able to log. Hence `catch`, not `await`-and-hope.
  const prefill = await workoutRepository
    .getPrefill(context.userId, view.routineDayId, id)
    .catch(() => null);

  return (
    <SessionScreen
      userId={context.userId}
      sessionId={id}
      initialView={view}
      unit={unit}
      initialPrefill={prefill ?? { entries: [], sourceLocalDate: null, sourceSessionId: null }}
    />
  );
}
