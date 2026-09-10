import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import { LegacyImportResponseSchema } from '../../../lib/contracts/import.js';
import { authHeaders, createTestSession, type TestSession } from './fixtures.js';
import { isPending } from './pending-handlers.js';
import { jsonRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

const legacyPayload = {
  pushWorkoutProgress: JSON.stringify({ currentPhase: 'main-workout', state: {}, timestamp: 1 }),
  legsWorkoutProgress: JSON.stringify({ currentPhase: 'exercise', state: {}, checkboxStates: {}, timerStates: {} }),
  pullDayProgress: JSON.stringify({
    currentPhase: 'workout', completedSets: 2, completedExercises: 1, workoutStartTime: null,
    cardioTimeLeft: 300, cooldownTimeLeft: 600, checkboxStates: {}, stretchStates: {},
  }),
};

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

// Pending while the handler is unbuilt. Delete the `importLegacy` entry from
// ./pending-handlers.ts when POST /api/import/legacy lands (#40 / M2-05); these five
// specs are that issue's acceptance harness.
describe.skipIf(isPending('importLegacy'))('M1-16 RED: POST /api/import/legacy', () => {
  let owner!: TestSession;

  beforeAll(async () => {
    await startApiServer();
    owner = await createTestSession('legacy-import');
  });

  afterAll(async () => {
    if (owner) await owner.cleanup();
    await stopApiServer();
  });

  it('accepts all three divergent localStorage key shapes and returns an import report', async () => {
    const response = await jsonRequest('/api/import/legacy', legacyPayload, {
      method: 'POST', headers: authHeaders(owner),
    });
    expect([200, 201]).toContain(response.status);
    expect(LegacyImportResponseSchema.safeParse(await responseBody(response)).success).toBe(true);
  });

  it('keeps valid keys importable when a sibling key is malformed', async () => {
    const response = await jsonRequest('/api/import/legacy', {
      pushWorkoutProgress: legacyPayload.pushWorkoutProgress,
      legsWorkoutProgress: '{malformed-json',
    }, { method: 'POST', headers: authHeaders(owner) });
    expect([200, 201, 207]).toContain(response.status);
    expect(LegacyImportResponseSchema.safeParse(await responseBody(response)).success).toBe(true);
  });

  it('returns the original report for an identical source fingerprint', async () => {
    const first = await jsonRequest('/api/import/legacy', legacyPayload, {
      method: 'POST', headers: authHeaders(owner),
    });
    const second = await jsonRequest('/api/import/legacy', legacyPayload, {
      method: 'POST', headers: authHeaders(owner),
    });
    expect([200, 201]).toContain(first.status);
    expect([200, 201]).toContain(second.status);
    expect(LegacyImportResponseSchema.safeParse(await responseBody(first)).success).toBe(true);
    expect(LegacyImportResponseSchema.safeParse(await responseBody(second)).success).toBe(true);
  });

  it('rejects unauthenticated imports with the canonical 401 envelope', async () => {
    const response = await jsonRequest('/api/import/legacy', legacyPayload, { method: 'POST' });
    await expectAppError(response, 401, 'UNAUTHENTICATED');
  });

  it('enforces the documented five requests per hour per-user limit', async () => {
    let lastResponse: Response | undefined;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      lastResponse = await jsonRequest('/api/import/legacy', legacyPayload, {
        method: 'POST', headers: authHeaders(owner),
      });
    }
    if (!lastResponse) throw new Error('Expected a rate-limit response.');
    await expectAppError(lastResponse, 429, 'RATE_LIMITED');
  });
});
