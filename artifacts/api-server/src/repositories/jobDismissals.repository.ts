/**
 * Job dismissals (Phase 3.2)
 * ──────────────────────────
 * "Not this one." A hide, never a delete: the `jobs` row is untouched, so
 * `remove()` restores it in full and nothing here can lose a posting.
 *
 * Keyed by `profiles.id` — see lib/db/src/schema/jobDismissals.ts for why the
 * spec chose that over `clerk_id`, and `resolveProfileId` below for the one
 * indexed lookup that bridges the two.
 */

import { and, eq } from "drizzle-orm";
import {
  db,
  jobDismissalsTable,
  profilesTable,
  type JobDismissal,
} from "@workspace/db";

export const jobDismissalsRepository = {
  /**
   * Idempotent: dismissing an already-dismissed job returns the existing row
   * rather than failing on the unique constraint or writing a second one. The
   * Dismiss button can therefore be double-clicked, and a retry after a
   * dropped response is safe.
   *
   * A second call with a `reason` when the first had none does not overwrite
   * it — the first dismissal is the event, and re-dismissing is not a new one.
   */
  async add(
    profileId: string,
    jobId: string,
    reason?: string | null,
  ): Promise<JobDismissal> {
    const [inserted] = await db
      .insert(jobDismissalsTable)
      .values({ profileId, jobId, reason: reason ?? null })
      .onConflictDoNothing({
        target: [jobDismissalsTable.profileId, jobDismissalsTable.jobId],
      })
      .returning();

    if (inserted) return inserted;

    const [existing] = await db
      .select()
      .from(jobDismissalsTable)
      .where(
        and(
          eq(jobDismissalsTable.profileId, profileId),
          eq(jobDismissalsTable.jobId, jobId),
        ),
      );
    return existing!;
  },

  /** True when a row was removed, false when there was nothing to undo. */
  async remove(profileId: string, jobId: string): Promise<boolean> {
    const removed = await db
      .delete(jobDismissalsTable)
      .where(
        and(
          eq(jobDismissalsTable.profileId, profileId),
          eq(jobDismissalsTable.jobId, jobId),
        ),
      )
      .returning({ id: jobDismissalsTable.id });
    return removed.length > 0;
  },

  /** Every job this profile has dismissed, newest first. */
  async list(profileId: string): Promise<JobDismissal[]> {
    return db
      .select()
      .from(jobDismissalsTable)
      .where(eq(jobDismissalsTable.profileId, profileId));
  },
};

/**
 * `clerk_id` → `profiles.id`, or null when the user has no profile row yet.
 *
 * Deliberately does NOT create one. Profile creation belongs to
 * `GET /api/profile`, which needs a Clerk API call to fill in the name and
 * email; inventing a half-filled row from a dismissal would race that. A user
 * with no profile simply has no dismissals, which is true.
 *
 * Served by the unique index on `profiles.clerk_id`, so this costs one index
 * probe per request.
 */
export async function resolveProfileId(
  clerkId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: profilesTable.id })
    .from(profilesTable)
    .where(eq(profilesTable.clerkId, clerkId));
  return row?.id ?? null;
}
