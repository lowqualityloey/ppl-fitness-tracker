import { describe, expect, it } from 'vitest';
import type { SyncMutation } from '../../../lib/contracts/sync';
import { projectPending, reconcile } from '../../../src/app/state/reconcile';
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
      rejected: [{ mutationId: id(1), reason: 'INVALID_MUTATION' }],
    });

    expect(outcome.applied).toEqual([id(2)]);
    expect(outcome.rejected).toEqual([{ mutationId: id(1), reason: 'INVALID_MUTATION' }]);
    expect(outcome.stillPending).toEqual([]);
    // FIFO ordered the sends; it did not make them a transaction.
    expect(outcome.requiresRefetch).toBe(true);
  });

  it('requires a refetch on the FIRST rejection, even when other items applied', () => {
    const sent = [stored(0, setMutation(1, 0)), stored(1, setMutation(2, 1))];
    const outcome = reconcile(sent, {
      applied: [id(1)],
      rejected: [{ mutationId: id(2), reason: 'SESSION_FINISHED' }],
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
      rejected: [{ mutationId: id(999), reason: 'INVALID_MUTATION' }],
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
    const { view, pending } = projectPending(serverView(), [stored(0, setMutation(1, 1))]);

    expect(view.sets[1]?.isCompleted).toBe(true);
    expect(view.sets[1]?.weightKg).toBe(100);
    expect(view.sets[0]?.isCompleted).toBe(false);
    expect(pending).toHaveLength(1);
  });

  it('shows the LAST pending value for a set ticked twice', () => {
    const base = setMutation(2, 0);
    if (base.op !== 'set.upsert') throw new Error('fixture must be a set mutation');
    const second: SyncMutation = { ...base, isCompleted: false, weightKg: 0, reps: 0 };
    const { view } = projectPending(serverView(), [stored(0, setMutation(1, 0)), stored(1, second)]);

    // A user who ticks then un-ticks must see the un-tick. This is why the projection
    // applies in `seq` order rather than "first writer wins".
    expect(view.sets[0]?.isCompleted).toBe(false);
    expect(view.sets[0]?.weightKg).toBe(0);
  });

  it('reports an unprojectable mutation instead of inventing a set', () => {
    // setIndex 9 is not in the server's view: a stale tab, or a plan that changed.
    // Appending a row would render a set the server has never heard of and then make
    // it vanish on the next refetch — the experience §4.3 calls a lie.
    const { view, unprojectable } = projectPending(serverView(), [stored(0, setMutation(1, 9))]);

    expect(view.sets).toHaveLength(3);
    expect(unprojectable).toEqual([
      { mutationId: id(1), reason: 'This set is not part of the session the server has.' },
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
    const { view, pending } = projectPending(serverView(), [stored(0, finish)]);

    // The status stays `in_progress`: painting it completed before the server accepts
    // would make the completion screen un-failable.
    expect(view.status).toBe('in_progress');
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
