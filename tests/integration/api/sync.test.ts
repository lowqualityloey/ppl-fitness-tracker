import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import {
  SyncRequestSchema,
  SyncResponseDataSchema,
  SyncResponseSchema,
} from '../../../lib/contracts/sync.js';
import {
  SessionDetailResponseSchema,
  SessionStartResponseSchema,
  type SessionState,
} from '../../../lib/contracts/sessions.js';
import {
  authHeaders,
  clientTs,
  createTestSession,
  seedSessionFixtures,
  type FixtureIds,
  type SessionFixture,
  type TestSession,
} from './fixtures.js';
import { apiRequest, jsonRequest, responseBody, startApiServer, stopApiServer, waitForLogEntry } from './test-server.js';

/**
 * The batch payloads this file posts, built from **this run's** ids.
 *
 * These were module-scope literals reading `ids.session` etc., which is only possible when the ids
 * are fixed constants. #80 mints them per `seedSessionFixtures` call, so an identity now exists only
 * after the seed has run — and a literal evaluated at import time would have captured an id that was
 * never inserted. Building them from the fixture makes that ordering visible instead of implicit.
 */
function syncBatch(ids: FixtureIds) {
  const setMutation = {
    op: 'set.upsert' as const,
    mutationId: ids.mutation,
    clientTs,
    sessionId: ids.session,
    exerciseId: ids.exercise,
    setIndex: 0,
    isCompleted: true,
    weightKg: 60.5,
    reps: 8,
  };

  const taskMutation = {
    op: 'task.complete' as const,
    mutationId: '66666666-6666-4666-8666-666666666666',
    clientTs,
    sessionId: ids.session,
    taskKey: 'main_workout' as const,
    completedAt: clientTs,
  };

  const phaseMutation = {
    op: 'phase.advance' as const,
    mutationId: '77777777-7777-4777-8777-777777777777',
    clientTs,
    sessionId: ids.session,
    phase: 'exercise' as const,
  };

  const finishMutation = {
    op: 'session.finish' as const,
    mutationId: '88888888-8888-4888-8888-888888888888',
    clientTs,
    sessionId: ids.session,
  };

  const syncBody = (mutations: unknown[] = [setMutation]) => ({
    deviceId: ids.device,
    sinceSeq: 0,
    mutations,
  });

  return { setMutation, taskMutation, phaseMutation, finishMutation, syncBody };
}

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

/** The four fields a narrowed sync answer is allowed to carry, read off the **bytes**. */
function wireFields(body: unknown): string[] {
  return Object.keys((body as { data: Record<string, unknown> }).data).sort();
}

const SYNC_WIRE_FIELDS = ['applied', 'clockSkewMs', 'rejected', 'serverSeq'];

describe('M2-04: POST /api/sync', () => {
  let owner!: TestSession;
  let fixtures!: SessionFixture;
  /** This run's row identities, and the payloads built against them (#80). */
  let ids!: FixtureIds;
  let batch!: ReturnType<typeof syncBatch>;

  beforeAll(async () => {
    await startApiServer();
    owner = await createTestSession('sync');
    fixtures = await seedSessionFixtures(owner);
    ids = fixtures.ids;
    batch = syncBatch(ids);
    /*
     * Warm the read route once, as infrastructure — not to make a gate pass.
     *
     * #105 re-aimed this file's stored-state assertions at `GET /api/sessions/[id]`, which moved a
     * first request to that route into the specs' own budgets. Measured on this branch: the spec
     * that pays it takes **2 039 ms**, the identical read after the route is compiled takes
     * **587 ms**, and vitest's per-test budget is **5 000 ms** — so 1.5 s of `next dev`'s
     * on-demand compile (this suite boots a dev server; there is no production build here) now
     * sits inside a gate that has nothing to do with compilation. In a full-suite pass that
     * exposure produced one real red, and "re-run until it passes" would have been smoothing.
     *
     * The fix is the one the config already endorses: `vitest.config.ts` raises `hookTimeout` to
     * 35 s and says so — "a budget for infrastructure startup, not a test gate: no assertion
     * timeout was changed, and nothing that is *checked* got more tolerant." This is that same
     * distinction applied to the request. No budget moved, no expectation softened: the specs
     * still read the route, still assert 200, and now measure the answer rather than the compiler.
     */
    const warmup = await apiRequest(`/api/sessions/${ids.session}`, { headers: authHeaders(owner) });
    if (warmup.status !== 200) {
      throw new Error(
        `Warming GET /api/sessions/[id] failed before any spec ran (status ${warmup.status}). ` +
        'This is a server-startup problem, not a sync result.',
      );
    }
    await warmup.body?.cancel();
  });

  afterAll(async () => {
    if (fixtures) await fixtures.cleanup();
    if (owner) await owner.cleanup();
    await stopApiServer();
  });

  /**
   * The session as the server has it, read from the route whose contract says it carries it.
   *
   * Until #105 these specs asserted a batch's outcome against `data.state` on the sync response
   * itself. That field was real — strictly validated, and `SessionStateSchema` since #73 — and was
   * read by no client, which is the whole reason it was deleted rather than wired up. The claims
   * those assertions made were about *stored* state, and stored state has one producer, so they
   * are re-aimed rather than dropped: identical expectations, read through
   * `GET /api/sessions/[id]`, which is where the graph is actually promised.
   */
  async function authoritativeState(sessionId = ids.session): Promise<SessionState> {
    const response = await apiRequest(`/api/sessions/${sessionId}`, { headers: authHeaders(owner) });
    expect(response.status).toBe(200);
    const parsed = SessionDetailResponseSchema.safeParse(await responseBody(response));
    if (!parsed.success || !parsed.data.ok) {
      throw new Error(
        'GET /api/sessions/[id] did not satisfy its own contract: ' +
        JSON.stringify(parsed.success ? parsed.data : parsed.error.issues),
      );
    }
    return parsed.data.data;
  }

  it('returns item-level results for all four mutation operations', async () => {
    const response = await jsonRequest('/api/sync', batch.syncBody([batch.setMutation, batch.taskMutation, batch.phaseMutation, batch.finishMutation]), {
      method: 'POST', headers: authHeaders(owner),
    });
    expect(response.status).toBe(200);
    const body = await responseBody(response);
    const parsed = SyncResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success || !parsed.data.ok) return;
    expect(parsed.data.data.applied).toEqual([batch.setMutation.mutationId, batch.taskMutation.mutationId]);
    expect(parsed.data.data.rejected).toEqual([
      { mutationId: batch.phaseMutation.mutationId, reason: 'INVALID_MUTATION' },
      { mutationId: batch.finishMutation.mutationId, reason: 'CONFLICT' },
    ]);
    expect(parsed.data.data.serverSeq).toBe(2);
    expect(parsed.data.data.clockSkewMs).toEqual(expect.any(Number));
    // #105, read off the bytes rather than off the schema. `safeParse` above proves the contract
    // no longer *describes* `state`; this proves the route stopped *emitting* it. Put the field
    // back in the producer and this is the line that goes red first.
    expect(wireFields(body)).toEqual(SYNC_WIRE_FIELDS);
    // What `data.state` used to be asserted from — the stored outcome of the batch — read from
    // the route that promises stored outcomes.
    expect(await authoritativeState()).toMatchObject({
      id: ids.session,
      phase: 'exercise',
      status: 'in_progress',
      serverSeq: 2,
      sets: [{ exerciseId: ids.exercise, setIndex: 0, weightKg: 60.5, reps: 8 }],
    });
  });

  it('applies valid ordered phase and finish operations and advances the authoritative sequence', async () => {
    const setOne = {
      op: 'set.upsert' as const,
      mutationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      clientTs,
      sessionId: ids.session,
      exerciseId: ids.exercise,
      setIndex: 1,
      isCompleted: true,
      weightKg: 60.5,
      reps: 8,
    };
    const setTwo = { ...setOne, mutationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', setIndex: 2 };
    const advanceStretch = {
      op: 'phase.advance' as const,
      mutationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      clientTs,
      sessionId: ids.session,
      phase: 'stretch' as const,
    };
    const stretchTask = {
      op: 'task.complete' as const,
      mutationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      clientTs,
      sessionId: ids.session,
      taskKey: 'stretch' as const,
      completedAt: clientTs,
    };
    const advancePostWorkout = {
      op: 'phase.advance' as const,
      mutationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      clientTs,
      sessionId: ids.session,
      phase: 'post_workout' as const,
    };
    const finish = {
      op: 'session.finish' as const,
      mutationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      clientTs,
      sessionId: ids.session,
      completedAt: clientTs,
    };

    const response = await jsonRequest('/api/sync', batch.syncBody([
      setOne, setTwo, advanceStretch, stretchTask, advancePostWorkout, finish,
    ]), { method: 'POST', headers: authHeaders(owner) });
    expect(response.status).toBe(200);
    const parsed = SyncResponseSchema.safeParse(await responseBody(response));
    expect(parsed.success).toBe(true);
    if (!parsed.success || !parsed.data.ok) return;
    expect(parsed.data.data.applied).toEqual([
      setOne.mutationId,
      setTwo.mutationId,
      advanceStretch.mutationId,
      stretchTask.mutationId,
      advancePostWorkout.mutationId,
      finish.mutationId,
    ]);
    expect(parsed.data.data.rejected).toEqual([]);
    expect(parsed.data.data.serverSeq).toBe(8);
    // Six mutations, six sequence numbers, one lifecycle walked end to end — asserted against
    // the authoritative read rather than against a copy shipped alongside the answer. #105's
    // point is that this route was never a second source of truth; now it cannot look like one.
    expect(await authoritativeState()).toMatchObject({
      id: ids.session,
      status: 'completed',
      phase: 'post_workout',
      serverSeq: 8,
      sets: [
        { exerciseId: ids.exercise, setIndex: 0, isCompleted: true },
        { exerciseId: ids.exercise, setIndex: 1, isCompleted: true },
        { exerciseId: ids.exercise, setIndex: 2, isCompleted: true },
      ],
    });
  });

  it('rejects an unauthenticated sync request with the canonical 401 envelope', async () => {
    const response = await jsonRequest('/api/sync', batch.syncBody(), { method: 'POST' });
    await expectAppError(response, 401, 'UNAUTHENTICATED');
  });

  it('rejects a 201-mutation batch with the canonical validation envelope', async () => {
    const response = await jsonRequest('/api/sync', batch.syncBody(Array.from({ length: 201 }, () => batch.setMutation)), {
      method: 'POST', headers: authHeaders(owner),
    });
    await expectAppError(response, 400, 'VALIDATION_ERROR');
  });

  it('reports an identical mutation replay as applied without a duplicate response shape', async () => {
    const first = await jsonRequest('/api/sync', batch.syncBody(), { method: 'POST', headers: authHeaders(owner) });
    const second = await jsonRequest('/api/sync', batch.syncBody(), { method: 'POST', headers: authHeaders(owner) });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(SyncResponseSchema.safeParse(await responseBody(first)).success).toBe(true);
    expect(SyncResponseSchema.safeParse(await responseBody(second)).success).toBe(true);
  });

  it('hides a foreign session behind the canonical not-found response', async () => {
    const response = await jsonRequest('/api/sync', batch.syncBody([{
      ...batch.setMutation,
      mutationId: '99999999-9999-4999-8999-999999999999',
      sessionId: ids.foreignSession,
    }]), { method: 'POST', headers: authHeaders(owner) });
    await expectAppError(response, 404, 'NOT_FOUND');
  });

  it('rejects mixed-session batches before repository ownership lookup', async () => {
    const response = await jsonRequest('/api/sync', batch.syncBody([
      batch.setMutation,
      { ...batch.setMutation, mutationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sessionId: ids.foreignSession },
    ]), { method: 'POST', headers: authHeaders(owner) });
    await expectAppError(response, 400, 'VALIDATION_ERROR');
  });

  /*
   * #105 Option B — the deployment claim, executed.
   *
   * Deleting a response field is a deploy, not an edit: the mutations a device queued before this
   * change drain against the server after it. What makes that safe is that the *request* half is
   * untouched — `StoredMutation['payload']` is a `SyncMutation`, and `provider.tsx` assembles
   * `{deviceId, sinceSeq, mutations}` from those records — so a stale IndexedDB holds a batch this
   * route still understands. "Untouched" is a claim about bytes, so the literal below is written
   * the way that queue writes it, and asserted against `SyncRequestSchema` before it is sent.
   *
   * The batch gets its own session (started through `POST /api/sessions`, whose `clientId`
   * idempotency means it cannot return the fixture session the specs above own). Three mutations
   * apply, one is refused, and both halves of the claim are in the same response: 200 rather than
   * a 500, and a named mutation with a reason rather than a silent discard.
   */
  it('drains a batch queued by the previous build and answers it in the narrowed shape', async () => {
    const started = await jsonRequest(
      '/api/sessions',
      { routineDayId: ids.routineDay, clientId: ids.freshDevice },
      { method: 'POST', headers: authHeaders(owner) },
    );
    expect(started.status).toBe(200);
    const startParsed = SessionStartResponseSchema.safeParse(await responseBody(started));
    expect(startParsed.success).toBe(true);
    if (!startParsed.success || !startParsed.data.ok) return;
    // The fresh session starts where the fixture one cannot: proof this batch is landing on a
    // row none of the specs above has a sequence number pinned to.
    expect(startParsed.data.data.phase).toBe('pre_workout');
    const sessionId = startParsed.data.data.id;

    const warmUp = {
      op: 'task.complete' as const,
      mutationId: '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      clientTs, sessionId, taskKey: 'warm_up' as const, completedAt: clientTs,
    };
    const startMainWorkout = {
      op: 'phase.advance' as const,
      mutationId: '9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      clientTs, sessionId, phase: 'exercise' as const,
    };
    const loggedSet = {
      op: 'set.upsert' as const,
      mutationId: '9ccccccc-cccc-4ccc-8ccc-cccccccccccc',
      clientTs, sessionId, exerciseId: ids.exercise, setIndex: 0,
      isCompleted: true, weightKg: 50, reps: 5,
    };
    // Refused by the lifecycle (the fixture day plans three sets), not by the narrowing — which
    // is the point: a queue containing something the server will not accept still has to come
    // back as an item-level verdict the runner can render.
    const beyondThePlan = {
      op: 'set.upsert' as const,
      mutationId: '9ddddddd-dddd-4ddd-8ddd-dddddddddddd',
      clientTs, sessionId, exerciseId: ids.exercise, setIndex: 9,
      isCompleted: true, weightKg: 50, reps: 5,
    };
    const queuedByThePreviousBuild = {
      deviceId: ids.device,
      sinceSeq: 0,
      mutations: [warmUp, startMainWorkout, loggedSet, beyondThePlan],
    };
    expect(SyncRequestSchema.safeParse(queuedByThePreviousBuild).success).toBe(true);

    const response = await jsonRequest('/api/sync', queuedByThePreviousBuild, {
      method: 'POST', headers: authHeaders(owner),
    });
    // Never a 500 for a queue it can no longer answer with a graph.
    expect(response.status).toBe(200);
    const body = await responseBody(response);
    expect(SyncResponseSchema.safeParse(body).success).toBe(true);
    expect(wireFields(body)).toEqual(SYNC_WIRE_FIELDS);
    const data = SyncResponseDataSchema.parse((body as { data: unknown }).data);
    expect(data.applied).toEqual([warmUp.mutationId, startMainWorkout.mutationId, loggedSet.mutationId]);
    expect(data.rejected).toEqual([{ mutationId: beyondThePlan.mutationId, reason: 'INVALID_MUTATION' }]);
    expect(data.serverSeq).toBe(3);

    // And the state the deleted field used to hand back is readable, correct, and arrives from the
    // one route that promises it.
    expect(await authoritativeState(sessionId)).toMatchObject({
      id: sessionId,
      status: 'in_progress',
      phase: 'exercise',
      serverSeq: 3,
      tasks: [{ taskKey: 'warm_up' }],
      sets: [{ exerciseId: ids.exercise, setIndex: 0, weightKg: 50, reps: 5, isCompleted: true }],
    });
  });

  /*
   * M4-05 (#94): the card's "reconstruct a refused mutation" scenario, asserted
   * end-to-end against the running server rather than through an in-process sink —
   * routes cannot be imported here (`contract-graph.test.ts` guards why), and the
   * claim under test is precisely the one an in-process mock cannot make: that the
   * scope survives the route, the engine, and the stream split (`consoleSink`
   * writes `warn` to stderr and `info` to stdout, so a spec watching one pipe
   * would be blind to half the trail) and still lands every line under one id.
   *
   * The batch is one accepted mutation and one refused on a session this spec
   * starts for itself — `clientId` idempotency means a fresh uuid can come back
   * as nobody else's fixture session.
   */
  it('refuses a mutation on the trail as loudly as it applies one, under a single id', async () => {
    const trailDevice = '5e5e0000-0000-4000-8000-00000000005e';
    const started = await jsonRequest(
      '/api/sessions',
      { routineDayId: ids.routineDay, clientId: trailDevice },
      { method: 'POST', headers: authHeaders(owner) },
    );
    expect(started.status).toBe(200);
    const startParsed = SessionStartResponseSchema.safeParse(await responseBody(started));
    expect(startParsed.success).toBe(true);
    if (!startParsed.success || !startParsed.data.ok) return;
    const startData = startParsed.data.data;
    const sessionId = startData.id;
    /*
     * `startSession` is idempotent over *one open session per user and day*, not
     * per clientId — measured, not read: the first version of this spec assumed a
     * fresh session and got the drain spec's (all three mutations refused,
     * `serverSeq` 3 already on it). So the batch adapts to the session actually
     * in hand: only a session that has not reached the workout needs the
     * warm-up/advance walk before a logged set is legal. What the spec asserts
     * — one applied and one refused under one id — does not depend on which
     * session the idempotency returned.
     */
    const batch: unknown[] = [];
    const expectedApplied: string[] = [];
    if (startData.phase !== 'exercise') {
      const warmUp = {
        op: 'task.complete' as const,
        mutationId: '9eeeeeee-eeee-4eee-8eee-eeeeeeee0001',
        clientTs, sessionId, taskKey: 'warm_up' as const, completedAt: clientTs,
      };
      const startMainWorkout = {
        op: 'phase.advance' as const,
        mutationId: '9eeeeeee-eeee-4eee-8eee-eeeeeeee0002',
        clientTs, sessionId, phase: 'exercise' as const,
      };
      batch.push(warmUp, startMainWorkout);
      expectedApplied.push(warmUp.mutationId, startMainWorkout.mutationId);
    }
    const logged = {
      op: 'set.upsert' as const,
      mutationId: '9eeeeeee-eeee-4eee-8eee-eeeeeeee0004',
      clientTs, sessionId, exerciseId: ids.exercise, setIndex: 1,
      isCompleted: true, weightKg: 50, reps: 5,
    };
    // Refused by the lifecycle (three planned sets, index 9 is beyond them),
    // exactly the `INVALID_MUTATION` shape the drain spec above pins.
    const refused = {
      op: 'set.upsert' as const,
      mutationId: '9eeeeeee-eeee-4eee-8eee-eeeeeeee0003',
      clientTs, sessionId, exerciseId: ids.exercise, setIndex: 9,
      isCompleted: true, weightKg: 50, reps: 5,
    };
    batch.push(logged, refused);
    const response = await jsonRequest(
      '/api/sync',
      { deviceId: trailDevice, sinceSeq: 0, mutations: batch },
      { method: 'POST', headers: authHeaders(owner) },
    );
    expect(response.status).toBe(200);
    const body = await responseBody(response);
    const data = SyncResponseDataSchema.parse((body as { data: unknown }).data);
    expectedApplied.push(logged.mutationId);
    expect(data.applied).toEqual(expectedApplied);
    expect(data.rejected).toEqual([{ mutationId: refused.mutationId, reason: 'INVALID_MUTATION' }]);

    // The camelCase call-site key arrives snake_cased: `wireKey` is the only
    // place the mapping happens, and the assertion spelling is the wire's.
    const rejection = await waitForLogEntry(
      (entry) => entry.msg === 'sync mutation rejected' && entry.mutation_id === refused.mutationId,
    );
    expect(rejection).toMatchObject({
      level: 'warn',
      reason: 'INVALID_MUTATION',
      user_id: owner.userId,
      session_id: sessionId,
    });
    expect(typeof rejection.request_id).toBe('string');

    const completion = await waitForLogEntry(
      (entry) => entry.msg === 'request completed' && entry.request_id === rejection.request_id,
    );
    expect(completion).toMatchObject({
      level: 'info',
      method: 'POST',
      path: '/api/sync',
      status: 200,
    });
    expect(typeof completion.duration_ms).toBe('number');

    // The client-visible half: the opaque id on an error envelope is a handle
    // into this trail. Quoting it to support — which is the AC's story — is
    // this predicate, and it must find exactly the request it came from.
    const refusedAgain = await jsonRequest(
      '/api/sync',
      { deviceId: trailDevice, sinceSeq: 0, mutations: [] },
      { method: 'POST' },
    );
    expect(refusedAgain.status).toBe(401);
    const envelope = AppEnvelopeSchema.safeParse(await responseBody(refusedAgain));
    expect(envelope.success).toBe(true);
    if (!envelope.success || envelope.data.ok) return;
    const quotedId = envelope.data.error.requestId;
    expect(typeof quotedId).toBe('string');
    expect(quotedId).not.toBe(rejection.request_id);

    const quotedCompletion = await waitForLogEntry(
      (entry) => entry.msg === 'request completed' && entry.request_id === quotedId,
    );
    expect(quotedCompletion).toMatchObject({ status: 401 });
  });

  // Live since #42 wired `syncRateLimiter` into the route. Declared last on
  // purpose: it exhausts this user's window, so anything after it would 429.
  // Budget: 121 sequential round trips measured 25-30s locally, so the per-test
  // timeout is 90s rather than the 30s it was written with. A gate that is
  // correct but flaky under slower CI hardware gets blamed on the test subject.
  // Note what this asserts and what it does not — the limiter is process-local,
  // so this proves the route honours a budget, not that the budget survives more
  // than one server instance. That distribution gap is recorded as a residual
  // risk rather than papered over by the wording here.
  it('enforces the documented 120 requests per minute per-user limit', async () => {
    let lastResponse: Response | undefined;
    for (let attempt = 0; attempt < 121; attempt += 1) {
      lastResponse = await jsonRequest('/api/sync', batch.syncBody(), {
        method: 'POST', headers: authHeaders(owner),
      });
    }
    if (!lastResponse) throw new Error('Expected a rate-limit response.');
    await expectAppError(lastResponse, 429, 'RATE_LIMITED');
  }, 90_000);
});
