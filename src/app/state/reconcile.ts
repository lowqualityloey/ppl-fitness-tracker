import type { SyncMutation } from '../../../lib/contracts/sync';
import type { SessionView } from '../../../lib/views/session-view';
import type { StoredMutation } from './outbox';

/**
 * M3-05 (#62): the server's session projected through the mutations the server has
 * not yet confirmed. Pure — no storage, no clock, no fetch — so the hardest rules
 * in RFC §4.3 are testable as a table of inputs and outputs.
 *
 * The rule this module exists to enforce, in one sentence: **pending work is shown,
 * never silently dropped, and never invented.** Both failure directions are visible
 * to the user, because the alternative is a screen that quietly disagrees with the
 * database in a way nobody notices until the numbers are wrong.
 */

/** Why one local change could not be shown as applied. */
export interface VisibleRejection {
  mutationId: string;
  reason: string;
  /**
   * A human-readable handle on *what* was refused, derived from the mutation while it
   * is still in hand. The server's `reason` is a code (`INVALID_MUTATION`,
   * `ILLEGAL_TRANSITION`) — true, and useless to someone holding a phone with chalk on
   * their hands. And because a refused mutation leaves the queue, a screen that tried to
   * recover this label later would be looking for a record that is gone.
   */
  label: string;
}

/** Name a mutation the way its row is on screen. Exercise names are the caller's. */
export function describeMutation(payload: SyncMutation): string {
  switch (payload.op) {
    case 'set.upsert':
      return `Set ${payload.setIndex + 1}`;
    case 'phase.advance':
      return `The change to ${payload.phase}`;
    case 'task.complete':
      return `The ${payload.taskKey} task`;
    case 'session.finish':
      return 'Finishing the session';
  }
}

/**
 * One row the runner can render: a *planned* set, whether or not the server has a row
 * for it yet.
 *
 * This type is the correction of a real defect. `session_sets` rows are created lazily by
 * the first `set.upsert` — `SETS: 0` for a freshly started session, confirmed against the
 * API in this slice's E2E work — so any projection that maps only over `session.sets`
 * renders an empty screen for a workout in progress, and treats a user's very first tick
 * as a mutation referencing a set "the server does not have". Both are wrong in the same
 * direction: they assume the plan is the history.
 */
export interface PlannedSet {
  exerciseId: string;
  exerciseName: string;
  /** `null` until the server creates the row. Not a key: see `rowKey`. */
  id: string | null;
  setIndex: number;
  phase: 'main_workout' | 'stretch';
  isCompleted: boolean;
  weightKg: number | null;
  reps: number | null;
}

/** Stable React key for a row that may not exist server-side. */
export function rowKey(set: Pick<PlannedSet, 'exerciseId' | 'setIndex'>): string {
  return `${set.exerciseId}:${set.setIndex}`;
}

/** The sets a session *intends* to have, from the day's plan. */
export function planSets(view: SessionView): PlannedSet[] {
  const rows: PlannedSet[] = [];
  for (const exercise of view.routineDay.exercises) {
    /*
     * Only a main-workout strength placement can ever have a row. `assertSetMutationAllowed`
     * refuses a set mutation for anything else with `Exercise is not part of this session`,
     * so a planned row for a stretch exercise would be a control the server rejects every
     * single time it is used. Stretch work is guided by the `stretch` task and the
     * sequence shown on screen, not by per-set rows — which is what the storage says.
     */
    if (exercise.phase !== 'main_workout' || exercise.exercise.kind !== 'strength') continue;
    // A null `targetSets` plans zero rows. The alternative — inventing a number — would
    // put sets on the screen that the day never asked for.
    for (let index = 0; index < (exercise.targetSets ?? 0); index += 1) {
      rows.push({
        exerciseId: exercise.exercise.id,
        exerciseName: exercise.exercise.name,
        id: null,
        setIndex: index,
        phase: exercise.phase,
        isCompleted: false,
        weightKg: null,
        reps: null,
      });
    }
  }
  // Overlay the rows that do exist. A server record wins on every field, including
  // `isCompleted: false` — a set the server says is un-loggged is un-logged whatever the
  // plan implied.
  for (const set of view.sets) {
    const target = rows.find(
      (row) => row.exerciseId === set.exerciseId && row.setIndex === set.setIndex,
    );
    if (target !== undefined) {
      target.id = set.id;
      target.isCompleted = set.isCompleted;
      target.weightKg = set.weightKg;
      target.reps = set.reps;
    }
  }
  return rows;
}

/**
 * One checkbox in the phase it belongs to.
 *
 * Like sets, task rows are created by completing them, so a session in progress usually
 * has none. The list the runner renders therefore comes from the *set of gates the phase
 * machine has* (`TASK_PHASES`), with server and pending state overlaid. Rendering
 * `serverView.tasks` directly would show an empty checklist on a fresh session — and the
 * first item on that checklist is what unlocks the rest of the workout.
 */
export interface PlannedTask {
  taskKey: 'warm_up' | 'main_workout' | 'stretch';
  isCompleted: boolean;
}

export interface PendingProjection {
  /** Planned rows with server truth and then the pending overlay applied, in `seq` order. */
  sets: PlannedSet[];
  /** Every gate the runner can offer, with server truth and the overlay applied. */
  tasks: PlannedTask[];
  /**
   * Unconfirmed mutations, oldest first. Length drives the queue badge, and the list is
   * what `projectPending` composed the view from.
   */
  pending: StoredMutation[];
  /**
   * Mutations that cannot be shown as applied: a set outside the plan, or a payload the
   * projection refuses to invent. Surfaced rather than dropped, per §4.3.
   */
  unprojectable: VisibleRejection[];
}

/**
 * Apply `pending` on top of the *plan*, over the server's rows.
 *
 * This is intentionally not a re-sending reducer: it is a projection for display, and
 * the server remains the only authority on what is stored. Three consequences worth
 * naming:
 *
 * 1. **A pending mutation whose set is not in the day's plan is not applied** — it is
 *    reported as `unprojectable`. Inventing a row would render a set the server has never
 *    heard of, and then delete it on the next refetch, which is how a user stops trusting
 *    the number that "was there a second ago". (Before this file's correction, the same
 *    rule was applied against `server.sets`, so it fired on *every* first tick of a fresh
 *    session. The distinction is plan-versus-history, and it is now a named test.)
 * 2. **`session.finish` and `phase.advance` are projected onto nothing.** They change the
 *    summary, which the server's status drives; faking a completed session before the
 *    server accepts it makes the completion screen un-failable. They stay in `pending[]`
 *    so the queue badge and the "waiting to sync" copy remain true.
 * 3. **Nothing here mutates its inputs.** `serverView` stays the caller's record of server
 *    truth; if the projection wrote through it, every later comparison would agree with
 *    itself, and a stale check would look like a successful sync.
 */
export function projectPending(
  serverView: SessionView,
  pending: readonly StoredMutation[],
): PendingProjection {
  const unprojectable: VisibleRejection[] = [];
  const sets = planSets(serverView);
  const byRow = new Map(sets.map((set) => [rowKey(set), set]));
  const tasks = planTasks(serverView);
  const byTaskKey = new Map(tasks.map((task) => [task.taskKey, task]));

  const ordered = [...pending].sort((a, b) => a.seq - b.seq);
  for (const stored of ordered) {
    const mutation = stored.payload;
    if (mutation.op === 'task.complete') {
      // `completedAt: null` is an un-tick, not a missing value.
      const target = byTaskKey.get(mutation.taskKey);
      if (target !== undefined) target.isCompleted = mutation.completedAt !== null;
      continue;
    }
    if (mutation.op !== 'set.upsert') continue;

    const target = byRow.get(rowKey({ exerciseId: mutation.exerciseId, setIndex: mutation.setIndex }));
    if (target === undefined) {
      unprojectable.push({
        mutationId: stored.mutationId,
        reason: 'That set is not part of this day’s plan.',
        label: describeMutation(stored.payload),
      });
      continue;
    }

    target.isCompleted = mutation.isCompleted;
    target.weightKg = mutation.weightKg;
    target.reps = mutation.reps;
  }

  return { sets, tasks, pending: ordered, unprojectable };
}

/** Every gate the runner offers, in machine order, with server truth applied. */
export function planTasks(view: SessionView): PlannedTask[] {
  const order: ('warm_up' | 'main_workout' | 'stretch')[] = ['warm_up', 'main_workout', 'stretch'];
  return order.map((taskKey) => ({
    taskKey,
    isCompleted: view.tasks.some(
      (task) => task.taskKey === taskKey && task.completedAt !== null,
    ),
  }));
}

/**
 * Turn the server's batch response into the local decisions: what to forget, what
 * to keep, and what to tell the user.
 *
 * `rejected[]` items are **never** dropped from the queue here. §4.3 says a
 * rejection surfaces and forces a full authoritative refetch; keeping the mutation
 * queued until that refetch decides its fate is what stops a rejected set from
 * vanishing with no explanation. The return value states that explicitly so a caller
 * cannot accidentally treat "not applied" as "done".
 */
export interface ReconciliationOutcome {
  /** Safe to delete from the outbox: the server listed these in `applied[]`. */
  applied: string[];
  /** Rejections to surface, in the server's order, with the server's reason text. */
  rejected: VisibleRejection[];
  /** Ids that were neither applied nor rejected — still queued, still unsent. */
  stillPending: string[];
  /**
   * True when the batch contained at least one rejection. §8.2: the *first* rejection
   * in a batch forces a full authoritative refetch, because item-level results mean a
   * batch is not a transaction and surgical rollback produces a client that believes a
   * state the server never accepted.
   *
   * Note which ids this pairs with: `rejected` items leave the queue (see
   * `Outbox.discardRefused`) because the server has authoritatively refused them — a
   * second replay can only be refused again. `stillPending` items stay, because nothing
   * was authoritative about their absence. Refusing forever and forgetting are the two
   * failure modes on either side of that line.
   *
   * Also true when an applied mutation is one the projection cannot represent — a phase
   * advance or a finish — because the screen would otherwise keep showing a phase the
   * server has already left. See the comment at the assignment.
   */
  requiresRefetch: boolean;
}

export function reconcile(
  sent: readonly StoredMutation[],
  response: { applied: readonly string[]; rejected: readonly { mutationId: string; reason: string }[] },
): ReconciliationOutcome {
  const appliedSet = new Set(response.applied);
  const rejectedById = new Map(response.rejected.map((item) => [item.mutationId, item.reason]));

  const applied: string[] = [];
  let appliedUnprojectedOp = false;
  const rejected: VisibleRejection[] = [];
  const stillPending: string[] = [];

  // Rejections for ids we did not send are ignored rather than surfaced: they
  // cannot correspond to anything the user did in this batch, and rendering a
  // phantom row labelled with a server reason would send someone looking for a set
  // that was never queued. (The server listing an unknown id is worth knowing about
  // — it is asserted against in an API test, not here.)
  for (const stored of sent) {
    const reason = rejectedById.get(stored.mutationId);
    if (reason !== undefined) {
      rejected.push({
        mutationId: stored.mutationId,
        reason,
        label: describeMutation(stored.payload),
      });
      continue;
    }
    if (appliedSet.has(stored.mutationId)) {
      applied.push(stored.mutationId);
      /*
       * The projection covers `set.upsert` and `task.complete` and nothing else. A phase
       * advance or a finish that the server *accepted* has no local representation, and
       * deliberately must not have one: faking `completed` before the server agrees would
       * make the completion screen un-failable, which is the mirror image of the error
       * #62's `discardRefused` closes.
       *
       * So the screen re-reads the truth. This is the rule that says when, and it is
       * narrower than "refetch after every drain" on purpose: a workout is ~35 set ticks,
       * and 35 extra detail reads per session spends #60's budget — which exists because a
       * 40-athlete peak measures at 36 rpm against a 120 rpm limiter — to re-download state
       * the client already projected correctly.
       */
      if (stored.payload.op !== 'set.upsert' && stored.payload.op !== 'task.complete') {
        appliedUnprojectedOp = true;
      }
      continue;
    }
    // Sent but absent from both lists. Not our business to guess why — it stays
    // queued, because the one thing we know is the server did not confirm it.
    stillPending.push(stored.mutationId);
  }

  return {
    applied,
    rejected,
    stillPending,
    requiresRefetch: rejected.length > 0 || appliedUnprojectedOp,
  };
}
