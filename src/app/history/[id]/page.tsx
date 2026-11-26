import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { AppErrorException } from '../../../../lib/contracts/envelope';
import { requireUserContext } from '../../../../lib/auth/require-user';
import { getDb } from '../../../../lib/db/client';
import { ProfileRepository } from '../../../../lib/repositories/profile-repository';
import { WorkoutRepository } from '../../../../lib/repositories/workout-repository';
import { formatWeight } from '../../../../lib/domain/units';
import { loadCoverage } from '../../../../lib/views/history-view';
import { parseSessionView } from '../../../../lib/views/session-view';
import { formatDuration } from '../../state/timer-controller';

/**
 * One past session, as a report (M3-08, #65).
 *
 * Deliberately a server component with no client island, unlike `/session/[id]`, which shares its
 * shape with a finished workout but is a different object: the runner owns a device id, an IndexedDB
 * outbox, a sync engine, and — since #64 — two live timers. None of that can change what this page
 * says, because `completedAt` is set and the data cannot move again. Shipping a mutation queue to
 * render a receipt is not reuse, it is drag.
 */
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
  const coverage = loadCoverage(view.sets);
  /*
   * Keyed by `placement.exercise.id`, not by `placement.id`.
   *
   * A routine day's exercise entries are *placements* — a row in `routine_exercises` with its own
   * id, phase, and targets — while `session_sets.exerciseId` references the underlying exercise.
   * Keying by the placement id looked right, type-checked, and made every set row resolve to the
   * fallback: a report in which each of the athlete's lifts was labelled "Removed exercise". The
   * E2E caught it by asserting a name that should have been there.
   */
  const names = new Map(
    view.routineDay.exercises.map((placement) => [placement.exercise.id, placement.exercise.name]),
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Button asChild variant="ghost" className="self-start p-0 text-sm">
          <Link href="/history">Back to history</Link>
        </Button>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{view.routineDay.name}</h1>
          <Badge variant={view.status === 'in_progress' ? 'secondary' : 'outline'}>
            {STATUS_LABEL[view.status]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{summaryLine(view)}</p>
      </header>

      {coverage.total > 0 && coverage.withLoad === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm" data-testid="no-load-notice">
              This session was recorded without load. Sets are listed so the day is visible in your
              log, but no weights or reps were stored, so nothing here contributes to your progress
              numbers.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {view.sets.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm">
              No sets were logged for this session. The workout was started and never had a set
              completed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Sets</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Every set logged in this session, with the weight and reps recorded at the time.
              </caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="px-6 py-2 font-medium">
                    Exercise
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Set
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    Weight
                  </th>
                  <th scope="col" className="px-6 py-2 text-right font-medium">
                    Reps
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.sets.map((set) => (
                  <tr key={set.id} className="border-b last:border-0">
                    <th scope="row" className="px-6 py-2 text-left font-normal">
                      {names.get(set.exerciseId) ?? 'Removed exercise'}
                    </th>
                    <td className="px-2 py-2">{set.setIndex + 1}</td>
                    <td className="px-2 py-2 text-right">
                      {set.weightKg === null ? NO_LOAD : formatWeight(set.weightKg, unit)}
                    </td>
                    <td className="px-6 py-2 text-right">{set.reps === null ? NO_LOAD : set.reps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Session tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm">
            {view.tasks.map((task) => (
              <li key={task.id}>
                {task.completedAt === null ? 'Not done' : 'Done'} · {TASK_LABEL[task.taskKey]}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {view.status === 'in_progress' ? (
        <Button asChild>
          <Link href={`/session/${view.id}`}>Resume this workout</Link>
        </Button>
      ) : null}
    </main>
  );
}

/**
 * An em dash, and only in the cell.
 *
 * The alternative the card explicitly forbids is a zero: `0 kg` in a weight column reads as a
 * collapse in strength, and a reader comparing two weeks of training has no way to tell that the
 * number came from the legacy importer, which writes NULL weight by design. `—` says "nothing here"
 * and the session-level notice above the table says why.
 */
const NO_LOAD = '—';

const TASK_LABEL: Record<string, string> = {
  warm_up: 'Warm-up',
  main_workout: 'Main workout',
  stretch: 'Stretching',
};

/*
 * #76. An archived session is not an unfinished one: it came in through the legacy importer, which
 * writes `status: 'archived'` with a deliberately NULL `completedAt` because the old payload
 * recorded no end time. Calling that "Not finished" told the athlete they had abandoned a workout
 * they never abandoned, so archived gets its own word and its own summary suffix.
 */
const STATUS_LABEL: Record<string, string> = {
  in_progress: 'Not finished',
  completed: 'Complete',
  archived: 'Archived',
};

function summaryLine(view: ReturnType<typeof parseSessionView>): string {
  const started = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(view.startedAt),
  );
  if (view.completedAt === null) {
    return `${started} · ${view.status === 'archived' ? 'length not recorded' : 'not finished'}`;
  }
  const minutes = Date.parse(view.completedAt) - Date.parse(view.startedAt);
  return `${started} · ${formatDuration(Math.max(0, minutes))}`;
}
