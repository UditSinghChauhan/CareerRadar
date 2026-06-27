import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";

export const providerSyncLogsTable = pgTable("provider_sync_logs", {
  id: uuid("id").primaryKey().defaultRandom(),

  /** e.g. "greenhouse", "lever", "ashby" */
  providerName: text("provider_name").notNull(),

  /** Slug of the company this run was for, e.g. "razorpay" */
  companySlug: text("company_slug").notNull(),

  status: text("status", { enum: ["success", "failure", "skipped"] }).notNull(),

  jobsFetched: integer("jobs_fetched").notNull().default(0),
  jobsInserted: integer("jobs_inserted").notNull().default(0),
  jobsUpdated: integer("jobs_updated").notNull().default(0),
  jobsSkipped: integer("jobs_skipped").notNull().default(0),

  /** Populated on failure */
  errorMessage: text("error_message"),

  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type ProviderSyncLog = typeof providerSyncLogsTable.$inferSelect;
export type InsertProviderSyncLog = typeof providerSyncLogsTable.$inferInsert;
