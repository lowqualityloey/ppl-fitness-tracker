import { NextRequest, NextResponse } from 'next/server';
import { confirmQuerySchema, appUrl } from '../../../../lib/auth/magic-link';
import { safeRedirectPath } from '../../../../lib/auth/redirect-allowlist';
import { createClient } from '../../../../lib/supabase/server';
import { validationError, type AppEnvelope } from '../../../../lib/contracts/envelope';
import { loggedRoute } from '../../../../lib/http/request-log';

export const GET = loggedRoute(handleGet);

async function handleGet(request: NextRequest) {
  const parsed = confirmQuerySchema.safeParse({
    token_hash: request.nextUrl.searchParams.get('token_hash'),
    type: request.nextUrl.searchParams.get('type'),
  });
  if (!parsed.success) {
    return NextResponse.json<AppEnvelope<never>>(
      { ok: false, error: validationError() },
      { status: 400 },
    );
  }

  const safeDestination = safeRedirectPath(request.nextUrl.searchParams.get('next'));
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: parsed.data.token_hash,
    type: parsed.data.type,
  });

  if (error) {
    return NextResponse.redirect(new URL('/sign-in?error=link-invalid-or-expired', appUrl()), 303);
  }

  return NextResponse.redirect(new URL(safeDestination, appUrl()), 303);
}
