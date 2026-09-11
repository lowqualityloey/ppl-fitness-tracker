/**
 * The history view boundary (M3-08, #65).
 *
 * `WorkoutRepository.listSessions` answers with the domain's `SessionSummary`, which carries
 * `clientId`, `serverSeq`, and `updatedAt` — all three meaningful to sync and to nothing else. A
 * page that passed that object straight through would be asserting a contract it never reads, and
 * #61 established the alternative: the view declares exactly what the screen renders, so a field
 * disappearing from storage is a compile error here rather than a blank column someone notices a
 * month later.
 *
 * The second thing this module owns is the question the card's Scenario 3 asks — **does this
 * session contain load at all?** — because that answer must not be guessed from a zero. M2-05's
 * importer writes sets with `NULL` weight and `NULL` reps by design, and the only honest rendering
 * is "recorded without load", not `0 kg`, which would read as a strength collapse to anyone
 * comparing two weeks of training.
 */

import { z } from 'zod';
// The enums live in `contracts/common`, not in the sessions contract that names them in its own
// schemas: importing from the latter silently yields `undefined` and zod then fails at *parse*
// time with "expected a Zod schema", several files away from the wrong import.
import {
  IsoDateTimeSchema,
  LocalDateSchema,
  SessionPhaseSchema,
  SessionSourceSchema,
  SessionStatusSchema,
  UuidSchema,
} from '../../lib/contracts/common';
import type { SessionPage } from '../../lib/domain/sessions/types';

/** See `lib/views/session-view.ts`: the same payload arrives as a `Date` or as an ISO string. */
const toIsoString = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

const TimestampSchema = z.preprocess(toIsoString, IsoDateTimeSchema.nullable());
const RequiredTimestampSchema = z.preprocess(toIsoString, IsoDateTimeSchema);

export const HistoryEntrySchema = z.object({
  id: UuidSchema,
  routineDayId: UuidSchema,
  status: SessionStatusSchema,
  /**
   * The phase the session stopped in. A history row for an abandoned workout says so through this
   * field, which is why the list renders it as a badge rather than implying every past session was
   * completed.
   */
  phase: SessionPhaseSchema,
  /** `'legacy_import'` is what makes "recorded without load" renderable at list level. */
  source: SessionSourceSchema,
  localDate: LocalDateSchema,
  startedAt: RequiredTimestampSchema,
  completedAt: TimestampSchema,
});

export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export interface HistoryPageView {
  readonly entries: HistoryEntry[];
  readonly nextCursor: string | null;
}

/**
 * Validate and narrow one page of history.
 *
 * Throws rather than filtering: a row that does not match the shape the list renders means the
 * repository and the screen disagree about the contract, and quietly dropping the row would turn a
 * missing Tuesday into a Tuesday that never happened.
 */
export class HistoryViewShapeError extends Error {
  constructor(issues: string) {
    super(`history payload does not match the shape this screen renders: ${issues}`);
    this.name = 'HistoryViewShapeError';
  }
}

export function parseHistoryPage(page: SessionPage): HistoryPageView {
  const parsed = z
    .object({
      sessions: z.array(HistoryEntrySchema),
      // The cursor is opaque and already validated by the repository; `null` means "no more pages",
      // which the list needs to know so it can stop offering a link that leads nowhere.
      nextCursor: z.string().nullable(),
    })
    .safeParse(page);

  if (!parsed.success) {
    throw new HistoryViewShapeError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }

  return { entries: parsed.data.sessions, nextCursor: parsed.data.nextCursor };
}

export interface HistoryDay {
  readonly date: string;
  readonly entries: HistoryEntry[];
}

/**
 * Group by `localDate`, newest first, preserving the order it was given.
 *
 * Grouping is here rather than inline in the page because it is the one piece of the list that can
 * be wrong in a way a reader would call a bug: the repository orders by `(localDate, id)` descending,
 * so two sessions on the same day are adjacent *already*, and a group-by that used a `Map` built
 * from an unsorted feed would scatter them. Asserted, not assumed.
 */
export function groupByDay(entries: readonly HistoryEntry[]): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const entry of entries) {
    const last = days.at(-1);
    if (last && last.date === entry.localDate) {
      days[days.length - 1] = { date: last.date, entries: [...last.entries, entry] };
    } else {
      days.push({ date: entry.localDate, entries: [entry] });
    }
  }
  return days;
}

/**
 * Does this session contain any load at all?
 *
 * `total` counts sets, `withLoad` counts those carrying a weight or a rep count. A session with
 * `total > 0 && withLoad === 0` is the imported shape from M2-05 and must render as
 * "recorded without load"; a session with `total === 0` is one that was started and never had a set
 * ticked, which is a *different* message, because the athlete did log in that day.
 */
export interface LoadCoverage {
  readonly total: number;
  readonly withLoad: number;
}

export function loadCoverage(sets: readonly { weightKg: number | null; reps: number | null }[]): LoadCoverage {
  const withLoad = sets.filter((set) => set.weightKg !== null || set.reps !== null).length;
  return { total: sets.length, withLoad };
}
