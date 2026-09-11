import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUserContext } from '../../../../lib/auth/require-user';
import { AppErrorException } from '../../../../lib/contracts/envelope';
import { getDb } from '../../../../lib/db/client';
import { formatWeight } from '../../../../lib/domain/units';
import { ProfileRepository } from '../../../../lib/repositories/profile-repository';
import { WorkoutRepository } from '../../../../lib/repositories/workout-repository';
import { parseSessionView, type SessionView } from '../../../../lib/views/session-view';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';

/**
 * M3-04 (#61): the read-only session view.
 *
 * This screen exists because a dashboard card has to *go* somewhere. The
 * interactive runner — optimistic ticking, the outbox, the rest timer — is #63,
 * and #61 shipping a "Resume" button that led to a 404 would have been worse than
 * shipping no button: it would have made the start flow lie. So this page reads
 * the same session the API returns and renders it without controls. When #63
 * lands it replaces this route rather than sitting beside it, which is the point
 * of putting it at `/session/[id]` now.
 *
 * Read-only is enforced by absence, not by disabled controls: there is no handler
 * here to tick a set. A greyed-out checkbox would advertise a capability the app
 * does not have yet.
 *
 * `findSession(userId, id)` is the whole access-control story, and it is the one
 * already used by `GET /api/sessions/[id]`: the lookup is scoped by the verified
 * user id (ADR-0003), so another user's session is indistinguishable from one that
 * does not exist — both are `notFound()`, never a 403 that would confirm existence.
 */
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const view = parseSessionView(state);
  const unit = profile?.preferredUnit ?? 'kg';

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-muted-foreground underline">
          Back to today
        </Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{view.routineDay.name}</h1>
          <StatusBadge status={view.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {view.localDate} · phase: {humanPhase(view.phase)}
        </p>
      </header>

      {view.status !== 'in_progress' ? (
        <p className="text-sm text-muted-foreground">
          This workout is finished, so its sets are shown as recorded and cannot be
          changed from here.
        </p>
      ) : null}

      <PhaseSection
        title="Strength"
        view={view}
        unit={unit}
        phase="main_workout"
        empty="No strength exercises are planned for this day."
      />
      <PhaseSection
        title="Stretch"
        view={view}
        unit={unit}
        phase="stretch"
        empty="No stretch exercises are planned for this day."
      />

      <div>
        <Button asChild variant="secondary">
          <Link href="/">Back to today</Link>
        </Button>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: SessionView['status'] }) {
  return (
    <Badge variant={status === 'in_progress' ? 'default' : 'outline'}>
      {status === 'in_progress' ? 'In progress' : status === 'completed' ? 'Completed' : 'Archived'}
    </Badge>
  );
}

/** The `session_phase` enum is where the runner left off, not a workout section. */
function humanPhase(phase: SessionView['phase']): string {
  switch (phase) {
    case 'pre_workout':
      return 'warming up';
    case 'exercise':
      return 'working out';
    case 'rest':
      return 'resting';
    case 'stretch':
      return 'stretching';
    case 'post_workout':
      return 'finishing up';
  }
}

function PhaseSection({
  title,
  view,
  unit,
  phase,
  empty,
}: {
  title: string;
  view: SessionView;
  unit: 'kg' | 'lbs';
  phase: 'main_workout' | 'stretch';
  empty: string;
}) {
  const exercises = view.routineDay.exercises
    .filter((plan) => plan.phase === phase)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <section aria-labelledby={`phase-${phase}`} className="flex flex-col gap-3">
      <h2 id={`phase-${phase}`} className="text-lg font-medium">
        {title}
      </h2>
      {exercises.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {exercises.map((plan) => (
            <li key={plan.id}>
              <ExerciseRow plan={plan} view={view} unit={unit} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ExerciseRow({
  plan,
  view,
  unit,
}: {
  plan: SessionView['routineDay']['exercises'][number];
  view: SessionView;
  unit: 'kg' | 'lbs';
}) {
  const sets = view.sets
    .filter((set) => set.exerciseId === plan.exercise.id)
    .sort((a, b) => a.setIndex - b.setIndex);

  const logged = sets.filter((set) => set.isCompleted).length;
  const target = plan.targetSets ?? sets.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{plan.exercise.name}</CardTitle>
          <Badge variant="outline">
            {logged} of {target} logged
          </Badge>
        </div>
        <CardDescription>
          {plan.targetSets ?? 0} sets
          {plan.targetRepsRange ? ` · ${plan.targetRepsRange} reps` : ''}
          {plan.restTime ? ` · rest ${plan.restTime}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sets recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">
              Recorded sets for {plan.exercise.name}
            </caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 pr-4 font-medium">Set</th>
                <th scope="col" className="py-1 pr-4 font-medium">Weight</th>
                <th scope="col" className="py-1 pr-4 font-medium">Reps</th>
                <th scope="col" className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((set) => (
                <tr key={set.id}>
                  <th scope="row" className="py-1 pr-4 font-normal">{set.setIndex}</th>
                  <td className="py-1 pr-4">{formatWeight(set.weightKg, unit)}</td>
                  <td className="py-1 pr-4">{set.reps ?? '—'}</td>
                  <td className="py-1">{set.isCompleted ? 'Logged' : 'Not logged'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
