import {
  pgTable,
  text,
  integer,
  real,
  boolean,
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
    /**
     * UNRELIABLE — do not read this for filtering. It reads 'India' for every
     * row whose provider omitted the field (the default applies silently) and
     * SmartRecruiters writes lowercase ISO-2 ('in', 'ca'). Kept because the
     * schema is additive-only; the normalised columns below replace it.
     */
    country: text("country").default("India"),

    // Normalised location (Phase 2.0) — derived from `location` by
    // relevance/location.ts at write time and by the location backfill.
    // All nullable: rows the normaliser cannot place stay reviewable rather
    // than silently disappearing (isIndia null = unknown, never false).
    locationCity: text("location_city"),
    /** Full state/province name, e.g. 'Maharashtra' (never the abbreviation). */
    locationRegion: text("location_region"),
    /** Uppercase ISO-2, null when unknown. */
    locationCountry: text("location_country"),
    /** 'NCR', 'MMR', or the canonical city name for everything else. */
    locationMetro: text("location_metro"),
    /** true / false / null = could not tell. */
    isIndia: boolean("is_india"),
    isRemote: boolean("is_remote").notNull().default(false),

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

    /**
     * Last time a provider run observed this posting in its upstream listing.
     * Stamped on insert, update AND skip — a skip still means the provider is
     * currently listing the job. The staleness sweep closes active rows whose
     * lastSeenAt predates the run that just finished.
     *
     * Nullable on purpose: every row that existed before this column was added
     * has never been swept, and NULL is what the sweep treats as "not seen".
     */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),

    // Content
    description: text("description"),
    requirements: text("requirements"),
    benefits: text("benefits").array().notNull().default([]),
    selectionProcess: text("selection_process"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    index("jobs_last_seen_at_idx").on(table.lastSeenAt),
    index("jobs_is_india_idx").on(table.isIndia),
    index("jobs_is_remote_idx").on(table.isRemote),
    index("jobs_location_metro_idx").on(table.locationMetro),
  ],
);

export type Job = typeof jobsTable.$inferSelect;
export type InsertJob = typeof jobsTable.$inferInsert;
