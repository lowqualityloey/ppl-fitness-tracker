import { describe, expect, it } from 'vitest';
import type { SyncMutation } from '../../../lib/contracts/sync';
import { planTasks, projectPending, reconcile } from '../../../src/app/state/reconcile';
import { EXERCISE, SESSION, id, serverView, setMutation, stored } from './fixtures';

/**
 * M3-05 (#62) — RFC §4.3 and §8.2, the two rules that decide what a user sees while
 * their taps are in flight. Pure functions, pure tests: no storage, no clock, no
 * network. Anything needing one of those belongs in `sync-engine.test.ts`.
 */

describe('reconcile — a batch is not a transaction (§8.2)', () => {
  it('reports a partial batch as partial, with no rollback invented', () => {
    // Second applied, first refused: the exact case §8.2 was written about.
    const sent = [stored(0, setMutation(1, 0)), stored(1, setMutation(2, 1))];

    const outcome = reconcile(sent, {
      applied: [id(2)],
      rejected: [{
        mutationId: id(1),
        reason: 'INVALID_MUTATION',
        message: 'Set index exceeds the routine target set count.',
      }],
    });

    expect(outcome.applied).toEqual([id(2)]);
    // The label is part of the contract now: a refused mutation leaves the queue, so
    // this is the only moment anything knows which set the user is being told about.
    // #77: the server's own sentence rides along beside the code, and the label stays —
    // the label says *what* was refused, the message says *why*, and neither is derivable
    // from the other once the mutation has left the queue.
    expect(outcome.rejected).toEqual([
      {
        mutationId: id(1),
        reason: 'INVALID_MUTATION',
        message: 'Set index exceeds the routine target set count.',
        label: 'Set 1',
      },
    ]);
    expect(outcome.stillPending).toEqual([]);
    // FIFO ordered the sends; it did not make them a transaction.
    expect(outcome.requiresRefetch).toBe(true);
  });

  it('requires a refetch on the FIRST rejection, even when other items applied', () => {
    const sent = [stored(0, setMutation(1, 0)), stored(1, setMutation(2, 1))];
    const outcome = reconcile(sent, {
      applied: [id(1)],
      rejected: [{
        mutationId: id(2),
        reason: 'SESSION_FINISHED',
        message: 'A session can only finish from post-workout.',
      }],
    });

    // Surgical rollback of one item is not attempted: it is how a client ends up
    // believing a session state the server never accepted.
    expect(outcome.requiresRefetch).toBe(true);
  });

  it('does not require a refetch when everything applied', () => {
    const sent = [stored(0, setMutation(1, 0))];
    const outcome = reconcile(sent, { applied: [id(1)], rejected: [] });
    expect(outcome.requiresRefetch).toBe(false);
    expect(outcome.applied).toEqual([id(1)]);
  });

  it('keeps a mutation the server neither applied nor rejected', () => {
    const sent = [stored(0, setMutation(1, 0)), stored(1, setMutation(2, 1))];
    // The response was truncated, or an item went missing. What is known is that it
    // was not confirmed, so it stays queued — the opposite of assuming success, which
    // would lose a set without a single error appearing anywhere.
    const outcome = reconcile(sent, { applied: [id(1)], rejected: [] });
    expect(outcome.stillPending).toEqual([id(2)]);
    expect(outcome.requiresRefetch).toBe(false);
  });

  it('ignores a rejection for an id that was never sent', () => {
    const sent = [stored(0, setMutation(1, 0))];
    const outcome = reconcile(sent, {
      applied: [],
      rejected: [{
        mutationId: id(999),
        reason: 'INVALID_MUTATION',
        message: 'Set index exceeds the routine target set count.',
      }],
    });
    // Surfacing it would render a phantom row carrying a server reason, sending
    // someone to look for a set that was never queued.
    expect(outcome.rejected).toEqual([]);
    expect(outcome.stillPending).toEqual([id(1)]);
    expect(outcome.requiresRefetch).toBe(false);
  });

  it('keeps a batch single-session, as the sync contract requires', () => {
    const sent = [stored(0, setMutation(1, 0)), stored(1, setMutation(2, 1))];
    // `SyncRequestSchema`'s superRefine refuses a multi-session batch; the local half
    // of that rule is asserted so a refactor cannot quietly start mixing sessions.
    expect(new Set(sent.map((item) => item.sessionId))).toEqual(new Set([SESSION]));
  });
});

describe('projectPending — what the user sees before confirmation', () => {
  it('applies pending set mutations over server truth', () => {
    const { sets, pending } = projectPending(serverView(), [stored(0, setMutation(1, 1))]);

    expect(sets[1]?.isCompleted).toBe(true);
    expect(sets[1]?.weightKg).toBe(100);
    expect(sets[0]?.isCompleted).toBe(false);
    expect(pending).toHaveLength(1);
  });

  it('projects onto the plan when the server has no set rows yet', () => {
    // The defect this test exists for. `session_sets` rows are created lazily by the
    // first `set.upsert`, so a freshly started session has none — measured against the
    // real API in #63's E2E work (`SETS: 0` for a session that is 11 exercises deep). A
    // projection that mapped only over `session.sets` rendered an empty strength
    // section, and treated the user's very first tick of every set as a mutation
    // referencing a row "the server does not have". Plan first, history second.
    const fresh = { ...serverView(), sets: [] };
    const { sets, unprojectable } = projectPending(fresh, [stored(0, setMutation(1, 0))]);

    expect(sets).toHaveLength(3);
    expect(sets[0]?.isCompleted).toBe(true);
    expect(sets[0]?.id, 'no server row exists yet').toBeNull();
    expect(sets[0]?.exerciseName).toBe('Bench Press');
    expect(unprojectable).toEqual([]);
  });

  it('keeps a server row that disagrees with the plan honest', () => {
    // A row exists and says un-logged: the plan must not turn it into a completion.
    const view = serverView();
    const logged = { ...view, sets: [{ ...view.sets[0]!, isCompleted: true, weightKg: 90, reps: 5 }] };
    const { sets } = projectPending(logged, []);

    expect(sets[0]?.id).not.toBeNull();
    expect(sets[0]?.isCompleted).toBe(true);
    expect(sets[0]?.weightKg).toBe(90);
    expect(sets[1]?.isCompleted).toBe(false);
  });

  it('shows the LAST pending value for a set ticked twice', () => {
    const base = setMutation(2, 0);
    if (base.op !== 'set.upsert') throw new Error('fixture must be a set mutation');
    const second: SyncMutation = { ...base, isCompleted: false, weightKg: 0, reps: 0 };
    const { sets } = projectPending(serverView(), [stored(0, setMutation(1, 0)), stored(1, second)]);

    // A user who ticks then un-ticks must see the un-tick. This is why the projection
    // applies in `seq` order rather than "first writer wins".
    expect(sets[0]?.isCompleted).toBe(false);
    expect(sets[0]?.weightKg).toBe(0);
  });

  it('reports an unprojectable mutation instead of inventing a set', () => {
    // setIndex 9 is not in the server's view: a stale tab, or a plan that changed.
    // Appending a row would render a set the server has never heard of and then make
    // it vanish on the next refetch — the experience §4.3 calls a lie.
    // setIndex 9 is outside the day's three planned sets: a stale tab, or a plan that
    // changed mid-session. Inventing a row would show a set the server has never heard
    // of and then delete it on the next refetch.
    const { sets, unprojectable } = projectPending(serverView(), [stored(0, setMutation(1, 9))]);

    expect(sets).toHaveLength(3);
    // A local refusal has no server sentence to carry, so it carries its own: the same
    // sentence it has always shown, now in the field the screen reads (#77).
    expect(unprojectable).toEqual([
      {
        mutationId: id(1),
        reason: 'That set is not part of this day’s plan.',
        message: 'That set is not part of this day’s plan.',
        label: 'Set 10',
      },
    ]);
  });

  it('keeps non-set mutations queued without faking their effect', () => {
    const finish: SyncMutation = {
      op: 'session.finish',
      mutationId: id(7),
      clientTs: '2026-09-11T09:30:00.000Z',
      sessionId: SESSION,
      completedAt: '2026-09-11T09:30:00.000Z',
    };
    const { sets, pending } = projectPending(serverView(), [stored(0, finish)]);

    // The projection returns rows, not a status: painting a completion the server has
    // not accepted would make the completion screen un-failable.
    expect(sets).toHaveLength(3);
    expect(pending.map((item) => item.mutationId)).toEqual([id(7)]);
  });

  it('does not mutate the server view it was handed', () => {
    const original = serverView();
    projectPending(original, [stored(0, setMutation(1, 0))]);
    // The caller keeps this object as its notion of server truth. Writing through it
    // would make every later comparison agree with itself.
    expect(original.sets[0]?.isCompleted).toBe(false);
    expect(original.sets[0]?.exerciseId).toBe(EXERCISE);
  });
});

describe('reconcile — when the screen must re-read the server', () => {
  it('plans no rows for a stretch exercise', () => {
    // The fixture day carries a stretch placement with two planned sets, and `planSets`
    // must ignore it: `assertSetMutationAllowed` rejects a set mutation for anything that
    // is not a main-workout strength placement, so a row rendered there is a control the
    // server refuses every time it is used.
    const view = serverView();
    expect(view.routineDay.exercises.some((placement) => placement.phase === 'stretch')).toBe(
      true,
    );
    const { sets } = projectPending(view, []);

    expect(sets.map((set) => set.exerciseName)).toEqual([
      'Bench Press',
      'Bench Press',
      'Bench Press',
    ]);
  });

  it('lists every gate even when the server has no task rows', () => {
    // Tasks are created by completing them, so an in-progress session has none. The
    // runner renders its checklist from the phase machine's gates, not from history —
    // otherwise the checkbox that unlocks the entire workout is missing on the screen
    // where the user needs it, and a warm-up can never be declared done.
    expect(planTasks(serverView()).map((task) => task.taskKey)).toEqual([
      'warm_up',
      'main_workout',
      'stretch',
    ]);
    expect(planTasks(serverView()).every((task) => !task.isCompleted)).toBe(true);
  });

  it('projects a pending task completion offline', () => {
    const complete: SyncMutation = {
      op: 'task.complete',
      mutationId: id(1),
      clientTs: '2026-09-11T10:00:00.000Z',
      sessionId: SESSION,
      taskKey: 'warm_up',
      completedAt: '2026-09-11T10:00:00.000Z',
    };
    const { tasks } = projectPending(serverView(), [stored(0, complete)]);

    expect(tasks.find((task) => task.taskKey === 'warm_up')?.isCompleted).toBe(true);
    expect(tasks.find((task) => task.taskKey === 'stretch')?.isCompleted).toBe(false);
  });

  it('treats a null completedAt as an un-tick, not as no change', () => {
    // Nullable on the contract for exactly this reason: a task can be answered, then
    // answered differently. Reading `null` as "leave it alone" would make a mis-tap
    // impossible to undo offline.
    const view = {
      ...serverView(),
      tasks: [
        {
          id: id(9),
          sessionId: SESSION,
          taskKey: 'warm_up' as const,
          completedAt: '2026-09-11T09:00:00.000Z',
          // Required since #73: `SessionView` is the full contract, and a task row always
          // carries the two timestamps the sync engine compares — even in a test about
          // `completedAt`.
          clientTs: '2026-09-11T09:00:00.000Z',
          updatedAt: '2026-09-11T09:00:00.000Z',
        },
      ],
    };
    const uncheck: SyncMutation = {
      op: 'task.complete',
      mutationId: id(1),
      clientTs: '2026-09-11T10:00:00.000Z',
      sessionId: SESSION,
      taskKey: 'warm_up',
      completedAt: null,
    };

    expect(projectPending(view, [stored(0, uncheck)]).tasks[0]?.isCompleted).toBe(false);
    expect(planTasks(view)[0]?.isCompleted).toBe(true);
  });

  it('forces a refetch for an applied phase advance, which the projection cannot show', () => {
    const advance: SyncMutation = {
      op: 'phase.advance',
      mutationId: id(1),
      clientTs: '2026-09-11T10:00:00.000Z',
      sessionId: SESSION,
      phase: 'exercise',
    };
    const outcome = reconcile([stored(0, advance)], {
      applied: [id(1)],
      rejected: [],
    });

    expect(outcome.requiresRefetch).toBe(true);
  });

  it('does not spend a detail read on an applied set tick', () => {
    // #60's budget is the reason this half of the rule exists. A session is dozens of
    // set ticks, and each one already shows on screen through the projection; refetching
    // after all of them would re-download state the client computed correctly.
    const outcome = reconcile([stored(0, setMutation(1, 0))], {
      applied: [id(1)],
      rejected: [],
    });

    expect(outcome.requiresRefetch).toBe(false);
  });

  it('does not refetch for an applied task completion, which is projected', () => {
    const complete: SyncMutation = {
      op: 'task.complete',
      mutationId: id(1),
      clientTs: '2026-09-11T10:00:00.000Z',
      sessionId: SESSION,
      taskKey: 'stretch',
      completedAt: '2026-09-11T10:00:00.000Z',
    };

    expect(
      reconcile([stored(0, complete)], { applied: [id(1)], rejected: [] }).requiresRefetch,
    ).toBe(false);
  });
});
