import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { confirmUrl, signInRequestSchema } from '../../../../lib/auth/magic-link';
import { clientIp, signInRateLimiter } from '../../../../lib/auth/rate-limit';
import { rateLimitedError, validationError, type AppEnvelope } from '../../../../lib/contracts/envelope';

function errorResponse(error: ReturnType<typeof validationError> | ReturnType<typeof rateLimitedError>) {
  const response = NextResponse.json<AppEnvelope<never>>({ ok: false, error }, { status: error.status });
  if (error.code === 'RATE_LIMITED') {
    response.headers.set('Retry-After', '600');
  }
  return response;
}

export async function POST(request: NextRequest) {
  const parsed = signInRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(validationError());
  }

  const limit = signInRateLimiter.check(clientIp(request.headers.get('x-vercel-forwarded-for')));
  if (!limit.allowed) {
    const response = errorResponse(rateLimitedError());
    response.headers.set('Retry-After', String(limit.retryAfterSeconds));
    return response;
  }

  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: confirmUrl() },
  });

  // Do not reveal whether GoTrue recognised the address or accepted delivery.
  return NextResponse.json<AppEnvelope<{ message: string }>>({
    ok: true,
    data: { message: 'If the address is registered, a sign-in link has been sent.' },
  }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}