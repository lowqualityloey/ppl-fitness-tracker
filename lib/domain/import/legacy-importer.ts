import { createHash } from 'node:crypto';
import type { z } from 'zod';
import {
  LegacyImportPayloadSchemas,
  type ImportReport,
  type LegsWorkoutProgress,
  type LegacyImportRequest,
  type PullDayProgress,
  type PushWorkoutProgress,
} from '../../contracts/import';
import { LegacyImportValidationError, type LegacyImportedCounts } from './types';

/**
 * M2-05 (#40): the legacy localStorage importer.
 *
 * The legacy app is separate vanilla-JS modules, each persisting its own key in
 * its own shape, so parsing stays per-key: one hand-edited value must never
 * discard a valid sibling (spec §7 "Malformed legacy payload").
 *
 * Four facts drive this module, each easy to get wrong and each verified against
 * the legacy sources rather than assumed:
 *
 * 1. **Set identity, and an off-by-one.** `push-day-workout/app.js:512` and
 *    `legs-day-workout/app.js:618` both build ``ex${i}-set${j}`` from loops that
 *    start at **1** (`for (let i = 1; i <= 6; i++)`), and
 *    `push-day-workout/index.html:299` hard-codes those ids. Seeded content
 *    orders exercises by `routine_exercises.order_index`, which
 *    `db/seed/exercises.ts:45` writes starting at **0**. So `ex1` is
 *    `orderIndex: 0`. The conversion lives in exactly one function,
 *    `legacySlotToOrderIndex`, and a unit test names the real exercises
 *    (`ex1`→bench-press, `ex6`→push-ups) because a silent off-by-one would stamp
 *    every legacy set onto the wrong lift.
 *
 * 2. **Load was never captured.** There is no persisted weight, rep, RPE, or
 *    actual-rest value in any legacy payload (`grep type="number"` over the three
 *    HTML files returns nothing; `reps`/`startingWeight`/`restTime` are hard-coded
 *    plan constants). `session_sets.weight_kg`/`reps` therefore stay NULL — they
 *    are nullable precisely for this (spec §4.6) — and the absence is reported.
 *
 * 3. **Pull day has no per-set identity, and the real key is not the one the RFC
 *    names.** `pull-day-workout/app.js:717-721` renders set checkboxes with
 *    `data-exercise`/`data-set` and **no `id`**, while `:1392-1394` snapshots them
 *    as `progress.checkboxStates[checkbox.id]`. In a browser `Element.id` is then
 *    the empty string, so all 17 collapse onto key `""` — not `"undefined"` as
 *    `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.5 records. The
 *    distinction is not academic: `BooleanMapSchema` is
 *    `z.record(z.string().min(1), z.boolean())` (`lib/contracts/import.ts:4`), so
 *    a genuine browser-produced payload **fails validation entirely** on that `""`
 *    key, which would have made this importer report real pull-day data as
 *    malformed. `stripCollapsedCheckboxKey` removes the sentinel *before*
 *    validation, tolerates both spellings, and surfaces the loss in the report.
 *
 * 4. **A payload can prove nothing happened.** Pull writes on page load
 *    (`:518`, `:1462`, plus render-on-init at `:258-259`), and push/legs save on
 *    every phase change, so a record with nothing checked and the initial phase
 *    is a page visit, not a workout. Such payloads are skipped and reported; they
 *    do not get an archived session. The user story is "without inventing data
 *    that the legacy app never stored", and a phantom session is exactly that.
 *
 * Deliberately not imported, and said so in every report: legacy checklist,
 * warm-up, stretch and timer state. `session_tasks` keys are a fixed
 * `warm_up | main_workout | stretch` enum and the legacy maps carry per-item
 * booleans with no target representation, so a group would have to be collapsed
 * into a single "completed" claim. Completed *sets* are unambiguous; group
 * completion is inference, and inferring it would put words in the user's
 * history. Same reasoning for the timers, whose stored `seconds` cannot be aged
 * (no wall clock was saved alongside).
 */

export const LEGACY_KEYS = [
  'pushWorkoutProgress',
  'legsWorkoutProgress',
  'pullDayProgress',
  'userStats',
] as const;

export type LegacyKey = (typeof LEGACY_KEYS)[number];

export type LegacyDaySlug = 'push' | 'legs' | 'pull';

const DAY_BY_KEY = {
  pushWorkoutProgress: 'push',
  legsWorkoutProgress: 'legs',
  pullDayProgress: 'pull',
} as const satisfies Record<Exclude<LegacyKey, 'userStats'>, LegacyDaySlug>;

/** Mirrors the `session_phase` enum; kept local so this module imports no DB code. */
export type LegacySessionPhase =
  | 'pre_workout'
  | 'exercise'
  | 'rest'
  | 'stretch'
  | 'post_workout';

/**
 * Phase names as actually assigned in the three legacy modules
 * (`welcome`, `checklist`, `pre-workout`, `warm-up`, `main-workout`, `workout`,
 * `stretching`, `cardio`, `cooldown`, `post-workout`, `completion`), mapped onto
 * the target lifecycle. Anything unrecognised becomes `post_workout`: an
 * archived session's phase is not load-bearing, and guessing a mid-workout phase
 * would claim a state the user may never have reached.
 */
const PHASE_BY_LEGACY_NAME: Record<string, LegacySessionPhase> = {
  welcome: 'pre_workout',
  checklist: 'pre_workout',
  'pre-workout': 'pre_workout',
  'warm-up': 'pre_workout',
  'main-workout': 'exercise',
  workout: 'exercise',
  exercise: 'exercise',
  rest: 'rest',
  cardio: 'rest',
  stretching: 'stretch',
  stretch: 'stretch',
  cooldown: 'post_workout',
  'post-workout': 'post_workout',
  complete: 'post_workout',
  completion: 'post_workout',
};

/**
 * The two spellings a collapsed pull-day set checkbox can take: `""` from a real
 * browser (`Element.id` absent) and `"undefined"`, which is what the RFC records
 * and what hand-authored or restored payloads can carry. Both are sentinels for
 * "identity lost", never exercise identifiers.
 */
const COLLAPSED_CHECKBOX_KEYS = ['', 'undefined'] as const;

export interface KeyOutcome {
  key: LegacyKey;
  status: 'planned' | 'malformed' | 'absent' | 'ignored' | 'empty';
  /** Path-scoped and free of user values, so it is safe in a response. */
  detail?: string;
}

export interface LegacySetPlan {
  /** Legacy 1-based exercise number, as it appears in the stored key. */
  slot: number;
  /** 0-based, ready for `session_sets.set_index`. */
  setIndex: number;
}

export interface LegacySessionPlan {
  daySlug: LegacyDaySlug;
  /** Stable per (batch, day) so a racing replay collides instead of duplicating. */
  clientId: string;
  localDate: string;
  dateConfidence: 'high' | 'low';
  phase: LegacySessionPhase;
  sets: LegacySetPlan[];
  /** Slots the seeded content cannot place; their sets are dropped and reported. */
  unresolvableSlots: number[];
  /** Pull day's only surviving shape: counts, not rows. */
  aggregateOnly: { completedSets: number; completedExercises: number } | null;
}

export interface LegacyImportPlan {
  fingerprint: string;
  plans: LegacySessionPlan[];
  outcomes: KeyOutcome[];
  warnings: string[];
  fieldsNotRecovered: string[];
  /** The highest confidence the whole batch can honestly claim. */
  dateConfidence: 'high' | 'low';
}

type BooleanMap = Record<string, boolean>;
type UnknownRecord = Record<string, unknown>;

const SET_KEY_PATTERN = /^ex(\d+)-set(\d+)$/;

/** Push and legs both rendered six exercises; the seed carries six per day. */
const KNOWN_EXERCISE_SLOTS = 6;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toBooleanMap(value: unknown): BooleanMap {
  if (!isRecord(value)) return {};
  const map: BooleanMap = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'boolean') map[key] = entry;
  }
  return map;
}

/** Canonical JSON for hashing: sorted keys, so key insertion order cannot fork a batch. */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** SHA-256 over canonical JSON of the raw payload (spec §4.5 step 4). */
export function legacySourceFingerprint(raw: LegacyImportRequest): string {
  return createHash('sha256').update(canonicalize(raw), 'utf8').digest('hex');
}

/**
 * Deterministic UUID for `client_id`. That column is `NOT NULL` and unique per
 * user, and the fingerprint lookup can be raced by two concurrent requests: a
 * random id would let both insert and produce two identical archived sessions,
 * whereas a derived id makes the second write collide instead.
 */
export function legacyClientId(fingerprint: string, daySlug: LegacyDaySlug): string {
  const digest = createHash('sha256').update(`${fingerprint}|${daySlug}`, 'utf8').digest('hex');
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `a${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}

/** The single place a legacy 1-based exercise number becomes 0-based content order. */
export function legacySlotToOrderIndex(slot: number): number {
  return slot - 1;
}

function localDateFromMillis(millis: number): string {
  return new Date(millis).toISOString().slice(0, 10);
}

/**
 * Parse a stored value, then drop the collapsed pull-day sentinel so a real
 * browser payload can validate. Re-serializes in the shape
 * `storedJsonSchema` expects, and reports which sentinel was found.
 */
function stripCollapsedCheckboxKey(value: unknown): { value: unknown; collapsed: string | null } {
  const wasString = typeof value === 'string';
  let candidate: unknown = value;
  if (wasString) {
    try {
      candidate = JSON.parse(value) as unknown;
    } catch {
      return { value, collapsed: null };
    }
  }
  if (!isRecord(candidate)) return { value, collapsed: null };
  const checkboxStates = candidate['checkboxStates'];
  if (!isRecord(checkboxStates)) return { value, collapsed: null };

  const found = COLLAPSED_CHECKBOX_KEYS.find((key) => key in checkboxStates);
  if (found === undefined) return { value, collapsed: null };

  const sanitized: UnknownRecord = { ...candidate, checkboxStates: { ...checkboxStates } };
  const map = sanitized['checkboxStates'];
  if (isRecord(map)) delete map[found];
  return { value: wasString ? JSON.stringify(sanitized) : sanitized, collapsed: found === '' ? '""' : '"undefined"' };
}

function parseCompletedSets(map: BooleanMap): { sets: LegacySetPlan[]; slots: Set<number> } {
  const sets: LegacySetPlan[] = [];
  const slots = new Set<number>();
  for (const [key, checked] of Object.entries(map)) {
    if (!checked) continue;
    const match = SET_KEY_PATTERN.exec(key);
    if (!match) continue;
    const slot = Number(match[1]);
    const legacySetNumber = Number(match[2]);
    if (!Number.isInteger(slot) || !Number.isInteger(legacySetNumber)) continue;
    if (legacySetNumber < 1) continue;
    slots.add(slot);
    sets.push({ slot, setIndex: legacySetNumber - 1 });
  }
  sets.sort((left, right) => left.slot - right.slot || left.setIndex - right.setIndex);
  return { sets, slots };
}

function anyChecked(...maps: BooleanMap[]): boolean {
  return maps.some((map) => Object.values(map).some((checked) => checked));
}

function describeIssues(error: z.ZodError): string {
  const paths = error.issues
    .map((issue) => issue.path.map((segment) => String(segment)).join('.'))
    .filter((path) => path.length > 0)
    .slice(0, 4);
  const unique = Array.from(new Set(paths));
  return unique.length > 0 ? `unexpected shape at ${unique.join(', ')}` : 'unexpected shape';
}

interface DaySignals {
  sets: LegacySetPlan[];
  slots: Set<number>;
  evidence: boolean;
}

function pushSignals(parsed: PushWorkoutProgress): DaySignals {
  const state = parsed.state as UnknownRecord;
  const mainWorkoutSets = toBooleanMap(state['mainWorkoutSets']);
  const warmup = toBooleanMap(state['warmupExercises']);
  const preChecklist = toBooleanMap(state['preWorkoutChecklist']);
  const stretching = toBooleanMap(state['stretchingExercises']);
  const postChecklist = toBooleanMap(state['postWorkoutChecklist']);
  const { sets, slots } = parseCompletedSets(mainWorkoutSets);
  return {
    sets,
    slots,
    // Push is the one key that survives completion, so `completion` is itself
    // evidence a real workout happened (push-day-workout/app.js:90-96).
    evidence:
      sets.length > 0 ||
      parsed.currentPhase === 'completion' ||
      anyChecked(warmup, preChecklist, stretching, postChecklist),
  };
}

function legsSignals(parsed: LegsWorkoutProgress): DaySignals {
  const state = parsed.state as UnknownRecord;
  // Legs writes a full DOM snapshot to `checkboxStates` on every save
  // (legs-day-workout/app.js:959-961) while `state` only holds toggled keys, so
  // the snapshot is the authoritative source here; `state` is the fallback for a
  // payload produced before that code path existed.
  const snapshot = parsed.checkboxStates;
  const fromSnapshot = parseCompletedSets(snapshot);
  const { sets, slots } = fromSnapshot.sets.length > 0
    ? fromSnapshot
    : parseCompletedSets(toBooleanMap(state['mainWorkoutSets']));
  return {
    sets,
    slots,
    evidence:
      sets.length > 0 ||
      anyChecked(snapshot, toBooleanMap(state['warmupExercises'])),
  };
}

function pullSignals(parsed: PullDayProgress): DaySignals {
  // A pull session needs *workout* evidence: a completed-set count, a completed
  // exercise count, or a real start time (only `startWorkout()` sets it,
  // pull-day-workout/app.js:399-400). The named static checkboxes (`meal`,
  // `hydration`, `phone`, ...) are pre/post-workout checklist entries, and
  // `stretchStates` comes from a CSS class, so either alone would mint a session
  // out of someone opening the page and ticking a box. Their only role here is
  // that the payload is not empty, which is not the same claim.
  return {
    sets: [],
    slots: new Set<number>(),
    evidence:
      parsed.completedSets > 0 ||
      parsed.completedExercises > 0 ||
      parsed.workoutStartTime !== null,
  };
}

function unresolvableSlots(slots: Set<number>): number[] {
  return Array.from(slots)
    .filter((slot) => slot < 1 || slot > KNOWN_EXERCISE_SLOTS)
    .sort((left, right) => left - right);
}

interface PlannedKey {
  outcome: KeyOutcome;
  plan?: LegacySessionPlan;
  collapsedKey?: string;
}

function planKey(
  key: Exclude<LegacyKey, 'userStats'>,
  value: unknown,
  fingerprint: string,
  importedAt: Date,
): PlannedKey {
  const outcome = (status: KeyOutcome['status'], detail?: string): KeyOutcome =>
    detail ? { key, status, detail } : { key, status };

  if (value === undefined || value === null) return { outcome: outcome('absent') };

  const stripped = stripCollapsedCheckboxKey(value);
  const parsed = LegacyImportPayloadSchemas[key].safeParse(stripped.value);
  if (!parsed.success) {
    return { outcome: outcome('malformed', describeIssues(parsed.error)) };
  }

  const daySlug = DAY_BY_KEY[key];
  const identity = {
    daySlug,
    clientId: legacyClientId(fingerprint, daySlug),
  };
  const importedDate = localDateFromMillis(importedAt.getTime());

  if (key === 'pullDayProgress') {
    const pull = parsed.data as PullDayProgress;
    const signals = pullSignals(pull);
    if (!signals.evidence) {
      return { outcome: outcome('empty', 'no recorded interaction'), collapsedKey: stripped.collapsed ?? undefined };
    }
    const started = pull.workoutStartTime;
    return {
      outcome: outcome('planned'),
      collapsedKey: stripped.collapsed ?? undefined,
      plan: {
        ...identity,
        localDate: started === null ? importedDate : localDateFromMillis(started),
        dateConfidence: started === null ? 'low' : 'high',
        phase: mapPhase(pull.currentPhase),
        sets: [],
        unresolvableSlots: [],
        aggregateOnly: {
          completedSets: pull.completedSets,
          completedExercises: pull.completedExercises,
        },
      },
    };
  }

  const signals = key === 'pushWorkoutProgress'
    ? pushSignals(parsed.data as PushWorkoutProgress)
    : legsSignals(parsed.data as LegsWorkoutProgress);

  if (!signals.evidence) {
    return { outcome: outcome('empty', 'no sets or checklist items were recorded') };
  }

  const timestamp = key === 'pushWorkoutProgress'
    ? (parsed.data as PushWorkoutProgress).timestamp
    : undefined;

  return {
    outcome: outcome('planned'),
    plan: {
      ...identity,
      // Push stores only a last-write `timestamp` (`Date.now()` at the final
      // save, push-day-workout/app.js:749), which is the closest thing the
      // legacy app has to a session date and is what spec §4.5 step 3 adopts.
      // Legs has no date field at all, so the date is the import date at low
      // confidence rather than a guess.
      localDate: typeof timestamp === 'number' ? localDateFromMillis(timestamp) : importedDate,
      dateConfidence: typeof timestamp === 'number' ? 'high' : 'low',
      phase: mapPhase(
        key === 'pushWorkoutProgress'
          ? (parsed.data as PushWorkoutProgress).currentPhase
          : (parsed.data as LegsWorkoutProgress).currentPhase,
      ),
      sets: signals.sets,
      unresolvableSlots: unresolvableSlots(signals.slots),
      aggregateOnly: null,
    },
  };
}

function mapPhase(name: string): LegacySessionPhase {
  return PHASE_BY_LEGACY_NAME[name] ?? 'post_workout';
}

/**
 * Turn a validated request into an executable plan. Pure: no database, and the
 * clock is injected, so every rule documented above is unit-testable.
 */
export function planLegacyImport(
  raw: LegacyImportRequest,
  importedAt: Date = new Date(),
): LegacyImportPlan {
  if (LEGACY_KEYS.every((key) => raw[key] === undefined)) {
    throw new LegacyImportValidationError('No legacy progress payloads were provided.');
  }

  const fingerprint = legacySourceFingerprint(raw);
  const outcomes: KeyOutcome[] = [];
  const plans: LegacySessionPlan[] = [];
  const warnings: string[] = [];
  const fieldsNotRecovered: string[] = [];

  for (const key of LEGACY_KEYS) {
    if (key === 'userStats') {
      if (raw.userStats === undefined) {
        outcomes.push({ key, status: 'absent' });
      } else {
        outcomes.push({ key, status: 'ignored' });
        // Not a failure to fix: the dashboard derived streaks and hours from
        // day-of-week arithmetic and Math.random(), so nothing real was stored.
        fieldsNotRecovered.push(
          'userStats: dashboard figures were generated at render time and never stored',
        );
      }
      continue;
    }

    const result = planKey(key, raw[key], fingerprint, importedAt);
    outcomes.push(result.outcome);

    if (result.collapsedKey) {
      warnings.push(
        `${key}: one checkbox entry was stored under the collapsed key ${result.collapsedKey} ` +
          '(the legacy app rendered set inputs without ids), so it cannot be attributed to a set',
      );
    }

    if (result.outcome.status === 'empty') {
      fieldsNotRecovered.push(`${key}: stored payload recorded no completed items, so no session was created`);
      continue;
    }
    if (!result.plan) continue;

    const plan = result.plan;
    if (plan.daySlug === 'pull' && plan.aggregateOnly) {
      warnings.push(
        `pullDayProgress: ${plan.aggregateOnly.completedSets} completed sets across ` +
          `${plan.aggregateOnly.completedExercises} exercises are represented as aggregate counts only; ` +
          'per-set detail was never stored',
      );
      fieldsNotRecovered.push(
        'pullDayProgress: per-set completion (set checkboxes were stored without ids)',
      );
    }
    if (plan.unresolvableSlots.length > 0) {
      fieldsNotRecovered.push(
        `${key}: sets for exercise ${plan.unresolvableSlots.join(', ')} ` +
          'have no matching exercise in seeded content',
      );
    }
    if (plan.dateConfidence === 'low') {
      fieldsNotRecovered.push(`${plan.daySlug} day: the legacy app stored no workout date, so the import date was used`);
    }
    plans.push(plan);
  }

  if (plans.length === 0) {
    throw new LegacyImportValidationError(
      'No importable legacy progress payload was found.',
    );
  }

  fieldsNotRecovered.push(
    'weight, reps, RPE, and actual rest taken: never captured by the legacy app',
    'checklist, warm-up, stretch, and timer state: no target representation for per-item booleans',
    'session start time and duration: only a last-save timestamp was stored, and only for push day',
  );

  return {
    fingerprint,
    plans,
    outcomes,
    warnings,
    fieldsNotRecovered: Array.from(new Set(fieldsNotRecovered)),
    dateConfidence: plans.every((plan) => plan.dateConfidence === 'high') ? 'high' : 'low',
  };
}

/** The report the client is shown (spec §4.5 step 6). */
export function buildImportReport(
  plan: LegacyImportPlan,
  written: LegacyImportedCounts,
): ImportReport {
  const malformed = plan.outcomes
    .filter((outcome) => outcome.status === 'malformed')
    .map((outcome) => `${outcome.key}: skipped, ${outcome.detail ?? 'it did not parse'}`);

  // Counts come from what the transaction wrote, never from the plan: if seeded
  // content was missing for one day, the report has to say two were asked for
  // and one arrived, rather than quoting the request back at the user.
  const unwritten = plan.plans.length - written.sessionsInserted;
  const partial = unwritten > 0
    ? [`${unwritten} planned session(s) could not be written because their seeded routine day is missing`]
    : [];

  return {
    sessionsCreated: written.sessionsInserted,
    setsRecovered: written.setsInserted,
    fieldsNotRecovered: [...plan.fieldsNotRecovered, ...malformed, ...partial],
    dateConfidence: plan.dateConfidence,
    warnings: [...plan.warnings, ...malformed],
  };
}

export type { ImportReport };
