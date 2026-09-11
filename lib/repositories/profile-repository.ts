import { eq } from 'drizzle-orm';
import { profiles } from '../../db/schema/index';
import { assertUserContext } from '../db/auth-context';
import { withUser } from '../db/with-user';
import type { Db, JwtClaims, Tx } from '../db/with-user';
import type { PreferredUnit, ProfileData, ProfilePatch } from '../contracts/profile';

/**
 * M3-00 (#57): read side of the user's own `profiles` row, and the *only*
 * write path for the two client-editable columns.
 *
 * ADR-0003 applies here without exception: unlike `ContentRepository`'s
 * public-library read, every row touched belongs to exactly one user, so
 * every method takes `userId` first, asserts it against the verified claims,
 * and runs inside `withUser()` — RLS (`id = auth.uid()`, migration `0003`)
 * is the second layer, never the mechanism.
 *
 * There is deliberately no conversion anywhere in this file. `preferredUnit`
 * is persisted exactly as received (ADR-0005): the value changes what the
 * client *displays*, and the one thing that must never depend on it is a
 * stored weight.
 *
 * `email` is read-only through this seam. It is copied here from the trigger
 * that mirrors `auth.users` (`handle_new_user`, migration `0001`), so a
 * client CAN show it, and cannot change it — identity remains Auth's.
 */
export class ProfileRepository {
  constructor(
    private readonly db: Db,
    private readonly claims: JwtClaims,
  ) {}

  private forUser<T>(userId: string, operation: (tx: Tx) => Promise<T>): Promise<T> {
    assertUserContext(userId, this.claims);
    return withUser(this.db, this.claims, operation);
  }

  async getProfile(userId: string): Promise<ProfileData | null> {
    return this.forUser(userId, async (tx) => {
      const [row] = await tx
        .select({
          userId: profiles.id,
          email: profiles.email,
          displayName: profiles.displayName,
          preferredUnit: profiles.preferredUnit,
        })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);

      return row ? toProfileData(row) : null;
    });
  }

  /**
   * Applies the (already boundary-validated) patch and returns the stored row,
   * or null when the user has no profile row — the documented 404 case. The
   * `.returning()` read means the response reflects what the database holds,
   * not what the client asked for.
   */
  async patchProfile(userId: string, patch: ProfilePatch): Promise<ProfileData | null> {
    return this.forUser(userId, async (tx) => {
      const sets: Partial<{ displayName: string; preferredUnit: PreferredUnit; updatedAt: Date }> = {
        updatedAt: new Date(),
      };
      if (patch.displayName !== undefined) sets.displayName = patch.displayName;
      if (patch.preferredUnit !== undefined) sets.preferredUnit = patch.preferredUnit;

      const [row] = await tx
        .update(profiles)
        .set(sets)
        .where(eq(profiles.id, userId))
        .returning({
          userId: profiles.id,
          email: profiles.email,
          displayName: profiles.displayName,
          preferredUnit: profiles.preferredUnit,
        });

      return row ? toProfileData(row) : null;
    });
  }
}

function toProfileData(row: {
  userId: string;
  email: string;
  displayName: string | null;
  preferredUnit: 'kg' | 'lbs';
}): ProfileData {
  return {
    userId: row.userId,
    email: row.email,
    displayName: row.displayName,
    preferredUnit: row.preferredUnit,
  };
}
