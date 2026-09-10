import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExercisesListResponseSchema } from '../../../lib/contracts/exercises.js';
import { isPending } from './pending-handlers.js';
import { apiRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

// Pending while the handler is unbuilt. Delete the `exercises` entry from
// ./pending-handlers.ts when GET /api/exercises lands (#42) — the registry guard in
// tests/unit/api/pending-handlers.test.ts fails if the entry outlives the route.
describe.skipIf(isPending('exercises'))('M1-16 RED: GET /api/exercises', () => {
  beforeAll(startApiServer);
  afterAll(stopApiServer);

  it('returns the exercise library in the canonical envelope and advertises one-hour cacheability', async () => {
    const response = await apiRequest('/api/exercises');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=3600');
    expect(ExercisesListResponseSchema.safeParse(await responseBody(response)).success).toBe(true);
  });
});
