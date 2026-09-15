import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  deadlineAlertDays: integer("deadline_alert_days").notNull().default(3),
  /**
   * How many applications Today's Queue asks for in a day (Phase 3.3).
   * Default 10, which is also the queue's default `limit` — the counter and
   * the list are meant to agree out of the box.
   */
  dailyApplicationTarget: integer("daily_application_target")
    .notNull()
    .default(10),
  theme: text("theme", { enum: ["light", "dark", "system"] })
    .notNull()
    .default("system"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSettingsSchema = createSelectSchema(settingsTable)
  .pick({
    emailNotifications: true,
    deadlineAlertDays: true,
    dailyApplicationTarget: true,
    theme: true,
    timezone: true,
  })
  .partial();

export type Settings = typeof settingsTable.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;
