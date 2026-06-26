import { pgTable, text, timestamp, uuid, index, unique } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";

export const bookmarksTable = pgTable(
  "bookmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("bookmarks_clerk_job_unique").on(table.clerkId, table.jobId),
    index("bookmarks_clerk_id_idx").on(table.clerkId),
    index("bookmarks_job_id_idx").on(table.jobId),
  ],
);

export type Bookmark = typeof bookmarksTable.$inferSelect;
export type InsertBookmark = typeof bookmarksTable.$inferInsert;
