import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { AppErrorException } from '../../../lib/contracts/envelope';
import { SessionsListQuerySchema } from '../../../lib/contracts/sessions';
import { requireUserContext } from '../../../lib/auth/require-user';
import { getDb } from '../../../lib/db/client';
import { ContentRepository } from '../../../lib/repositories/content-repository';
import { WorkoutRepository } from '../../../lib/repositories/workout-repository';
import { InvalidSessionCursorError } from '../../../lib/domain/sessions/types';
import { groupByDay, parseHistoryPage, type HistoryEntry } from '../../../lib/views/history-view';
import { formatDuration } from '../state/timer-controller';

/**
 * Workout history (M3-08, #65).
 *
 * `force-dynamic` for the same reason #61 and #63 gave their pages that line: this route answers
 * with another athlete's training log if it is ever cached. The repository scopes every read by
 * `userId` under RLS (ADR-0003), but a cached HTML body sits in front of all of that.
 */
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  let context;
  try {
    context = await requireUserContext();
  } catch (error) {
    if (error instanceof AppErrorException && error.appError.code === 'UNAUTHENTICATED') {
      redirect('/sign-in');
    }
    throw error;
  }

  // The cursor is validated by the *same* schema the list endpoint uses, not a copy of it. A page
  // that invented its own check would drift from the contract the moment the contract moved, and
  // the drift would show up as `/history?cursor=…` 500-ing while `GET /api/sessions` was fine.
  const parsedQuery = SessionsListQuerySchema.safeParse(await searchParams);
  if (!parsedQuery.success) notFound();
  const cursor = parsedQuery.data.cursor;

  const workoutRepository = new WorkoutRepository(getDb(), context.claims);
  const contentRepository = new ContentRepository();

  let page: Awaited<ReturnType<WorkoutRepository['listSessions']>>;
  let days: Awaited<ReturnType<ContentRepository['listSystemDayPlans']>>;
  try {
    [page, days] = await Promise.all([
      workoutRepository.listSessions(context.userId, cursor),
      contentRepository.listSystemDayPlans(),
    ]);
  } catch (error) {
    if (error instanceof InvalidSessionCursorError) {
      // A cursor encodes `(localDate, id)`. It outlives the data it pointed at whenever a session
      // is deleted, and #58 already established that a stale token is answered by restarting the
      // walk rather than by an error page — the athlete wants their history, not a lesson in
      // pagination internals. Redirect to the first page, which is the same position they were in
      // before they followed whatever link went stale.
      redirect('/history');
    }
    throw error;
  }

  const { entries, nextCursor } = parseHistoryPage(page);
  const dayNames = new Map(days.map((day) => [day.id, day.name]));
  const groups = groupByDay(entries);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">History</h1>
          <p className="text-sm text-muted-foreground">
            Every session you have logged, newest first.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/">Today</Link>
        </Button>
      </header>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-2 p-6" data-testid="history-empty">
            <p className="text-sm">
              No workouts yet. Your sessions appear here as soon as you finish one.
            </p>
            <p className="text-xs text-muted-foreground">
              Workouts you import from the legacy dashboard also show up here, marked as imported.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-6">
          {groups.map((group) => (
            <li key={`${group.date}-${group.entries[0]?.id ?? ''}`}>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground" data-testid="history-day">
                {group.date}
              </h2>
              <ul className="flex flex-col gap-3">
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <HistoryRow entry={entry} dayName={resolveDayName(dayNames, entry)} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <nav aria-label="Older workouts" className="flex justify-between gap-3">
          <Button asChild variant="secondary">
            <Link href={`/history?cursor=${encodeURIComponent(nextCursor)}`}>Older workouts</Link>
          </Button>
        </nav>
      ) : groups.length > 0 ? (
        <p className="text-xs text-muted-foreground">That is the whole log.</p>
      ) : null}
    </main>
  );
}

function resolveDayName(names: Map<string, string>, entry: HistoryEntry): string {
  // A summary carries `routineDayId` and nothing else; the plan list resolves it to the name the
  // athlete recognises. An unknown id is a routine day that is not system content — a user-created
  // day — and the honest label is the one below rather than a blank or the day's UUID.
  return names.get(entry.routineDayId) ?? 'Custom routine';
}

function HistoryRow({ entry, dayName: name }: { entry: HistoryEntry; dayName: string }) {
  const duration =
    entry.completedAt === null
      ? null
      : Math.max(0, Date.parse(entry.completedAt) - Date.parse(entry.startedAt));

  return (
    <Card data-testid="history-row">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>
            <Link
              href={`/history/${entry.id}`}
              className="underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {name}
            </Link>
          </CardTitle>
          {entry.source === 'legacy_import' ? (
            <Badge variant="outline">Imported</Badge>
          ) : (
            <Badge variant={PHASE_BADGE[entry.phase]}>{PHASE_LABEL[entry.phase]}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {clockTime(entry.startedAt)}
          {duration !== null
            ? ` · ${formatDuration(duration)}`
            : entry.status === 'archived'
              ? ' · length not recorded'
              : ' · not finished'}
          {entry.source === 'legacy_import' ? ' · recorded without load' : ''}
        </p>
      </CardContent>
    </Card>
  );
}

const PHASE_LABEL: Record<HistoryEntry['phase'], string> = {
  pre_workout: 'Warm-up',
  exercise: 'In progress',
  rest: 'Resting',
  stretch: 'Stretching',
  post_workout: 'Complete',
};

/**
 * The phase a session stopped in, phrased the way an athlete reads it.
 *
 * `status` and `phase` describe different things and only `phase` distinguishes "finished" from
 * "abandoned half-way": a completed session is in `post_workout`, while an `in_progress` one left
 * on the bench still yesterday is in whichever phase it froze in. Rendering `status` alone would
 * show both as a row with no explanation.
 */
const PHASE_BADGE: Record<HistoryEntry['phase'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pre_workout: 'secondary',
  exercise: 'default',
  rest: 'default',
  stretch: 'secondary',
  post_workout: 'outline',
};

function clockTime(iso: string): string {
  // `localDate` is the server's date and `startedAt` is an instant, so the two are printed from
  // their own sources rather than derived from each other — a heading from one and a time from the
  // other could otherwise disagree by a day line.
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}
