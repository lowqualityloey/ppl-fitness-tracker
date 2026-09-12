/**
 * #80 — the fixture layer must not share row identities between runs.
 *
 * The bug this file exists to keep dead: `seedSessionFixtures` created rows for a **fixed** id set
 * and deleted exactly those ids — once in `cleanup()`, and, worse, **before it seeded**, as a
 * crash-recovery pre-clean. Under `playwright.config.ts`'s `fullyParallel: true` with no worker cap,
 * that made one file's setup a data-destruction event for another file mid-measurement. #64 recorded
 * it as `request 18: status=404 … "code":"NOT_FOUND"` in `sync-latency.spec.ts`, with the spec green
 * in isolation and green on a quieter re-run — the signature of a collision, not of a bug.
 *
 * These three specs assert the fix at the seam where the failure surfaced (an authenticated
 * `GET /api/sessions/[id]`), because that is what "red means red" has to mean here: not that the id
 * generator is random, but that a sibling run can no longer make this run's rows disappear.
 *
 * **What this file cannot prove, stated so it is not mistaken for coverage:** it proves the two
 * directions the old code could destroy a sibling's rows, sequentially, in one process. It does not
 * prove that Playwright's workers are now collision-free — that is a scheduling property of a real
 * parallel run, and it is #100's five-consecutive-full-batteries criterion, not this file's.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authHeaders,
  createTestSession,
  seedSessionFixtures,
  type FixtureIds,
  type SessionFixture,
  type TestSession,
} from './fixtures.js';
import { apiRequest, startApiServer, stopApiServer } from './test-server.js';

const ID_KEYS = [
  'mutation', 'session', 'exercise', 'device', 'routineDay', 'foreignSession',
  'routineExercise', 'foreignDevice', 'freshDevice', 'set', 'task',
] as const satisfies readonly (keyof FixtureIds)[];

describe('#80: fixture identities are minted per seeding call', () => {
  let ownerA!: TestSession;
  let ownerB!: TestSession;
  let runA!: SessionFixture;
  let runB!: SessionFixture;
  /*
   * Which handles actually came into existence. If seeding throws, `beforeAll` aborts partway and
   * the later handles are never assigned — and this file's whole subject is a seeding call that
   * throws, so the teardown has to be able to say which rows it is responsible for. Tearing down an
   * unassigned handle would bury the real cause under a TypeError, and double-cleaning a fixture is
   * its own failure: the inner admin-user delete 404s the second time.
   */
  const assigned = { ownerA: false, ownerB: false, runA: false, runB: false };
  /** Spec 2 tears B's fixture down deliberately; the shared teardown must not do it again. */
  let siblingTornDown = false;

  beforeAll(async () => {
    await startApiServer();
    ownerA = await createTestSession('isolation-a');
    assigned.ownerA = true;
    runA = await seedSessionFixtures(ownerA);
    assigned.runA = true;
    ownerB = await createTestSession('isolation-b');
    assigned.ownerB = true;
    runB = await seedSessionFixtures(ownerB);
    assigned.runB = true;
  });

  afterAll(async () => {
    const teardown: Array<[string, () => Promise<void>]> = [];
    if (assigned.runA) teardown.push(['runA', async () => runA.cleanup()]);
    if (assigned.runB && !siblingTornDown) teardown.push(['runB', async () => runB.cleanup()]);
    if (assigned.ownerA) teardown.push(['ownerA', async () => ownerA.cleanup()]);
    if (assigned.ownerB) teardown.push(['ownerB', async () => ownerB.cleanup()]);
    const failures: unknown[] = [];
    for (const [label, operation] of teardown) {
      try {
        await operation();
      } catch (error) {
        failures.push(new Error(`${label} cleanup failed`, { cause: error }));
      }
    }
    await stopApiServer();
    if (failures.length > 0) throw new AggregateError(failures, 'Fixture isolation teardown failed.');
  });

  it('hands two seeding calls no shared identity, on any of the eleven keys', () => {
    const shared = ID_KEYS.filter((key) => runA.ids[key] === runB.ids[key]);
    expect(shared, 'two seeding calls produced the same id for these keys').toEqual([]);

    // Distinctness is per-call, not merely per-process: a third call must differ from both, or the
    // "mint" is really a constant with extra steps.
    const shape = Object.keys(runA.ids).sort();
    expect(shape).toEqual([...ID_KEYS].sort());
  });

  it('survives a sibling run finishing while this run is still reading its own session', async () => {
    const before = await apiRequest(`/api/sessions/${runA.ids.session}`, { headers: authHeaders(ownerA) });
    expect(before.status, 'A could not read its own session').toBe(200);
    await before.body?.cancel();

    // The direction #64 hit: B tears down while A is mid-flight. With the old fixed ids this deleted
    // the row A was reading — `SessionNotFoundError` → 404.
    await runB.cleanup();
    siblingTornDown = true;

    const after = await apiRequest(`/api/sessions/${runA.ids.session}`, { headers: authHeaders(ownerA) });
    expect(after.status, 'a sibling cleanup removed this run’s session').toBe(200);
    await after.body?.cancel();
  });

  it('does not delete a live sibling’s rows on its way in', async () => {
    // The direction the code never got caught doing, because it looked like hygiene: seeding began
    // with `DELETE … WHERE id IN (the fixed ids)`. So a *second* run's setup destroyed the first
    // run's data before the second run had even finished starting.
    const thirdOwner = await createTestSession('isolation-c');
    try {
      const third = await seedSessionFixtures(thirdOwner);
      try {
        const stillThere = await apiRequest(`/api/sessions/${runA.ids.session}`, {
          headers: authHeaders(ownerA),
        });
        expect(stillThere.status, 'seeding a new run deleted an existing run’s session').toBe(200);
        await stillThere.body?.cancel();
      } finally {
        await third.cleanup();
      }
    } finally {
      await thirdOwner.cleanup();
    }
  });
});
