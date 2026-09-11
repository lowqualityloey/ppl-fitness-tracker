import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { AppErrorException } from '../../../../lib/contracts/envelope';
import { ExerciseProgressParamsSchema, type E1rmPoint } from '../../../../lib/contracts/progress';
import { requireUserContext } from '../../../../lib/auth/require-user';
import { getDb } from '../../../../lib/db/client';
import { ContentRepository } from '../../../../lib/repositories/content-repository';
import { ProfileRepository } from '../../../../lib/repositories/profile-repository';
import { ProgressRepository } from '../../../../lib/repositories/progress-repository';
import { formatWeight, kgToDisplay } from '../../../../lib/domain/units';
import {
  buildChartGeometry,
  orderPersonalRecords,
  summarizeTrendline,
  toDisplayPoints,
} from '../../../../lib/views/progress-view';

/**
 * Per-exercise progress (M3-08, #65), reading the M2-06 trendline through the repository that
 * backs `GET /api/progress/:exerciseSlug`.
 *
 * No client component, which is a deviation from the card's "the chart is the only client
 * component" and worth the reasoning: the picture is an SVG polyline whose vertices are a pure
 * function of data the server already has. Rendering it on the server means this route ships **no
 * JavaScript at all** for a screen whose job is to be looked at, and it keeps the single-source
 * rule provable rather than aspirational — there is no client copy of the array to fall out of
 * step with. Interaction is a one-file change when someone wants a tooltip; inventing a boundary
 * now to satisfy a line in a card would be ceremony.
 */
export const dynamic = 'force-dynamic';

const CHART = { width: 640, height: 240, padding: 24 };

type RouteParams = Promise<{ exerciseSlug: string }>;

export default async function ProgressPage({ params }: { params: RouteParams }) {
  const { exerciseSlug } = await params;

  // The slug is validated by the contract's own schema, not by a regex copied into this file: the
  // traversal-shaped slug is a 400 at the endpoint, and `notFound()` is the page-level equivalent.
  // Nothing here is a *security* check — the repository scopes the read by user id under RLS
  // (ADR-0003), and a page that reimplemented authorization client-side would be the thing the card
  // warns against.
  const parsed = ExerciseProgressParamsSchema.safeParse({ exerciseSlug });
  if (!parsed.success) notFound();

  let context;
  try {
    context = await requireUserContext();
  } catch (error) {
    if (error instanceof AppErrorException && error.appError.code === 'UNAUTHENTICATED') {
      redirect('/sign-in');
    }
    throw error;
  }

  const progressRepository = new ProgressRepository(getDb(), context.claims);
  const profileRepository = new ProfileRepository(getDb(), context.claims);
  const contentRepository = new ContentRepository();

  const [data, profile, systemExercises] = await Promise.all([
    progressRepository.getExerciseProgress(context.userId, parsed.data.exerciseSlug),
    profileRepository.getProfile(context.userId),
    contentRepository.listSystemExercises().catch(() => []),
  ]);

  // One state for both "this slug does not exist" and "this is another athlete's custom exercise".
  // The repository returns `null` for either, and that is the correct amount of information to
  // give back: a page that said "this exercise exists but is not yours" would be an existence oracle
  // over someone else's data, which is the disclosure the card forbids.
  if (data === null) notFound();

  const unit = profile?.preferredUnit ?? 'kg';
  const title = systemExercises.find((exercise) => exercise.slug === parsed.data.exerciseSlug)?.name
    // A user's own exercise is absent from system content, so the slug is the only name available.
    ?? prettifySlug(parsed.data.exerciseSlug);

  const trendline = data.trendline;
  const summary = summarizeTrendline(trendline);
  const records = orderPersonalRecords(data.personalRecords);
  const geometry = buildChartGeometry(
    toDisplayPoints(trendline, (kg) => kgToDisplay(kg, unit)),
    CHART,
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Button asChild variant="ghost" className="self-start p-0 text-sm">
          <Link href="/history">Back to history</Link>
        </Button>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <Badge variant="outline">{unit === 'kg' ? 'kg' : 'lb'}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Estimated one-rep max per session, from the weights you logged.
        </p>
      </header>

      {trendline.length === 0 ? (
        <Card>
          <CardContent data-testid="progress-empty">
            <p className="text-sm">
              No load data recorded for {title} yet. Sessions imported from the legacy dashboard had
              no weights stored, so they cannot produce a strength trend — log a weighted set and
              this chart will start.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Trend</CardTitle>
            <CardDescription data-testid="progress-summary">{trendLine(summary, unit)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ProgressChart
              geometry={geometry}
              unit={unit}
              firstDate={summary.first?.date ?? ''}
              lastDate={summary.latest?.date ?? ''}
            />
            <TrendTable points={trendline} unit={unit} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Personal records</CardTitle>
        </CardHeader>
        <CardContent data-testid="pr-section">
          {records.length === 0 ? (
            <p className="text-sm">
              {trendline.length === 0
                ? 'No personal records yet.'
                : `${summary.sessions} weighted ${plural(summary.sessions, 'session')} logged, no record on file for ${title} yet.`}
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm" data-testid="pr-rows">
              {records.map((record) => (
                <li key={`${record.achievedAt}-${record.bestE1rm}`} className="flex justify-between gap-3">
                  <span>Best estimated {formatWeight(record.bestE1rm, unit)}</span>
                  <span className="text-muted-foreground">
                    {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(
                      new Date(record.achievedAt),
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * The picture, marked decorative.
 *
 * `aria-hidden` is required by the card's own rule and is only honest because `TrendTable` below
 * renders the same array as text: a chart nobody can read is a chart that says nothing, and a
 * screen reader told to ignore it while nothing else carries the values would be the insight-with-
 * no-access failure G-M3-6 exists to prevent.
 */
function ProgressChart({
  geometry,
  unit,
  firstDate,
  lastDate,
}: {
  geometry: ReturnType<typeof buildChartGeometry>;
  unit: 'kg' | 'lbs';
  firstDate: string;
  lastDate: string;
}) {
  return (
    <figure className="flex flex-col gap-1" data-testid="progress-chart">
      <svg
        viewBox={`0 0 ${geometry.size.width} ${geometry.size.height}`}
        className="h-56 w-full"
        role="presentation"
        aria-hidden="true"
        focusable="false"
        data-testid="progress-svg"
      >
        <line
          x1={geometry.size.padding}
          x2={geometry.size.width - geometry.size.padding}
          y1={geometry.size.height - geometry.size.padding}
          y2={geometry.size.height - geometry.size.padding}
          stroke="currentColor"
          strokeOpacity="0.2"
        />
        <polyline
          points={geometry.path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          data-testid="progress-line"
        />
        {geometry.points.map((point) => (
          <circle
            key={`${point.sessionId}-${point.date}`}
            cx={point.x}
            cy={point.y}
            r="3"
            fill="currentColor"
          />
        ))}
        <text x={geometry.size.padding} y={16} fontSize="12" fill="currentColor">
          {`${roundLabel(geometry.yMax)} ${unit === 'kg' ? 'kg' : 'lb'}`}
        </text>
        <text x={geometry.size.padding} y={geometry.size.height - 6} fontSize="12" fill="currentColor">
          {`${roundLabel(geometry.yMin)} ${unit === 'kg' ? 'kg' : 'lb'}`}
        </text>
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        {`${firstDate} to ${lastDate} · one point per session, evenly spaced`}
      </figcaption>
    </figure>
  );
}

/**
 * The same array, as numbers.
 *
 * Not a caption of the chart and not a summary of it: these are the endpoint's rows, in the
 * endpoint's order, and the E2E spec asserts that the vertex count and this row count are equal so
 * the two can never drift apart silently. Values come from `point.e1rm` with a unit conversion on
 * the way out — the only arithmetic performed anywhere on this screen.
 */
function TrendTable({ points, unit }: { points: readonly E1rmPoint[]; unit: 'kg' | 'lbs' }) {
  return (
    <table className="w-full text-sm" data-testid="progress-rows">
      <caption className="sr-only">
        Estimated one-rep max for each session, newest values matching the chart above point for
        point.
      </caption>
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th scope="col" className="py-2 font-medium">
            Session date
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            Estimated 1RM ({unit === 'kg' ? 'kg' : 'lb'})
          </th>
        </tr>
      </thead>
      <tbody>
        {points.map((point) => (
          <tr key={`${point.sessionId}-${point.date}`} className="border-b last:border-0">
            <th scope="row" className="py-2 text-left font-normal">
              {point.date}
            </th>
            <td className="py-2 text-right">{formatWeight(point.e1rm, unit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A sentence instead of a picture, for the case where the picture is not the point.
 *
 * The endpoints and the range are the only claims here. Anything richer — "up 12 %", "your best
 * month" — would be this screen inventing a statistic the progression engine has never defined, and
 * a number a reader cannot trace to a formula is not information.
 */
function trendLine(summary: ReturnType<typeof summarizeTrendline>, unit: 'kg' | 'lbs'): string {
  if (summary.first === null || summary.latest === null || summary.best === null) return '';
  const parts = [
    `${summary.sessions} weighted ${plural(summary.sessions, 'session')}`,
    `first ${formatWeight(summary.first.e1rm, unit)}`,
    `latest ${formatWeight(summary.latest.e1rm, unit)}`,
    `best ${formatWeight(summary.best.e1rm, unit)}`,
  ];
  return parts.join(' · ');
}

function roundLabel(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
