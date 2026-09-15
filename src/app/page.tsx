import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUserContext } from '../../lib/auth/require-user';
import { AppErrorException } from '../../lib/contracts/envelope';
import { getDb } from '../../lib/db/client';
import { currentUtcDate } from '../../lib/domain/local-date';
import { formatWeight } from '../../lib/domain/units';
import { ContentRepository, type SystemDayPlan } from '../../lib/repositories/content-repository';
import { ProfileRepository } from '../../lib/repositories/profile-repository';
import { WorkoutRepository, type DaySessionSnapshot } from '../../lib/repositories/workout-repository';
import {
  computeStreakDays,
  describeTrainingDay,
  describeTrainingWeek,
  type TrainingDayBucket,
} from '../../lib/views/dashboard-view';
import { StartButton } from '../components/start-button';
import type { BadgeProps } from '../components/ui/badge';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';

/**
 * M3-04 (#61): the dashboard. Every number on this screen is produced by the
 * server, and nothing on it is counted in the browser from a bulk payload.
 *
 * The aggregates it renders (`exerciseCount`, `plannedSets`,
 * `setsCompleted`/`setsTotal`) come from SQL in `ContentRepository.listSystemDayPlans`
 * and `WorkoutRepository.getSessionsOnDate`. That rejects the obvious shortcut —
 * ship the routine plus the session graph and count it in JS — because the shortcut
 * sends O(workout length) JSON to render two integers, and because a count computed
 * in two places is two definitions of "how much work is in this day" free to
 * disagree.
 *
 * This replaces the M1 placeholder that existed for M1-01's "a real build, not a
 * stub" criterion. The placeholder is gone rather than parked behind a flag: with
 * the E2E harness in place (#60) the real screen is now the thing the build smoke
 * asserts.
 */
export const dynamic = 'force-dynamic';

/**
 * Display order for the PPL split.
 *
 * `routine_days` has no `order` column, and adding one to serve a fixed
 * three-item presentation is a schema change doing CSS's job. What exists is a
 * meaning: Push precedes Pull precedes Legs. Anything the query returns that is
 * not one of the three (a custom day, once #66 lets users make them) keeps the
 * query's slug order and lands last — it is *not* dropped, because a day the user
 * owns but cannot see is data loss wearing a layout costume.
 */
const DAY_ORDER = ['push', 'pull', 'legs'] as const;

const DAY_BADGE: Record<string, BadgeProps['variant']> = {
  push: 'push',
  pull: 'pull',
  legs: 'legs',
};

export default async function DashboardPage() {
  const date = currentUtcDate();

  let context;
  try {
    context = await requireUserContext();
  } catch (error) {
    // Only a *missing session* means "go sign in". An auth-service failure, a
    // database outage, or a token rejected for another reason must propagate as an
    // error: redirecting on those creates a sign-in loop that looks exactly like an
    // auth bug and hides the real one.
    if (error instanceof AppErrorException && error.appError.code === 'UNAUTHENTICATED') {
      redirect('/sign-in');
    }
    throw error;
  }

  const contentRepository = new ContentRepository();
  const workoutRepository = new WorkoutRepository(getDb(), context.claims);
  const profileRepository = new ProfileRepository(getDb(), context.claims);

  const [days, sessions, profile, trainingWeek] = await Promise.all([
    contentRepository.listSystemDayPlans(),
    workoutRepository.getSessionsOnDate(context.userId, date),
    profileRepository.getProfile(context.userId),
    workoutRepository.getTrainingWeek(context.userId, date),
  ]);

  const byDay = new Map<string, DaySessionSnapshot>();
  for (const snapshot of sessions) {
    // `getSessionsOnDate` returns oldest-first and the schema allows one session
    // per day. Keeping the last write states that assumption here, where a
    // violation would be visible in a test, instead of inside a query that would
    // have to throw to say so.
    byDay.set(snapshot.routineDayId, snapshot);
  }

  const ordered = [...days].sort((a, b) => rank(a) - rank(b));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Today</h1>
          {/*
            * The one route into history. A link rather than a button because it navigates to a
            * page rather than performing an action: keyboard and screen-reader users get the right
            * affordance for free, and there is no client JavaScript to write.
            */}
          <Link href="/history" className="text-sm underline underline-offset-4">
            History
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatLongDate(date)}
          {profile?.displayName ? ` · ${profile.displayName}` : ''}
        </p>
      </header>

      {ordered.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-4">
          {ordered.map((day) => (
            <li key={day.id}>
              <DayCard day={day} session={byDay.get(day.id)} />
            </li>
          ))}
        </ul>
      )}

      <TrainingWeek
        days={trainingWeek.days}
        trainingDates={trainingWeek.trainingDates}
        unit={profile?.preferredUnit ?? 'kg'}
        today={date}
      />

      <p className="text-xs text-muted-foreground">
        Workouts are filed under the server&apos;s date. Your own timezone is honoured once
        preferences exist.
      </p>
    </main>
  );
}

function rank(day: SystemDayPlan): number {
  const index = (DAY_ORDER as readonly string[]).indexOf(day.slug);
  return index === -1 ? DAY_ORDER.length : index;
}

function DayCard({ day, session }: { day: SystemDayPlan; session?: DaySessionSnapshot }) {
  const variant = DAY_BADGE[day.slug] ?? 'outline';
  const href = session ? `/session/${session.sessionId}` : null;
  const status = !session
    ? { label: 'Not started', action: null }
    : session.status === 'in_progress'
      ? { label: 'In progress', action: 'Resume workout' }
      : { label: 'Logged today', action: 'View workout' };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>
            {href ? <Link href={href}>{day.name}</Link> : day.name}
          </CardTitle>
          <Badge variant={variant}>{status.label}</Badge>
        </div>
        <CardDescription>
          {day.description ?? `${day.exerciseCount} exercises planned`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{volumeLine(day, session)}</p>
        {session && href ? (
          <Button asChild variant="secondary">
            <Link href={href}>{status.action}</Link>
          </Button>
        ) : (
          <StartButton routineDayId={day.id} dayName={day.name} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One sentence, three possible facts. With a session the *logged* count is
 * authoritative and the plan is context; without one, only the plan exists.
 * Merging them into `0 of 20 sets · 24 planned` would put two denominators in one
 * sentence as though they described the same object — which is how a runner ends up
 * looking like it lost sets.
 */
function volumeLine(day: SystemDayPlan, session?: DaySessionSnapshot): string {
  const plan = `${day.exerciseCount} exercises · ${day.plannedSets} sets${
    day.stretchSets > 0 ? ` · ${day.stretchSets} stretch` : ''
  }`;
  if (!session) return plan;
  return `${session.setsCompleted} of ${session.setsTotal} sets logged · ${plan}`;
}

/**
 * M4-19 (#108): the training week. Every number rendered here is a counted
 * completed-session row from `WorkoutRepository.getTrainingWeek` — computed in kg,
 * converted only at this display edge via `formatWeight` (ADR-0005). No schedule, no
 * estimates: a week with no sessions says so, and sessions without load say that too
 * (the importer's shape), rather than printing a zero that claims measurement.
 */
function TrainingWeek({
  days,
  trainingDates,
  unit,
  today,
}: {
  days: readonly TrainingDayBucket[];
  trainingDates: readonly string[];
  unit: 'kg' | 'lbs';
  today: string;
}) {
  const week = describeTrainingWeek(days);
  const streak = computeStreakDays(trainingDates, today);
  return (
    <section aria-labelledby="training-heading" data-testid="training-week">
      <h2 id="training-heading" className="text-lg font-medium">
        Training week
      </h2>
      {week.kind === 'empty' ? (
        <p className="text-sm text-muted-foreground">
          No training logged in the last 7 days. Your first logged session starts the
          record — nothing here is estimated.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="training-week-summary">
            {weekSummaryLine(week, unit)}
          </p>
          <ul className="flex flex-col gap-1">
            {days.map((day) => (
              <TrainingDayRow key={day.localDate} day={day} unit={unit} />
            ))}
          </ul>
        </>
      )}
      {trainingDates.length > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="training-streak">
          {streak > 0 ? `${streak}-day streak` : 'No active streak.'}
        </p>
      )}
    </section>
  );
}

function weekSummaryLine(
  week: Extract<ReturnType<typeof describeTrainingWeek>, { kind: 'loaded' | 'coverage' }>,
  unit: 'kg' | 'lbs',
): string {
  const sessions = `${week.sessions} ${week.sessions === 1 ? 'session' : 'sessions'}`;
  if (week.kind === 'coverage') return `${sessions} logged — no load recorded.`;
  return `${sessions} · ${formatWeight(week.volumeKg, unit)} this week`;
}

function TrainingDayRow({
  day,
  unit,
}: {
  day: TrainingDayBucket;
  unit: 'kg' | 'lbs';
}) {
  const view = describeTrainingDay(day);
  const label = formatShortDay(day.localDate);
  if (view.kind === 'rest') {
    return (
      <li className="text-sm text-muted-foreground">
        {label} · Rest
      </li>
    );
  }
  const sessions = `${view.sessions} ${view.sessions === 1 ? 'session' : 'sessions'}`;
  if (view.kind === 'coverage') {
    return (
      <li className="text-sm text-muted-foreground">
        {label} · {sessions} · no load recorded
      </li>
    );
  }
  return (
    <li className="text-sm text-muted-foreground">
      {label} · {formatWeight(view.volumeKg, unit)} · {sessions}
    </li>
  );
}

function formatShortDay(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function EmptyState() {
  return (
    <section aria-labelledby="empty-heading" className="flex flex-col gap-2">
      <h2 id="empty-heading" className="text-lg font-medium">
        No routine content yet
      </h2>
      <p className="text-sm text-muted-foreground">
        The exercise library has not been seeded, so there are no training days to show.
        Seeding happens with the database migrations; importing your own routine arrives
        with settings.
      </p>
    </section>
  );
}

function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
