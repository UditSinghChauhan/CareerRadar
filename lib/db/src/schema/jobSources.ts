import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";

export const jobSourcesTable = pgTable("job_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  baseUrl: text("base_url"),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JobSource = typeof jobSourcesTable.$inferSelect;
export type InsertJobSource = typeof jobSourcesTable.$inferInsert;
