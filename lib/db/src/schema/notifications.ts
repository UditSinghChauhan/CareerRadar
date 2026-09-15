import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  index,
  unique,
  jsonb,
} from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { notificationTypeEnum } from "./enums";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    type: notificationTypeEnum("type").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    relatedJobId: uuid("related_job_id").references(() => jobsTable.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata"),
    /**
     * Phase 6.2. Idempotency key for notifications the sync GENERATES, so a
     * job whose deadline is 40 hours away does not produce a fresh "closes in
     * 24 hours" row on every one of the four cron passes that sees it.
     *
     * Deliberately nullable, and null is the norm: Postgres treats NULLs in a
     * unique constraint as distinct, so a hand-written or one-off notification
     * leaves this unset and is never deduplicated against anything. Only the
     * generator sets it, in the shape `deadline:<jobId>:72h` or
     * `new_job:<savedSearchId>:<jobId>` — see notifications.generator.ts.
     *
     * This is what makes generation safe to re-run. The generator inserts with
     * onConflictDoNothing against the constraint below, so concurrency and
     * retries collapse to one row rather than being guarded by a read-then-
     * write race in application code.
     */
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("notifications_clerk_dedupe_unique").on(
      table.clerkId,
      table.dedupeKey,
    ),
    index("notifications_clerk_id_idx").on(table.clerkId),
    index("notifications_is_read_idx").on(table.isRead),
    index("notifications_type_idx").on(table.type),
    // The bell's two queries: the unread count, and the newest-first page.
    // Both are `WHERE clerk_id = $1` scoped, so clerk_id leads.
    index("notifications_clerk_read_created_idx").on(
      table.clerkId,
      table.isRead,
      table.createdAt.desc(),
    ),
  ],
);

export type Notification = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
