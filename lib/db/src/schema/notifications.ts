import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  index,
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_clerk_id_idx").on(table.clerkId),
    index("notifications_is_read_idx").on(table.isRead),
    index("notifications_type_idx").on(table.type),
  ],
);

export type Notification = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
