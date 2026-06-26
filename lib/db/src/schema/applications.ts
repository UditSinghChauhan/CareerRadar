import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { applicationStatusEnum } from "./enums";

export const applicationsTable = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    status: applicationStatusEnum("status").notNull().default("saved"),
    appliedDate: timestamp("applied_date", { withTimezone: true }),
    notes: text("notes"),
    resumeVersion: text("resume_version"),
    referralName: text("referral_name"),
    followUpDate: timestamp("follow_up_date", { withTimezone: true }),
    offerAmount: integer("offer_amount"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    unique("applications_clerk_job_unique").on(table.clerkId, table.jobId),
    index("applications_clerk_id_idx").on(table.clerkId),
    index("applications_job_id_idx").on(table.jobId),
    index("applications_status_idx").on(table.status),
  ],
);

export type Application = typeof applicationsTable.$inferSelect;
export type InsertApplication = typeof applicationsTable.$inferInsert;
