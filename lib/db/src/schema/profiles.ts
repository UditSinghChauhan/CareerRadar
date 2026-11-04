import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profilesTable = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  college: text("college"),
  degree: text("degree"),
  branch: text("branch"),
  graduationYear: integer("graduation_year"),
  cgpa: real("cgpa"),
  skills: text("skills").array().notNull().default([]),
  resumeUrl: text("resume_url"),
  linkedinUrl: text("linkedin_url"),
  githubUrl: text("github_url"),
  /**
   * The onboarding answer: 'internship', 'new_grad' or 'both'. Null until the
   * user has answered, which is what sends a new account to onboarding.
   * Additive, lib/db/sql/2026-11-03-onboarding-preferences.sql.
   */
  rolePreference: text("role_preference", {
    enum: ["internship", "new_grad", "both"],
  }),
  /** Metros the queue puts first, plus "anywhere" and "remote". */
  preferredLocations: text("preferred_locations").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateProfileSchema = createSelectSchema(profilesTable)
  .pick({
    name: true,
    college: true,
    degree: true,
    branch: true,
    graduationYear: true,
    cgpa: true,
    skills: true,
    resumeUrl: true,
    linkedinUrl: true,
    githubUrl: true,
    rolePreference: true,
    preferredLocations: true,
  })
  .partial();

export type Profile = typeof profilesTable.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
