'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PreferredUnit } from '../../../../lib/contracts/profile';
import type { SessionPhase, TaskKey } from '../../../../lib/contracts/common';
import type { SyncMutation } from '../../../../lib/contracts/sync';
import { TASK_PHASES } from '../../../../lib/domain/sessions/transition-table';
import type { PrefillData } from '../../../../lib/contracts/sessions';
import { parseSessionView, type SessionView } from '../../../../lib/views/session-view';
import { formatWeight, parseReps, parseWeightToKg } from '../../../../lib/domain/units';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import {
  SessionSyncProvider,
  queryKey,
  useSessionSync,
  useSyncSnapshot,
} from '../../state/provider';
import {
  projectPending,
  type PlannedSet,
  type PlannedTask,
  type VisibleRejection,
} from '../../state/reconcile';
import {
  browserTimerClock,
  createCountdownTimer,
  createElapsedTimer,
  formatDuration,
  type CountdownState,
  type Timer,
} from '../../state/timer-controller';
import { browserChime, type Chime } from '../../state/audio-cue';

/**
 * M3-06 (#63): the session runner — the app's reason to exist, and the first caller of
 * `#62`'s outbox. Three things about how it is put together are load-bearing:
 *
 * **The projected view is the only source of truth for what is on screen.** A tick does
 * not write to a separate "optimistic state" that must later be reconciled with the
 * queue. It enqueues, and `projectPending(serverView, pending)` composes the answer. One
 * overlay means the tick and its durable record cannot disagree, which is the whole
 * reason #62 kept refused mutations out of the projection's reach.
 *
 * **Nothing awaits the network before painting.** `mutate` resolves when IndexedDB holds
 * the row, which is also when the snapshot listener re-renders. The latency measurement
 * in `tests/e2e/session-runner.spec.ts` brackets exactly this interval.
 *
 * **Weight and reps live in a draft, not in a store.** G6's premise is that recording a
 * set takes load *and* completion in one interaction; the card's invariant is that
 * prefill is "an editable default, never a committed value". A draft map satisfies both:
 * typing costs no mutation, and the tap that follows carries whatever is on screen.
 */

const PHASE_ORDER = ['pre_workout', 'exercise', 'rest', 'stretch', 'post_workout'] as const;
/**
 * The rest default is inherited from the module this replaces, not invented:
 * `push-day-workout/app.js:245` starts its rest timer at `seconds: 90`, and the pull and legs
 * modules do the same. It is a *default the athlete can change* rather than a fact about them,
 * because the data has no machine-readable rest duration at all — `exercises.rest_time` is a text
 * column seeded with strings like `'60-90s'` (`db/schema/index.ts:113`) — so the honest options
 * were a changeable number or no timer.
 */
const REST_DEFAULT_MS = 90_000;
/** The one adjustment offered mid-rest. "+15 s" is what an athlete actually asks a timer for. */
const REST_EXTEND_MS = 15_000;
/** How late in the countdown a screen reader is told about it: once, not every second. */
const REST_WARN_MS = 10_000;

const PHASE_LABEL: Record<string, string> = {
  pre_workout: 'Warming up',
  exercise: 'Working out',
  rest: 'Resting',
  stretch: 'Stretching',
  post_workout: 'Finishing up',
};

/**
 * Labels for the three gates the phase machine checks.
 *
 * `SessionTaskState` has no label column, so there is nothing to read from the server
 * here; a name that no storage row backs would be a fiction rendered as data.
 */
const TASK_LABELS: Record<TaskKey, string> = {
  warm_up: 'Warm-up done',
  main_workout: 'Main workout complete',
  stretch: 'Stretch routine done',
};

/**
 * Which block of the screen each gate belongs to.
 *
 * Not the same question as `TASK_PHASES`, which asks when a task may be *ticked*: the
 * `main_workout` task is answered during `exercise`/`rest`, but it belongs to the Strength
 * block. Filtering the checklist by `TASK_PHASES` against a section name — the first draft
 * did exactly that — hides the `main_workout` checkbox entirely, and a session then has no
 * way to reach `stretch`, no way to reach `post_workout`, and no way to finish. The
 * failure was silent until an E2E test tried to walk a whole workout.
 */
const TASK_SECTION: Record<TaskKey, 'pre_workout' | 'main_workout' | 'stretch'> = {
  warm_up: 'pre_workout',
  main_workout: 'main_workout',
  stretch: 'stretch',
};

/**
 * What the next phase asks for, worked out locally.
 *
 * This mirrors `assertTransitionAllowed`, and it is *display only* — it produces a hint,
 * never a disabled control. The client asks and the server decides: if the two ever
 * disagree, the user gets a rejection carrying the server's reason and the view refetches,
 * which is the behaviour #62 exists to provide. A client-side gate that blocked the button
 * would fail silently instead, and the athlete would never find out which rule they hit.
 */
function gateFor(next: SessionPhase, tasks: PlannedTask[], sets: PlannedSet[]): string | null {
  const done = (key: TaskKey) => tasks.some((task) => task.taskKey === key && task.isCompleted);
  if (next === 'exercise' && !done('warm_up')) return TASK_LABELS.warm_up;
  if (next === 'stretch') {
    if (!done('main_workout')) return TASK_LABELS.main_workout;
    const unlogged = sets.filter((set) => set.phase === 'main_workout' && !set.isCompleted).length;
    if (unlogged > 0) return `${unlogged} more set${unlogged === 1 ? '' : 's'} logged`;
  }
  if (next === 'post_workout' && !done('stretch')) return TASK_LABELS.stretch;
  return null;
}

interface DraftValue {
  weight: string;
  reps: string;
}

export default function SessionScreen(props: {
  userId: string;
  sessionId: string;
  initialView: SessionView;
  unit: PreferredUnit;
  /** Server-fetched prefill, so a first paint does not wait on a client round trip. */
  initialPrefill: PrefillPayload;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 0, refetchOnWindowFocus: false } },
      }),
  );

  const refetch = useCallback(async () => {
    // Awaited by the engine, so "any rejection forces a full authoritative refetch"
    // (§4.3) is genuinely finished before the queue reports its state.
    await queryClient.refetchQueries({
      queryKey: queryKey(props.userId, 'session', props.sessionId),
      type: 'active',
    });
  }, [props.sessionId, props.userId, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionSyncProvider
        userId={props.userId}
        sessionId={props.sessionId}
        onRefetch={refetch}
        enablePolling={props.initialView.status === 'in_progress'}
      >
        <Runner {...props} />
      </SessionSyncProvider>
    </QueryClientProvider>
  );
}

/*
 * `PrefillData` is imported rather than re-declared here. #61 briefly held a
 * hand-copied enum of the session status in a view file, and it disagreed with the
 * database in both directions — §8.7's rule is that a shape which claims to mirror
 * storage must be *literally* the storage's schema, so this screen takes the contract
 * type and inherits whatever it says.
 */
export type PrefillPayload = PrefillData;

function Runner({ userId, sessionId, initialView, unit, initialPrefill }: {
  userId: string;
  sessionId: string;
  initialView: SessionView;
  unit: PreferredUnit;
  initialPrefill: PrefillPayload;
}) {
  const { engine, ready, unavailable } = useSessionSync();
  const snapshot = useSyncSnapshot();
  const [drafts, setDrafts] = useState<Record<string, DraftValue>>({});
  const [announcement, setAnnouncement] = useState('');
  const measureArmed = useRef(false);
  const chime = useRef<Chime | null>(null);

  const session = useQuery({
    queryKey: queryKey(userId, 'session', sessionId),
    queryFn: async (): Promise<SessionView> => {
      const response = await fetch(`/api/sessions/${sessionId}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load this session.');
      const body = (await response.json()) as { data?: unknown };
      return parseSessionView(body.data);
    },
    initialData: initialView,
  });

  const serverView = session.data ?? initialView;
  const projection = useMemo(
    () => projectPending(serverView, snapshot.pending),
    [serverView, snapshot.pending],
  );

  const prefillBySet = useMemo(() => {
    const map = new Map<string, PrefillData['entries'][number]>();
    for (const entry of initialPrefill.entries) {
      map.set(`${entry.exerciseId}:${entry.setIndex}`, entry);
    }
    return map;
  }, [initialPrefill.entries]);

  const readOnly = serverView.status !== 'in_progress';
  // The phase clause of `assertSetMutationAllowed`, restated here as an affordance rule.
  const setsOpen = serverView.phase === 'exercise' || serverView.phase === 'rest';
  const stretchPlacements = serverView.routineDay.exercises.filter(
    (placement) => placement.phase === 'stretch',
  );

  /*
   * The session clock (#64), derived from `startedAt` — an absolute instant the server already
   * owns — and never from a counter that adds a second per repaint. That distinction is the whole
   * reason the module exists: a counter-based elapsed clock understates a workout by exactly as
   * long as the tab was backgrounded, so a 40-minute session reports 22 minutes and the number on
   * screen is not about the workout at all.
   */
  const finishedElapsedMs = useMemo(() => {
    if (!readOnly || serverView.completedAt === null) return null;
    return Math.max(0, Date.parse(serverView.completedAt) - Date.parse(serverView.startedAt));
  }, [readOnly, serverView.completedAt, serverView.startedAt]);

  const [liveElapsedMs, setLiveElapsedMs] = useState<number | null>(null);

  // A finished session shows a length, not a running clock: a number that keeps counting on a
  // read-only screen is a live measurement of something that stopped happening. Derived rather
  // than set from the effect below, because writing state synchronously inside an effect is how a
  // render loop starts.
  const elapsedMs = finishedElapsedMs ?? liveElapsedMs;

  useEffect(() => {
    if (finishedElapsedMs !== null) return;
    const timer = createElapsedTimer(browserTimerClock());
    const unsubscribe = timer.subscribe((state) => setLiveElapsedMs(state.elapsedMs));
    timer.start(Date.parse(serverView.startedAt));
    return () => {
      unsubscribe();
      timer.cancel();
    };
  }, [finishedElapsedMs, serverView.startedAt]);

  /*
   * Audio unlocks on the first gesture, because a context constructed on mount arrives suspended
   * and never sounds — and reports nothing when it fails that way.
   *
   * `document` in capture phase, not `window` bubbling, and that placement is measured rather than
   * preferred. The first version registered `pointerdown` on `window` with `{ once: true }`; an E2E
   * probe then watched four pointerdowns go by — a spy listener on `document` (capture) counted all
   * four, and the app's own `window` listener was never invoked, with no cleanup having run to
   * remove it. Rather than spend the slice explaining that anomaly, the unlock now hangs off the
   * place the events demonstrably arrive *and* off the component's own handlers below, so nothing
   * depends on either route alone.
   */
  useEffect(() => {
    const cue = browserChime();
    chime.current = cue;
    const unlock = (): void => {
      cue.unlock();
    };
    document.addEventListener('pointerdown', unlock, { capture: true, once: true });
    document.addEventListener('keydown', unlock, { capture: true, once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
      chime.current = null;
    };
  }, []);

  /**
   * Arming the chime from inside the handlers, not only from a listener.
   *
   * A click on one of these controls *is* the user gesture the Web Audio policy asks for, so
   * relying on a separately-registered listener adds a way to fail without adding a way to work.
   * `unlock()` is idempotent and never throws, which makes it free to call on every interaction.
   */
  const unlockChime = useCallback(() => {
    chime.current?.unlock();
  }, []);

  // Stable on purpose: `RestTimer` keys its effect on this, and a new identity every render would
  // restart the countdown on every repaint — a timer that resets itself once a second.
  const playChime = useCallback(() => {
    chime.current?.play();
  }, []);

  function draftFor(exerciseId: string, set: PlannedSet): DraftValue {
    const key = `${exerciseId}:${set.setIndex}`;
    const draft = drafts[key];
    if (draft) return draft;
    const prefill = prefillBySet.get(key);
    // Server truth first, then prefill, then empty. Order matters: a set that already
    // has a stored load must not be overwritten by last session's number.
    const weightKg = set.weightKg ?? prefill?.weightKg ?? null;
    const reps = set.reps ?? prefill?.reps ?? null;
    return {
      weight: weightKg === null ? '' : String(displayNumber(weightKg, unit)),
      reps: reps === null ? '' : String(reps),
    };
  }

  /**
   * Log or un-log one set.
   *
   * `useCallback` because `SetRow` compares callback identity: a fresh closure per render
   * would re-render all 17 rows on every tap, which is the thing this file's own latency
   * measurement caught.
   *
   * The announcement arrives as an argument for the same reason — the row knows its own
   * group's counts, and reading them from `projection` here would put a changing value in
   * the dependency list and undo the stability.
   */
  /**
   * Arming the chime from inside the handlers, not only from a listener.
   *
   * A click on one of these controls *is* the user gesture the Web Audio policy asks for, so
   * relying on a separately-registered listener adds a way to fail without adding a way to work.
   * `unlock()` is idempotent and never throws, which makes it free to call on every interaction.
   */
  const tap = useCallback(
    async (
      exerciseId: string,
      setIndex: number,
      isCompleted: boolean,
      draft: DraftValue,
      announcement: string,
    ) => {
      unlockChime();
      if (engine === null || readOnly || !setsOpen) return;

      const weightKg = parseWeightToKg(draft.weight, unit);
      const reps = parseReps(draft.reps);
      // A tap that cannot carry a valid load is refused on the screen rather than sent as
      // `null`, because `null` is a meaningful answer server-side ("bodyweight, no load")
      // and silently producing it would log something the athlete never intended.
      if (isCompleted && draft.weight.trim() !== '' && weightKg === null) {
        setAnnouncement(`Weight "${draft.weight}" is not a number in ${unit}. Set not logged.`);
        return;
      }
      if (isCompleted && draft.reps.trim() !== '' && reps === null) {
        setAnnouncement(`Reps "${draft.reps}" must be a whole number. Set not logged.`);
        return;
      }

      const mutation: SyncMutation = {
        op: 'set.upsert',
        mutationId: crypto.randomUUID(),
        clientTs: new Date().toISOString(),
        sessionId,
        exerciseId,
        setIndex,
        isCompleted,
        // Canonical kg on the wire, always. ADR-0005: the profile unit is a rendering
        // preference, so this is the one place it is converted, on the way out.
        weightKg,
        reps,
      };

      // Brackets "tap to visible". `start` is cleared each press so the measure entries
      // the E2E reads are one per tap rather than a chain of overlapping marks.
      performance.clearMarks('set-tap-start');
      performance.mark('set-tap-start');
      measureArmed.current = true;
      await engine.mutate(mutation);

      setAnnouncement(announcement);
    },
    [engine, readOnly, setsOpen, sessionId, unit, unlockChime],
  );

  /*
   * The end of the tap measurement, taken at the commit rather than on the next frame.
   *
   * The first draft closed the measure inside `requestAnimationFrame`, which silently added
   * most of a frame — 16.7 ms at 60 Hz, and it varies with refresh rate and how busy the
   * compositor is — to every single sample. That is not measuring the tap; it is measuring
   * when the browser felt like painting. An effect with no dependency list runs after each
   * commit, so arming it before `mutate` and closing it here measures the thing the gate is
   * about: the moment the row's DOM says what the queue says.
   */
  useEffect(() => {
    if (!measureArmed.current) return;
    measureArmed.current = false;
    performance.mark('set-tap-end');
    performance.measure('set-tap', 'set-tap-start', 'set-tap-end');
    performance.clearMarks('set-tap-end');
  });

  /**
   * Stable identity, and that is a functional requirement rather than a style preference:
   * `SetRow`'s comparator rejects a re-render when the callback changes, so a closure
   * recreated on every render would make the memoization useless.
   */
  const handleDraftChange = useCallback(
    (
      exerciseId: string,
      setIndex: number,
      field: keyof DraftValue,
      value: string,
      base: DraftValue,
    ) => {
      setDrafts((current) => ({
        ...current,
        [`${exerciseId}:${setIndex}`]: { ...base, [field]: value },
      }));
    },
    [],
  );

  async function toggleTask(taskKey: TaskKey, completed: boolean) {
    unlockChime();
    if (engine === null || readOnly) return;
    await engine.mutate({
      op: 'task.complete',
      mutationId: crypto.randomUUID(),
      clientTs: new Date().toISOString(),
      sessionId,
      taskKey,
      // `null` is the un-tick. The field is nullable on the contract precisely because
      // a task can be answered and then answered differently.
      completedAt: completed ? new Date().toISOString() : null,
    });
    setAnnouncement(`${TASK_LABELS[taskKey]} ${completed ? 'checked' : 'unchecked'}.`);
  }

  const nextPhase = nextPhaseOf(serverView.phase);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-4 flex flex-col gap-1">
        <Link href="/" className="text-sm text-muted-foreground underline">
          Back to today
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{serverView.routineDay.name}</h1>
          <StatusBadge status={serverView.status} />
        </div>
      </header>

      <p className="text-sm text-muted-foreground" data-testid="session-subtitle">
        {serverView.localDate} · {PHASE_LABEL[serverView.phase] ?? serverView.phase}
      </p>

      {/*
        * `role="timer"` with `aria-live="off"`, deliberately: the role exists for exactly this
        * content, and its implicit live state is off — which is right for a value that changes
        * every second. A polite live region here would make a screen reader speak ninety times per
        * rest period and drown out the rest of the screen, so the milestones worth interrupting for
        * are announced through the runner's own polite region instead.
        */}
      <p
        className="text-sm text-muted-foreground tabular-nums"
        data-testid="session-elapsed"
        role="timer"
        aria-live="off"
        aria-atomic="true"
      >
        {elapsedMs === null
          ? 'Timing…'
          : `${readOnly ? 'Workout length' : 'Elapsed'} ${formatDuration(elapsedMs)}`}
      </p>

      {unavailable !== null && <Banner tone="error">{unavailable}</Banner>}

      {readOnly && (
        <Banner tone="info">
          This session is {serverView.status === 'archived' ? 'archived' : 'completed'}, so it is
          read-only. Nothing you tap here will be recorded.
        </Banner>
      )}

      {engine === null && unavailable === null && (
        <Banner tone="info">Restoring your offline queue…</Banner>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="sync-status">
        <Badge
          variant={
            snapshot.rejections.length > 0
              ? 'destructive'
              : snapshot.pendingCount === 0
                ? 'secondary'
                : 'outline'
          }
          data-testid="queue-badge"
        >
          {/*
            * Three states, and the middle one is the trap. A refused mutation *leaves*
            * the queue (`discardRefused`, #62), so after a rejection `pendingCount` is
            * zero while nothing whatsoever has been synced. The first version of this
            * badge asked only "is the queue empty?" and told an athlete their workout was
            * saved when the server had rejected all of it — the exact lie #62's
            * applied-versus-refused split exists to prevent, re-introduced by the copy
            * underneath it.
            */}
          {snapshot.rejections.length > 0
            ? `${snapshot.rejections.length} refused by the server`
            : snapshot.pendingCount === 0
              ? 'All changes synced'
              : `${snapshot.pendingCount} waiting to sync · oldest ${formatDuration(snapshot.oldestAgeMs)}`}
        </Badge>
      </div>

      {/* One live region for every state change the user cannot see coming: a refused
          set, a queue that emptied, an invalid weight. Announcing from the tick handler
          as well keeps "set 3 of 5 completed" available without making the row itself
          a live region, which would shout on every keystroke. */}
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      {snapshot.rejections.length > 0 && (
        <ul className="my-3 list-disc space-y-1 pl-5 text-sm" data-testid="rejections">
          {snapshot.rejections.map((rejection) => (
            <li key={rejection.mutationId}>
              <RejectionLine rejection={rejection} />
            </li>
          ))}
          <li>
            <Button
              type="button"
                            variant="outline"
              onClick={() => {
                void session.refetch();
                void engine?.dismissRejections();
              }}
            >
              Reload this session
            </Button>
          </li>
        </ul>
      )}

      <PhaseStepper
        current={serverView.phase}
        next={nextPhase}
        gate={gateFor(nextPhase ?? serverView.phase, projection.tasks, projection.sets)}
        disabled={!ready || readOnly}
        onAdvance={async (phase) => {
          unlockChime();
          if (engine === null) return;
          await engine.mutate({
            op: 'phase.advance',
            mutationId: crypto.randomUUID(),
            clientTs: new Date().toISOString(),
            sessionId,
            phase,
          });
          setAnnouncement(`Phase change to ${PHASE_LABEL[phase] ?? phase} queued.`);
        }}
      />

      {/*
        * Mounting *is* the cancellation rule: the timer exists while the phase is `rest` and is
        * unmounted the moment the session advances or finishes, and its cleanup cancels the
        * countdown and detaches the visibility handler. A leaked interval that outlives its phase
        * would keep writing numbers into a screen section that is no longer about rest.
        */}
      {serverView.phase === 'rest' && !readOnly && (
        <RestTimer announce={setAnnouncement} onChime={playChime} />
      )}

      <TaskChecklist
        section="pre_workout"
        tasks={projection.tasks}
        currentPhase={serverView.phase}
        disabled={!ready || readOnly}
        onToggle={toggleTask}
      />

      <section aria-labelledby="phase-main_workout" className="mt-6">
        <h2 id="phase-main_workout" className="text-lg font-medium">
          Strength
        </h2>
        {/*
          * `assertSetMutationAllowed` refuses a set change outside `exercise`/`rest`, so
          * the rows are shown — the plan and the previous load are worth reading during a
          * warm-up — but the controls are not offered. A tick that is refused every time
          * it is pressed is not a control; it is a way of teaching the user that the
          * interface lies.
          */}
        {!setsOpen && !readOnly && (
          <p className="mt-1 text-sm text-muted-foreground" data-testid="sets-locked">
            {serverView.phase === 'pre_workout'
              ? 'Sets are recorded once the warm-up is done and the main workout starts.'
              : `Sets cannot be changed while ${PHASE_LABEL[serverView.phase] ?? serverView.phase.toLowerCase()}.`}
          </p>
        )}
        {groupPlannedSets(projection.sets).map((group) => (
          <SetGroup
            key={group.exerciseId}
            exerciseName={group.exerciseName}
            exerciseId={group.exerciseId}
            sets={group.rows}
            draftFor={(set) => draftFor(group.exerciseId, set)}
            onDraftChange={handleDraftChange}
            unit={unit}
            prefillFor={(setIndex) => prefillBySet.get(`${group.exerciseId}:${setIndex}`)}
            disabled={!ready || readOnly || !setsOpen}
            onTick={tap}
          />
        ))}
        <TaskChecklist
          section="main_workout"
          tasks={projection.tasks}
          currentPhase={serverView.phase}
          disabled={!ready || readOnly}
          onToggle={toggleTask}
        />
      </section>

      {stretchPlacements.length > 0 && (
        <section aria-labelledby="phase-stretch" className="mt-6">
          <h2 id="phase-stretch" className="text-lg font-medium">
            Stretch
          </h2>
          {/*
            * A sequence to follow, not rows to tick. Set rows exist only for main-workout
            * strength placements (`assertSetMutationAllowed` rejects anything else), and the
            * stretch phase is completed by its checklist item — so rendering per-set ticks
            * here would invent a control the storage cannot represent. This is the same
            * rule #61's read-only view drew, kept because it is the schema's rule and not
            * a stylistic choice.
            */}
          <p className="mt-1 text-sm text-muted-foreground">
            Follow the sequence, then tick the checklist item below.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {stretchPlacements.map((placement) => (
              <li key={placement.id} data-testid={`stretch-${placement.exercise.id}`}>
                {placement.exercise.name}
                <span className="text-muted-foreground">
                  {placement.targetReps != null ? ` · ${placement.targetReps} reps` : ''}
                  {placement.restTime ? ` · rest ${placement.restTime}` : ''}
                </span>
              </li>
            ))}
          </ol>
          <TaskChecklist
            section="stretch"
            tasks={projection.tasks}
            currentPhase={serverView.phase}
            disabled={!ready || readOnly}
            onToggle={toggleTask}
          />
        </section>
      )}

      {serverView.status === 'in_progress' && (
        <div className="mt-8">
          <Button
            type="button"
            disabled={!ready}
            data-testid="finish-session"
            onClick={async () => {
              if (engine === null) return;
              const finish: SyncMutation = {
                op: 'session.finish',
                mutationId: crypto.randomUUID(),
                clientTs: new Date().toISOString(),
                sessionId,
                completedAt: new Date().toISOString(),
              };
              // Queueable offline (§8.1): the finish is a sync op, so a user in a lift
              // with no bars can still end their session, and it lands later.
              await engine.mutate(finish);
              setAnnouncement('Session finish queued. It will sync when you have signal.');
            }}
          >
            Finish session
          </Button>
        </div>
      )}
    </main>
  );
}

/** Planned rows grouped by exercise, in the plan's own order. */
function groupPlannedSets(
  sets: PlannedSet[],
): { exerciseId: string; exerciseName: string; rows: PlannedSet[] }[] {
  const groups = new Map<string, { exerciseId: string; exerciseName: string; rows: PlannedSet[] }>();
  for (const set of sets) {
    const existing = groups.get(set.exerciseId);
    if (existing) {
      existing.rows.push(set);
    } else {
      groups.set(set.exerciseId, {
        exerciseId: set.exerciseId,
        exerciseName: set.exerciseName,
        rows: [set],
      });
    }
  }
  return [...groups.values()].map((group) => ({
    ...group,
    rows: group.rows.sort((a, b) => a.setIndex - b.setIndex),
  }));
}

function displayNumber(weightKg: number, unit: PreferredUnit): string {
  // Reuse the formatter's rounding so the value a user sees is the value that gets
  // edited. Two rounding rules in one screen is how a displayed 220.5 re-saves as 221.
  return formatWeight(weightKg, unit).replace(unit === 'kg' ? ' kg' : ' lb', '');
}

/**
 * One exercise: a card, and one row per planned set.
 *
 * The header's "N of M complete" is derived from the projection, so it moves with a tick
 * without any local counter to keep in step.
 */
interface SetGroupProps {
  exerciseName: string;
  exerciseId: string;
  sets: PlannedSet[];
  draftFor: (set: PlannedSet) => DraftValue;
  onDraftChange: (
    exerciseId: string,
    setIndex: number,
    field: keyof DraftValue,
    value: string,
    base: DraftValue,
  ) => void;
  unit: PreferredUnit;
  prefillFor: (setIndex: number) => PrefillData['entries'][number] | undefined;
  disabled: boolean;
  onTick: SetRowProps['onTick'];
}

function SetGroup(props: SetGroupProps) {
  const { sets, exerciseId } = props;
  const completed = sets.filter((set) => set.isCompleted).length;

  return (
    <Card className="mt-3">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{props.exerciseName}</CardTitle>
        <span className="text-sm text-muted-foreground" data-testid={`progress-${exerciseId}`}>
          {completed} of {sets.length} complete
        </span>
      </CardHeader>
      <CardContent>
        {sets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sets recorded for this exercise yet.</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">
              Sets for {props.exerciseName}. Weight and reps are editable; the tick records them.
            </caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="w-12">Set</th>
                <th scope="col">Weight ({props.unit})</th>
                <th scope="col" className="w-20">Reps</th>
                <th scope="col" className="w-28">Done</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((set) => (
                <SetRow
                  key={set.setIndex}
                  exerciseId={exerciseId}
                  exerciseName={props.exerciseName}
                  setIndex={set.setIndex}
                  isCompleted={set.isCompleted}
                  weight={props.draftFor(set).weight}
                  reps={props.draftFor(set).reps}
                  prefill={props.prefillFor(set.setIndex)}
                  unit={props.unit}
                  groupTotal={sets.length}
                  groupCompleted={completed}
                  disabled={props.disabled}
                  onDraftChange={props.onDraftChange}
                  onTick={props.onTick}
                />
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

interface SetRowProps {
  exerciseId: string;
  exerciseName: string;
  setIndex: number;
  isCompleted: boolean;
  weight: string;
  reps: string;
  prefill: PrefillData['entries'][number] | undefined;
  unit: PreferredUnit;
  disabled: boolean;
  /** This exercise's planned-set count and how many of them are logged, pre-tick. */
  groupTotal: number;
  groupCompleted: number;
  onDraftChange: SetGroupProps['onDraftChange'];
  onTick: (
    exerciseId: string,
    setIndex: number,
    isCompleted: boolean,
    draft: DraftValue,
    announcement: string,
  ) => void;
}

/**
 * A single set row, memoized with a hand-written comparator.
 *
 * This exists because of a measurement, not a hunch. Every tick re-runs `projectPending`,
 * which returns a fresh array of fresh objects, so the default shallow check calls every
 * row changed and re-renders the whole session: on the seeded Push Day (17 planned sets),
 * a tap measured `median=27.2 p95=49.9 max=84.6 ms` — 0.1 ms inside this card's 50 ms
 * gate, which is a pass that will fail on a slower CI runner. What decides this row's
 * pixels is a handful of primitives, so comparing those makes a tick's render cost
 * proportional to the row that was tapped instead of the size of the workout.
 */
const SetRow = memo(
  function SetRow(props: SetRowProps) {
    const { exerciseId, setIndex, isCompleted, weight, reps, disabled, unit } = props;
    const draft = { weight, reps };
    const fieldId = `${exerciseId}-${setIndex}`;
    // `isCompleted` is the state *before* this tap, so the count after it is one step
    // away in the obvious direction.
    const done = isCompleted ? props.groupCompleted - 1 : props.groupCompleted + 1;
    const announcement = `Set ${setIndex + 1} of ${props.groupTotal} ${
      isCompleted ? 'logged' : 'un-logged'
    }. ${done} of ${props.groupTotal} complete.`;

    return (
      <tr data-testid={`set-row-${fieldId}`}>
        <th scope="row" className="py-2 font-medium">
          {setIndex + 1}
        </th>
        <td className="py-1 pr-2">
          <label className="sr-only" htmlFor={`weight-${fieldId}`}>
            Weight in {unit} for set {setIndex + 1} of {props.exerciseName}
          </label>
          <Input
            id={`weight-${fieldId}`}
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            className="h-10 max-w-28"
            value={weight}
            onChange={(event) =>
              props.onDraftChange(exerciseId, setIndex, 'weight', event.target.value, draft)
            }
          />
          {props.prefill !== undefined && (
            <p className="mt-1 text-xs text-muted-foreground">
              last: {formatPrefill(
                props.prefill.sourceLocalDate,
                props.prefill.weightKg,
                props.prefill.reps,
                unit,
              )}
            </p>
          )}
        </td>
        <td className="py-1 pr-2">
          <label className="sr-only" htmlFor={`reps-${fieldId}`}>
            Reps for set {setIndex + 1} of {props.exerciseName}
          </label>
          <Input
            id={`reps-${fieldId}`}
            inputMode="numeric"
            autoComplete="off"
            disabled={disabled}
            className="h-10 max-w-16"
            value={reps}
            onChange={(event) =>
              props.onDraftChange(exerciseId, setIndex, 'reps', event.target.value, draft)
            }
          />
        </td>
        <td className="py-1">
          <button
            type="button"
            data-testid={`tick-${fieldId}`}
            disabled={disabled}
            aria-pressed={isCompleted}
            onClick={() => props.onTick(exerciseId, setIndex, !isCompleted, draft, announcement)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {/* Colour, icon, and text together (RFC §4.7). A tick alone would be the
                legacy app's bare boolean with a new coat of paint. */}
            <span aria-hidden="true">{isCompleted ? '✓' : '○'}</span>
            {isCompleted ? 'Logged' : 'Not logged'}
          </button>
        </td>
      </tr>
    );
  },
  (a, b) =>
    a.exerciseId === b.exerciseId &&
    a.setIndex === b.setIndex &&
    a.isCompleted === b.isCompleted &&
    a.weight === b.weight &&
    a.reps === b.reps &&
    a.disabled === b.disabled &&
    a.unit === b.unit &&
    a.prefill === b.prefill &&
    a.groupTotal === b.groupTotal &&
    a.groupCompleted === b.groupCompleted &&
    a.onDraftChange === b.onDraftChange &&
    a.onTick === b.onTick,
);

function TaskChecklist(props: {
  section: 'pre_workout' | 'main_workout' | 'stretch';
  tasks: PlannedTask[];
  currentPhase: SessionPhase;
  disabled: boolean;
  onToggle: (taskKey: TaskKey, completed: boolean) => void;
}) {
  const rows = props.tasks.filter((task) => TASK_SECTION[task.taskKey] === props.section);
  if (rows.length === 0) return null;

  return (
    <fieldset className="mt-4 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">
        {props.section === 'pre_workout' ? 'Before you start' : 'Finish this phase'}
      </legend>
      <div className="flex flex-col gap-2">
        {rows.map((task) => {
          const available = (TASK_PHASES[task.taskKey] as readonly string[]).includes(
            props.currentPhase,
          );
          // Shown but not offered when it is not this phase's turn. Ticking a task outside
          // its phase is a server-side validation error ("Task stretch is not valid in
          // phase exercise"), and a control the screen hands over should not be capable of
          // producing one.
          const locked = !available && !task.isCompleted;
          return (
            <label
              key={task.taskKey}
              className={`flex items-center gap-2 text-sm ${locked ? 'text-muted-foreground' : ''}`}
              data-testid={`task-${task.taskKey}`}
            >
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={task.isCompleted}
                disabled={props.disabled || locked}
                onChange={(event) => props.onToggle(task.taskKey, event.target.checked)}
              />
              <span>{TASK_LABELS[task.taskKey]}</span>
              {locked && (
                <span className="text-xs">
                  · during{' '}
                  {TASK_PHASES[task.taskKey]
                    .map((phase) => PHASE_LABEL[phase] ?? phase)
                    .join(' or ')}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The phase the stepper offers next, or `undefined` at the end of the machine. */
/**
 * The rest countdown, and the only timer the athlete interacts with.
 *
 * It is mounted for the duration of the `rest` phase and unmounted otherwise, which is what makes
 * the card's cross-phase cancellation rule true by construction rather than by remembering to
 * call `cancel()` from three places: the cleanup below cancels the countdown and detaches the
 * visibility handler, so nothing is left that could write a number into the next phase's UI.
 *
 * Every value shown is derived from an absolute deadline. The three buttons change the *deadline*,
 * never a displayed number, which is the difference between a timer that survives a backgrounded
 * tab and one that merely looks busy.
 */
interface RestTimerProps {
  readonly announce: (message: string) => void;
  readonly onChime: () => void;
}

function RestTimer({ announce, onChime }: RestTimerProps) {
  const [state, setState] = useState<CountdownState | null>(null);
  const timer = useRef<Timer<CountdownState> | null>(null);

  useEffect(() => {
    const controller = createCountdownTimer({
      ...browserTimerClock(),
      // Once per deadline, guaranteed by the controller and asserted in its unit specs: the
      // completion is the one moment the athlete is not looking at the screen, so it has to reach
      // them without a glance.
      onFinish: () => {
        announce('Rest complete');
        onChime();
      },
    });
    timer.current = controller;

    let warned = false;
    const unsubscribe = controller.subscribe((next) => {
      setState(next);
      if (!warned && next.remainingMs > 0 && next.remainingMs <= REST_WARN_MS) {
        warned = true;
        announce(`${Math.round(next.remainingMs / 1_000)} seconds of rest left`);
      }
    });

    controller.start(Date.now() + REST_DEFAULT_MS);

    return () => {
      unsubscribe();
      controller.cancel();
      timer.current = null;
    };
  }, [announce, onChime]);

  const setDeadline = (ms: number): void => {
    timer.current?.start(ms);
  };

  if (state === null) {
    return (
      <div className="mt-4" data-testid="rest-timer">
        <Button
          variant="outline"
          onClick={() => setDeadline(Date.now() + REST_DEFAULT_MS)}
          data-testid="rest-start"
        >
          Start {REST_DEFAULT_MS / 1_000}s rest
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3" data-testid="rest-timer">
      <span
        className={
          state.finished
            ? 'font-mono text-2xl tabular-nums text-destructive'
            : 'font-mono text-2xl tabular-nums'
        }
        data-testid="rest-remaining"
        role="timer"
        aria-live="off"
        aria-atomic="true"
        aria-label={
          state.finished
            ? `Rest over by ${formatDuration(state.overrunMs)}`
            : `${formatDuration(state.remainingMs)} of rest remaining`
        }
      >
        {state.finished
          ? formatDuration(state.overrunMs, { overrun: true })
          : formatDuration(state.remainingMs)}
      </span>

      {state.finished && (
        // The overrun is shown rather than hidden or reset: four minutes of phone-scrolling after
        // a beep is information about the rest that happened, and `0:00` frozen forever would be a
        // clock lying in the opposite direction.
        <span className="text-sm text-muted-foreground" data-testid="rest-overrun">
          over rest — long enough, or add time
        </span>
      )}

      <Button
        variant="outline"
        onClick={() => setDeadline((state.deadline ?? Date.now()) + REST_EXTEND_MS)}
        data-testid="rest-extend"
      >
        +{REST_EXTEND_MS / 1_000}s
      </Button>

      <Button
        variant="ghost"
        onClick={() => {
          timer.current?.cancel();
          setState(null);
        }}
        data-testid="rest-skip"
      >
        Skip rest
      </Button>
    </div>
  );
}

function nextPhaseOf(current: SessionPhase): SessionPhase | undefined {
  const index = PHASE_ORDER.indexOf(current as (typeof PHASE_ORDER)[number]);
  return index >= 0 ? PHASE_ORDER[index + 1] : undefined;
}

function PhaseStepper(props: {
  current: SessionPhase;
  next: SessionPhase | undefined;
  gate: string | null;
  disabled: boolean;
  onAdvance: (phase: SessionPhase) => Promise<void>;
}) {
  const next = props.next;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Phase</span>
      <ol className="flex flex-wrap items-center gap-1 text-sm" aria-label="Workout phases">
        {PHASE_ORDER.map((phase) => (
          <li
            key={phase}
            aria-current={phase === props.current ? 'step' : undefined}
            className={phase === props.current ? 'font-semibold' : 'text-muted-foreground'}
          >
            {PHASE_LABEL[phase]}
          </li>
        ))}
      </ol>
      {/*
        * Naming the gate before the server has to refuse it. The refusal still exists —
        * the client asks and the server decides, and this line is allowed to be wrong —
        * but an athlete who presses "Advance" and gets `CONFLICT` learns nothing about
        * what they still owe. This is the one place the runner restates the phase rules,
        * and it is display-only by construction: the button stays enabled.
        */}
      {next !== undefined && props.gate !== null && (
        <p className="mt-1 text-sm text-muted-foreground" data-testid="phase-gate">
          {PHASE_LABEL[next]} needs: {props.gate}
        </p>
      )}
      {next !== undefined && (
        <Button
          type="button"
                    variant="outline"
          disabled={props.disabled}
          data-testid="advance-phase"
          // The client *asks*; it does not decide. Legality belongs to `SessionEngine`,
          // so a transition the server refuses arrives as a rejection plus a refetch —
          // which is why "mirror the legal transitions" needs no transition table here.
          onClick={() => void props.onAdvance(next)}
        >
          Advance to {PHASE_LABEL[next]}
        </Button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: SessionView['status'] }) {
  const variant = status === 'in_progress' ? 'default' : status === 'completed' ? 'secondary' : 'outline';
  const label =
    status === 'in_progress' ? 'In progress' : status === 'completed' ? 'Completed' : 'Archived';
  return <Badge variant={variant}>{label}</Badge>;
}

function Banner(props: { tone: 'info' | 'error'; children: React.ReactNode }) {
  return (
    <p
      className={`mt-3 rounded-md border px-3 py-2 text-sm ${
        props.tone === 'error'
          ? 'border-destructive text-destructive'
          : 'border-border bg-muted text-foreground'
      }`}
      role={props.tone === 'error' ? 'alert' : 'status'}
    >
      {props.children}
    </p>
  );
}

function RejectionLine(props: { rejection: VisibleRejection }) {
  return (
    <span data-testid="rejection-line">
      {props.rejection.label} — {props.rejection.reason}. Reload to see the server&apos;s state.
    </span>
  );
}

function formatPrefill(localDate: string, weightKg: number | null, reps: number | null, unit: PreferredUnit): string {
  const date = new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${localDate}T00:00:00Z`),
  );
  const load = `${formatWeight(weightKg, unit)}${reps === null ? '' : ` × ${reps}`}`;
  return `${date}, ${load}`;
}
