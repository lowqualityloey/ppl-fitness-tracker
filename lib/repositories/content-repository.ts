import { asc, isNull } from 'drizzle-orm';
import { exercises } from '../../db/schema/index';
import { getDb } from '../db/client';
import type { Exercise } from '../contracts/exercises';

/**
 * M2-06 (#42): read-only access to the shared exercise library.
 *
 * This is the one repository that deliberately does **not** call `withUser()`,
 * and that exception is worth stating precisely because the rest of the codebase
 * forbids it. `GET /api/exercises` is a public, CDN-cacheable read (the route
 * sends `s-maxage=3600`, and the M1-16 harness asserts a 200 with no
 * credentials), so there is no verified user to bind claims to — inventing one
 * would mean either requiring auth the contract does not ask for, or sending a
 * fake subject through `withUser()` and laundering an unchecked context into the
 * one seam that is supposed to guarantee there isn't one.
 *
 * What replaces the claim binding is a pair of narrower guarantees:
 *
 * 1. The query is `owner_user_id IS NULL` — system content only, stated in the
 *    SQL rather than inferred.
 * 2. The selected columns are the public library fields. Nothing user-shaped is
 *    read, so nothing user-shaped can leak even if the predicate were dropped.
 *
 * RLS is still the backstop, not the mechanism: the pool connects as the
 * non-owner `app_authenticated` role, so with no JWT subject in scope the
 * content policies admit only `owner_user_id IS NULL` rows anyway. Adding a
 * second, independent filter is the point — ADR-0003's whole argument is that
 * neither layer is trusted alone.
 */
export class ContentRepository {
  /** The seeded library, ordered by slug so the response is stable under caching. */
  async listSystemExercises(): Promise<Exercise[]> {
    const rows = await getDb()
      .select({
        id: exercises.id,
        slug: exercises.slug,
        name: exercises.name,
        muscleGroups: exercises.muscleGroups,
        equipment: exercises.equipment,
        formTips: exercises.formTips,
        videoUrl: exercises.videoUrl,
        alternatives: exercises.alternatives,
      })
      .from(exercises)
      .where(isNull(exercises.ownerUserId))
      .orderBy(asc(exercises.slug));

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      muscleGroups: row.muscleGroups,
      equipment: row.equipment,
      formTips: row.formTips,
      videoUrl: row.videoUrl,
      alternatives: row.alternatives,
    }));
  }
}
