export interface JwtClaims {
  sub: string;
  role: string;
  aud?: string;
  email?: string;
  exp?: number;
  [key: string]: unknown;
}

export interface VerifiedUserContext {
  userId: string;
  claims: JwtClaims;
}

/**
 * Build the minimum claims object needed by the RLS transaction seam from a
 * user returned by Supabase Auth's verified getUser() call.
 */
export function createVerifiedUserContext(user: {
  id: string;
  email?: string | null;
}): VerifiedUserContext {
  const claims: JwtClaims = {
    sub: user.id,
    role: 'authenticated',
    aud: 'authenticated',
  };

  if (user.email) {
    claims.email = user.email;
  }

  return { userId: user.id, claims };
}

/**
 * Repository methods take userId explicitly. This invariant prevents a
 * verified claim and an application-level identity from being mixed up.
 */
export function assertUserContext(userId: string, claims: JwtClaims): void {
  if (claims.sub !== userId) {
    throw new Error('Verified user context does not match the requested user id.');
  }
}
