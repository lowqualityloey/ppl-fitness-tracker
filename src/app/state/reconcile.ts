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
}

export interface PendingProjection {
  /** Server truth with pending mutations applied — what the runner renders. */
  view: SessionView;
  /** Unconfirmed mutations, oldest first. Length drives the queue badge. */
  pending: StoredMutation[];
  /**
   * Mutations that cannot be projected and must not be applied speculatively —
   * alongside `rejected[]` from the server. Never silently discarded.
   */
  unprojectable: VisibleRejection[];
}

/**
 * Apply `pending` on top of `serverView`.
 *
 * This is intentionally *not* a reducer over the mutation log with re-send
 * semantics: it is a projection for display, and the server remains the only
 * authority on what is stored. Two consequences worth naming:
 *
 * 1. **A pending mutation that references an exercise or set index the server
 *    payload does not contain is not applied.** It is reported as unprojectable
 *    rather than appended. Appending would render a set the server has never heard
 *    of as though it were real; and once the refetch arrives, it would disappear —
 *    which is how a user loses confidence in the number that "was there a second ago".
 *    The `reconcile` path then refetches and the mutation is retried or surfaced.
 * 2. **`session.finish` and `phase.advance` are projected onto nothing.** They
 *    change the summary, and the runner's own optimistic state covers that
 *    transition; faking a completed session before the server accepts it would make
 *    the completion screen un-failable, which is exactly the class of lie §4.3
 *    exists to prevent. They are still returned in `pending[]` so the badge and the
 *    "waiting to sync" copy remain true.
 */
export function projectPending(serverView: SessionView, pending: readonly StoredMutation[]): PendingProjection {
  const unprojectable: VisibleRejection[] = [];
  const sets = serverView.sets.map((set) => ({ ...set }));
  const view: SessionView = { ...serverView, sets };

  const ordered = [...pending].sort((a, b) => a.seq - b.seq);
  for (const stored of ordered) {
    const mutation = stored.payload;
    if (mutation.op !== 'set.upsert') continue;

    const target = sets.find(
      (set) => set.exerciseId === mutation.exerciseId && set.setIndex === mutation.setIndex,
    );

    if (target === undefined) {
      // Not in the server's view of this session. Recorded, not applied — see (1).
      unprojectable.push({
        mutationId: stored.mutationId,
        reason: 'This set is not part of the session the server has.',
      });
      continue;
    }

    target.isCompleted = mutation.isCompleted;
    target.weightKg = mutation.weightKg;
    target.reps = mutation.reps;
  }

  return { view, pending: ordered, unprojectable };
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
      rejected.push({ mutationId: stored.mutationId, reason });
      continue;
    }
    if (appliedSet.has(stored.mutationId)) {
      applied.push(stored.mutationId);
      continue;
    }
    // Sent but absent from both lists. Not our business to guess why — it stays
    // queued, because the one thing we know is the server did not confirm it.
    stillPending.push(stored.mutationId);
  }

  return { applied, rejected, stillPending, requiresRefetch: rejected.length > 0 };
}
