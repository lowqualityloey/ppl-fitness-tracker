import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import {
  MEASUREMENT_RANGE_CAP,
  MeasurementKindSchema,
  MeasurementSchema,
} from '../../../lib/contracts/measurements.js';
import type { Measurement } from '../../../lib/contracts/measurements.js';
import { authHeaders, createTestSession, type TestSession } from './fixtures.js';
import { apiRequest, jsonRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';
import { appRoleDirectConnectionString, requireRow } from '../test-helpers.js';

/**
 * M4-20 (#109): `POST`/`GET /api/measurements`.
 *
 * What this file refuses to take on faith:
 *
 * - A correction IS an upsert: the same triple twice leaves ONE row and the
 *   later value — the spec's §4.1 promise, proven by reading, not by trusting
 *   the response of the second POST.
 * - OC-1's enum is a wire boundary: `height_cm` — the kind the owner said no
 *   to in planning — gets a 400 naming nothing that got written.
 * - G-1's cap is honest: 2,501 seeded rows answer the covering GET with a 400
 *   that names the remedy, and the same user's narrow window still 200s. A
 *   silently truncated health record fails this suite loudly by construction.
 * - Tenancy at this route: B's GET across A's row is empty, and B upserting
 *   A's triple writes B's row — because the key includes user_id, there is no
 *   "A's row" to fight over.
 * - `no-store` on both verbs, matching every other per-user response.
 */

const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

interface MeasurementVisibilityRow {
  mine: number;
  everything: number;
}

const get = (path: string, session?: TestSession) =>
  apiRequest(path, session ? { headers: authHeaders(session) } : {});
const post = (body: unknown, session: TestSession) =>
  jsonRequest('/api/measurements', body, { method: 'POST', headers: authHeaders(session) });

function rowsOf(envelope: Awaited<ReturnType<typeof envelopeOf>>) {
  if (!envelope.ok) throw new Error(`expected success envelope, got ${JSON.stringify(envelope.error)}`);
  return envelope.data as Measurement[];
}

async function envelopeOf(response: Response) {
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success, `envelope must parse: ${JSON.stringify(parsed, null, 2)}`).toBe(true);
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

describe('/api/measurements', () => {
  let owner!: TestSession;
  let other!: TestSession;
  let client!: Client;

  beforeAll(async () => {
    if (!OWNER_URL) throw new Error('MIGRATION_DATABASE_URL is required for the measurements API suite.');
    await startApiServer();
    client = new Client({ connectionString: OWNER_URL });
    await client.connect();
    owner = await createTestSession('measurements');
    other = await createTestSession('measurements-other');
  });

  afterAll(async () => {
    await owner?.cleanup();
    await other?.cleanup();
    await client?.end();
    await stopApiServer();
  });

  it('refuses the unauthenticated', async () => {
    expect((await jsonRequest('/api/measurements', { measuredOn: '2026-09-16', kind: 'body_weight', value: 80 }, { method: 'POST' })).status).toBe(401);
    expect((await get('/api/measurements?from=2026-01-01&to=2026-12-31')).status).toBe(401);
  });

  it('stores an honest POST and answers with the stored row, no-store', async () => {
    const response = await post(
      { measuredOn: '2026-09-16', kind: 'body_weight', value: 82.5 },
      owner,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const envelope = await envelopeOf(response);
    if (envelope.ok) expect(MeasurementSchema.parse(envelope.data)).toMatchObject({ value: 82.5 });
  });

  it('treats a correction as an upsert — one row, the later value', async () => {
    const again = await post(
      { measuredOn: '2026-09-16', kind: 'body_weight', value: 83.1 },
      owner,
    );
    expect(again.status).toBe(200);
    const rows = await get('/api/measurements?from=2026-09-16&to=2026-09-16', owner);
    const envelope = await envelopeOf(rows);
    expect(envelope.ok && envelope.data).toHaveLength(1);
    expect(rowsOf(envelope)[0]?.value).toBe(83.1);
  });

  it('rejects a kind OC-1 said no to, and unknown keys, without writing anything', async () => {
    expect((await post({ measuredOn: '2026-09-16', kind: 'height_cm', value: 178 }, owner)).status).toBe(400);
    expect((await post({ measuredOn: '2026-09-16', kind: 'body_weight', value: 80, unit: 'lbs' }, owner)).status).toBe(400);
    const check = await get('/api/measurements?from=2026-09-16&to=2026-09-16', owner);
    const envelope = await envelopeOf(check);
    expect(rowsOf(envelope).map((r) => r.kind)).toEqual(['body_weight']);
  });

  it('rejects a backwards or unbounded window (OC-3: both ends are required)', async () => {
    expect((await get('/api/measurements?from=2026-09-16&to=2026-09-15', owner)).status).toBe(400);
    expect((await get('/api/measurements?from=2026-01-01', owner)).status).toBe(400);
    expect((await get('/api/measurements', owner)).status).toBe(400);
  });

  it('orders same-day rows by kind ASC — the G-1 tie-break the e2e will depend on', async () => {
    await post({ measuredOn: '2026-09-10', kind: 'waist_cm', value: 84 }, owner);
    await post({ measuredOn: '2026-09-10', kind: 'chest_cm', value: 108 }, owner);
    const envelope = await envelopeOf(
      await get('/api/measurements?from=2026-09-10&to=2026-09-10', owner),
    );
    expect(rowsOf(envelope).map((r) => r.kind)).toEqual(['chest_cm', 'waist_cm']);
    const filtered = await envelopeOf(
      await get('/api/measurements?from=2026-09-10&to=2026-09-10&kind=waist_cm', owner),
    );
    expect(rowsOf(filtered)).toHaveLength(1);
  });

  it('keeps the second athlete whole: B sees nothing of A, and B owns B’s triple', async () => {
    const bSees = await envelopeOf(await get('/api/measurements?from=2020-01-01&to=2030-12-31', other));
    expect(rowsOf(bSees)).toEqual([]);
    expect((await post({ measuredOn: '2026-09-16', kind: 'body_weight', value: 61.0 }, other)).status).toBe(200);
    const bRows = await envelopeOf(await get('/api/measurements?from=2026-09-16&to=2026-09-16', other));
    expect(rowsOf(bRows)).toEqual([{ measuredOn: '2026-09-16', kind: 'body_weight', value: 61 }]);
    const aRows = await envelopeOf(await get('/api/measurements?from=2026-09-16&to=2026-09-16', owner));
    expect(rowsOf(aRows)[0]?.value).toBe(83.1); // untouched by B
  });

  it('holds at the raw app-role layer too — AC-3\'s third wall is RLS, not politeness', async () => {
    // Env-derived direct app-role connection; no credential is copied into
    // test source. Claims are set the way PostgREST would.
    const app = new Client({
      connectionString: appRoleDirectConnectionString(),
    });
    await app.connect();
    try {
      await app.query(
        `SELECT set_config('request.jwt.claims', $1, false)`,
        [JSON.stringify({ sub: other.userId })],
      );
      const asOther = await app.query<MeasurementVisibilityRow>(
        `SELECT count(*)::int AS mine,
                (SELECT count(*) FROM public.body_measurements)::int AS everything
           FROM public.body_measurements`,
      );
      const visibility = requireRow(asOther.rows, 'measurement visibility counts');
      expect(visibility.mine).toBe(1); // B's own body_weight row
      expect(visibility.everything).toBe(1); // A's rows invisible to B's claims
      const forged = await app.query(
        `INSERT INTO public.body_measurements (user_id, measured_on, kind, value)
         VALUES ($1, '2026-09-17', 'body_weight', 99.9)`,
        [owner.userId],
      ).catch((error: unknown) => error);
      expect(forged).toBeInstanceOf(Error); // WITH CHECK: auth.uid() ≠ owner.userId
    } finally {
      await app.end();
    }
  });

  it('turns a would-truncate range into an honest 400 that names the remedy (G-1)', async () => {
    const kinds = MeasurementKindSchema.options;
    await client.query(
      `INSERT INTO public.body_measurements (user_id, measured_on, kind, value)
       SELECT $1::uuid, '2020-01-01'::date + n, ($2::text[])[1 + n % 6], 10 + (n % 90)::numeric
         FROM generate_series(0, ${MEASUREMENT_RANGE_CAP}) AS n`,
      [owner.userId, kinds],
    );

    const wide = await get('/api/measurements?from=2020-01-01&to=2099-12-31', owner);
    expect(wide.status).toBe(400);
    const envelope = await envelopeOf(wide);
    if (!envelope.ok) {
      expect(envelope.error.message).toContain(String(MEASUREMENT_RANGE_CAP));
      expect(envelope.error.message.toLowerCase()).toContain('kind');
    }

    // Same user, same data, one day: the cap is a bound, not a wall.
    const day = await envelopeOf(await get('/api/measurements?from=2020-02-01&to=2020-02-01', owner));
    expect(rowsOf(day).length).toBeGreaterThan(0);
  });
});
