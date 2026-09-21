import { z } from 'zod';
import { createAppEnvelopeSchema } from './envelope';

/**
 * M4-30: the health surface — `GET /api/health`.
 *
 * This is the release probe's contract, and its shape is deliberately boring. The
 * release runbook (`docs/releases/2026-09-21-v1.0.0-release-readiness.md` §4) parses
 * this body rather than trusting a status code, because a platform can answer 200
 * for a deployment whose application never booted.
 *
 * Two facts are reported, and they are the two a deploy can independently get wrong:
 *
 * - `status: 'ok'` — the process is up and serving this route.
 * - `db.ok` + `db.latencyMs` — the process can actually reach its database, and how
 *   long that round trip took.
 *
 * `latencyMs` is reported but **never asserted against a budget**. A health endpoint
 * that turns red because a query was slow on a loaded runner is an outage generator;
 * the number travels as evidence for a human and a monitor to read.
 *
 * `.strict()` on both objects, matching every other contract here: an extra field is
 * a shape change, and a shape change should fail loudly at the boundary rather than
 * travel as untyped ballast.
 */

export const HealthDbSchema = z.object({
  ok: z.literal(true),
  latencyMs: z.number().nonnegative(),
}).strict();

export const HealthResponseDataSchema = z.object({
  status: z.literal('ok'),
  db: HealthDbSchema,
}).strict();

export const HealthResponseSchema = createAppEnvelopeSchema(HealthResponseDataSchema);

export type HealthDb = z.infer<typeof HealthDbSchema>;
export type HealthResponseData = z.infer<typeof HealthResponseDataSchema>;
