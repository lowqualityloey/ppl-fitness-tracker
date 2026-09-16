import { NextRequest, NextResponse } from 'next/server';
import {
  MEASUREMENT_RANGE_CAP,
  MeasurementListQuerySchema,
  MeasurementUpsertSchema,
} from '../../../../lib/contracts/measurements';
import { appSuccess, validationError } from '../../../../lib/contracts/envelope';
import { requireUserContext } from '../../../../lib/auth/require-user';
import { getDb } from '../../../../lib/db/client';
import { appErrorResponse, routeErrorResponse } from '../../../../lib/http/route-error';
import { loggedRoute } from '../../../../lib/http/request-log';
import { MeasurementsRepository } from '../../../../lib/repositories/measurements-repository';

/**
 * M4-20 (#109): `POST`/`GET /api/measurements` — routes as adapters, no
 * service layer (PD-A: the spec's speculative `lib/measurements/` never
 * got a file, and never will).
 *
 * Posture mirrors `/api/profile`, deliberately: identity comes only from
 * `requireUserContext()`; every response is `no-store` because these are
 * per-user rows; and there is no rate limiter, because the limiter lives on
 * the batch routes (sessions CRUD never had one — inventing a stricter rule
 * for the newest table is not "security-first", it's inconsistency with extra
 * steps).
 *
 * Two semantics this file owns:
 *
 * 1. **A correction is not an error** (spec §4.1): POST answers 200 with the
 *    stored row whether the triple was new or overwritten. Clients that want
 *    "created vs replaced" can compare against the row they sent; the
 *    contract refuses to encode a distinction the product does not use.
 * 2. **The cap is honest** (G-1/OC-3): the repository fetches CAP + 1, and if
 *    the 2,501st row exists the GET *fails loudly* with a 400 naming the
 *    remedy — narrow the window or filter by kind. Silent truncation of a
 *    health record is the failure mode this whole decision exists to prevent.
 */

function perUserHeaders(): HeadersInit {
  return { 'Cache-Control': 'no-store' };
}

export const POST = loggedRoute(handlePost);

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const parsed = MeasurementUpsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeErrorResponse(parsed.error);

  try {
    const context = await requireUserContext();
    const repository = new MeasurementsRepository(getDb(), context.claims);
    const data = await repository.upsertMeasurement(context.userId, parsed.data);

    return NextResponse.json(appSuccess(data), { status: 200, headers: perUserHeaders() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export const GET = loggedRoute(handleGet);

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const parsed = MeasurementListQuerySchema.safeParse({
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    kind: params.get('kind') ?? undefined,
  });
  if (!parsed.success) return routeErrorResponse(parsed.error);

  try {
    const context = await requireUserContext();
    const repository = new MeasurementsRepository(getDb(), context.claims);
    const rows = await repository.listRange(
      context.userId,
      parsed.data.from,
      parsed.data.to,
      parsed.data.kind,
    );

    if (rows.length > MEASUREMENT_RANGE_CAP) {
      return appErrorResponse(
        validationError(
          `This range holds more than ${MEASUREMENT_RANGE_CAP} measurements; ` +
          'narrow from/to or send a single kind.',
        ),
        perUserHeaders(),
      );
    }

    return NextResponse.json(appSuccess(rows), { status: 200, headers: perUserHeaders() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
