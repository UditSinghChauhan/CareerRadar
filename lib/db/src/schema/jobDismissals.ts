import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { profilesTable } from "./profiles";
import { jobsTable } from "./jobs";

/**
 * Jobs the user has explicitly said "not this one" to (Phase 3.2).
 *
 * Keyed by `profileId`, not `clerkId`, unlike applications and bookmarks.
 * UPGRADE.md §3.2 specifies it that way and the foreign key is worth having:
 * a dismissal is meaningless without the profile it belongs to, so
 * `ON DELETE CASCADE` on both sides means a deleted profile or a purged job
 * cannot leave a row pointing at nothing. The clerk id is one indexed lookup
 * away (`profiles.clerk_id` is unique), which the queue does once per request.
 *
 * `reason` is nullable on purpose: the Dismiss button sends nothing, and a
 * required reason would turn a one-click action into a dialog. It exists so a
 * future "why?" prompt has somewhere to write.
 *
 * A dismissal is a *hide*, never a delete: the job row is untouched, and
 * `DELETE /api/jobs/:id/dismiss` puts it straight back. Nothing in this table
 * changes what any other user sees — there is one user, but the queue query
 * still scopes every read to one profile.
 */
export const jobDismissalsTable = pgTable(
  "job_dismissals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    /** Free text, unused by the UI today. Null = dismissed without saying why. */
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Dismissing twice is a no-op, not a second row — the routes rely on this
    // to make POST idempotent.
    unique("job_dismissals_profile_job_unique").on(
      table.profileId,
      table.jobId,
    ),
    index("job_dismissals_profile_id_idx").on(table.profileId),
    index("job_dismissals_job_id_idx").on(table.jobId),
  ],
);

export type JobDismissal = typeof jobDismissalsTable.$inferSelect;
export type InsertJobDismissal = typeof jobDismissalsTable.$inferInsert;
