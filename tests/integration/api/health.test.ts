import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '../../../lib/contracts/health.js';
import { apiRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

/**
 * M4-30: `GET /api/health` — the release probe's target.
 *
 * This route exists because `pk:ship`'s post-deploy smoke test needs something to
 * hit, and until now there was nothing: 11 route files, none of them health. A
 * probe is only worth having if it can distinguish "the server answered" from "the
 * server can reach its database", so the ping is the assertion that matters.
 *
 * Three properties are load-bearing, and each has its own case below:
 *
 * 1. **No credentials.** A health probe that needs a session cannot report on a
 *    broken auth path — it would fail for the same reason production fails, which
 *    is exactly when you need the difference.
 * 2. **Never cached.** A cached health response reports the health of the moment
 *    it was cached, which is worse than no probe: it is a green light with no
 *    witness behind it.
 * 3. **Envelope-shaped.** Every other route in this app answers through
 *    `lib/contracts/envelope`, and the release runbook parses the body rather than
 *    trusting the status code, so this route is not allowed to be the exception.
 *
 * The database-failure path (503) is deliberately **not** covered here: forcing it
 * needs a second server boot against an unreachable database, and this harness
 * boots one shared `next dev` per suite. That gap is recorded as a named residual
 * in `docs/tasks/m4/M4-30-health-endpoint.md` rather than implied to be tested.
 */

describe('GET /api/health', () => {
  beforeAll(async () => {
    await startApiServer();
  });

  afterAll(async () => {
    await stopApiServer();
  });

  it('answers 200 in the canonical envelope with a real database ping', async () => {
    const response = await apiRequest('/api/health');
    expect(response.status).toBe(200);

    const parsed = HealthResponseSchema.safeParse(await responseBody(response));
    expect(parsed.success).toBe(true);
    if (!parsed.success || !parsed.data.ok) return;

    expect(parsed.data.data.status).toBe('ok');
    expect(parsed.data.data.db.ok).toBe(true);
    // The ping is measured, not asserted to a budget: a health endpoint that fails
    // on a slow day is an outage generator. What must hold is that the number is
    // real and finite.
    expect(Number.isFinite(parsed.data.data.db.latencyMs)).toBe(true);
    expect(parsed.data.data.db.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('requires no credentials — the probe must work when auth does not', async () => {
    // No `authHeaders(...)` here, on purpose. If this ever returns 401, the release
    // smoke test starts failing for the same reason users cannot sign in.
    const response = await apiRequest('/api/health');
    expect(response.status).not.toBe(401);
    expect(response.status).toBe(200);
  });

  it('is never cached, so a green probe always has a live witness', async () => {
    const response = await apiRequest('/api/health');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
});
