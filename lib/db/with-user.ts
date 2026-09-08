import { sql } from 'drizzle-orm';
import type { Db, Tx } from './types';
import type { JwtClaims } from './auth-context';

export type { Db, Tx } from './types';
export type { JwtClaims } from './auth-context';

/**
 * withUser() - The hardened user context helper for RLS operations.
 *
 * This is the ONLY way user-scoped database operations should be performed
 * in the application. Implements the two-GUC pattern proven by M0 spike
 * to close the legacy GUC ordering hazard discovered in Amendment A1.1.
 *
 * CRITICAL: Never use single-statement set_config patterns elsewhere in
 * the codebase. This helper exists specifically to prevent the GUC-ordering
 * hazard where session-scoped request.jwt.claim.sub silently overrides
 * transaction-local request.jwt.claims.
 *
 * @example
 * ```typescript
 * const sessions = await withUser(db, userClaims, (tx) =>
 *   tx.select().from(workoutSessions).where(eq(workoutSessions.userId, userId))
 * );
 * ```
 */

/**
 * Execute database operations within authenticated user context.
 *
 * Implements the hardened two-statement pattern to prevent GUC-ordering hazard:
 * 1. Blank legacy request.jwt.claim.sub (prevents session-scope override)
 * 2. Set transaction-local request.jwt.claims (provides auth.uid())
 *
 * Both statements use is_local=true for transaction-only scope.
 * Order matters: Supabase's auth.uid() checks the singular GUC first.
 *
 * @param db - Drizzle database instance
 * @param claims - JWT claims from GoTrue (sub field is load-bearing)
 * @param fn - Callback receiving transaction context
 * @returns Promise resolving to callback result
 */
export function withUser<T>(
  db: Db,
  claims: JwtClaims,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // Step 1: Blank legacy singular GUC to prevent session-scope override
    await tx.execute(sql`SELECT set_config('request.jwt.claim.sub', '', true)`);
    
    // Step 2: Set transaction-local claims object for auth.uid() resolution
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`
    );
    
    // Execute user operation with RLS context established
    return fn(tx);
  });
}
