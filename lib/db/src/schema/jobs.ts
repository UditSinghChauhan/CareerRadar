import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { jobSourcesTable } from "./jobSources";
import { workModeEnum, jobTypeEnum, jobStatusEnum } from "./enums";

export const jobsTable = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => jobSourcesTable.id, {
      onDelete: "set null",
    }),

    // Role details
    title: text("title").notNull(),
    department: text("department"),
    location: text("location"),
    country: text("country").default("India"),

    // Type & mode
    workMode: workModeEnum("work_mode").notNull().default("onsite"),
    jobType: jobTypeEnum("job_type").notNull(),

    // Compensation
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    stipend: integer("stipend"),
    currency: text("currency").notNull().default("INR"),

    // Eligibility
    eligibleBatch: integer("eligible_batch").array().notNull().default([]),
    eligibleBranches: text("eligible_branches").array().notNull().default([]),
    minCgpa: real("min_cgpa"),
    requiredSkills: text("required_skills").array().notNull().default([]),
    experienceMin: integer("experience_min"),
    experienceMax: integer("experience_max"),

    // Application
    deadline: timestamp("deadline", { withTimezone: true }),
    applyUrl: text("apply_url"),
    sourcePlatform: text("source_platform"),
    sourceUrl: text("source_url"),
    postedDate: timestamp("posted_date", { withTimezone: true }),
    status: jobStatusEnum("status").notNull().default("active"),

    // Content
    description: text("description"),
    requirements: text("requirements"),
    benefits: text("benefits").array().notNull().default([]),
    selectionProcess: text("selection_process"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("jobs_company_id_idx").on(table.companyId),
    index("jobs_status_idx").on(table.status),
    index("jobs_job_type_idx").on(table.jobType),
    index("jobs_work_mode_idx").on(table.workMode),
    index("jobs_deadline_idx").on(table.deadline),
    index("jobs_posted_date_idx").on(table.postedDate),
    index("jobs_source_platform_idx").on(table.sourcePlatform),
  ],
);

export type Job = typeof jobsTable.$inferSelect;
export type InsertJob = typeof jobsTable.$inferInsert;
