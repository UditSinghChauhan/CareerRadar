import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  uuid,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companiesTable } from "./companies";
import { jobSourcesTable } from "./jobSources";
import { workModeEnum, jobTypeEnum, jobStatusEnum } from "./enums";

/**
 * `tsvector` has no first-class Drizzle type. It is only ever written by the
 * database (the column below is GENERATED ALWAYS) and never selected into an
 * API response, so a minimal custom type that round-trips the text form is all
 * the ORM needs to know about it — enough for drizzle-kit to emit the DDL and
 * for `schema-check.ts` to expect the column.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

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

    // Relevance (Phase 2.1/2.2) — written by relevance/classifier.ts at
    // ingest time and by the relevance backfill. Deterministic rules, no LLM.
    // Nullable / defaulted so rows that predate the classifier are simply
    // "unclassified" (is_fresher_eligible false) until the backfill runs.
    /** 'internship' | 'new_grad' | 'early_career' | 'not_relevant'. */
    relevanceTrack: text("relevance_track"),
    /** 0–100. Track base plus location/batch/recency modifiers. */
    relevanceScore: integer("relevance_score"),
    /** True for every track except not_relevant — the default Jobs-page filter. */
    isFresherEligible: boolean("is_fresher_eligible").notNull().default(false),
    /** A seniority/level/years marker in the title ruled the row out. */
    seniorityExcluded: boolean("seniority_excluded").notNull().default(false),
    /** Human-readable reasons, shown on hover so a wrong track is debuggable. */
    relevanceSignals: text("relevance_signals").array().notNull().default([]),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),

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

    /**
     * Phase 7 full-text search. GENERATED ALWAYS AS ... STORED: Postgres
     * recomputes it on every insert and update, so there is no trigger to
     * forget and no backfill to run — the column is correct for all 4,554
     * existing rows the moment the DDL lands.
     *
     * Weights mirror how much a hit in each field should count: the title (A)
     * is what the user is really searching for, required skills (B) next, then
     * requirements (C) and the description (D). `websearch_to_tsquery` in
     * `jobs.repository.ts` queries it through `jobs_search_vector_idx`.
     *
     * The company name is NOT here and cannot be: a generated expression may
     * only reference columns of its own row. Company-name search stays a
     * separate `ILIKE` arm in the search predicate, unchanged from Phase 0.
     *
     * Every arm is slash-normalised first. Postgres's default parser reads
     * "Developer/intern" as a single `file` token, so it never produces an
     * `intern` lexeme and a search for "intern" misses the row — measured
     * against production, eight active postings titled `…/Intern` were lost
     * that way, which for an internship tracker is exactly the wrong eight.
     * `replace(x, \'/\', \' \')` is immutable and splits them; `node.js` and
     * `co-op` tokenise the same either way.
     *
     * `array_to_tsvector(required_skills)::text` rather than the obvious
     * `array_to_string(required_skills, \' \')`: a generated expression must be
     * IMMUTABLE and `array_to_string` is only STABLE, so Postgres rejects the
     * column outright ("generation expression is not immutable"). Going via
     * `array_to_tsvector`, which is immutable, yields a quoted list that
     * `to_tsvector` then tokenises and stems normally — so \'TypeScript\' still
     * matches a search for "typescript".
     *
     * Deliberately absent from `repositories/columns.ts`, so it never enters an
     * API payload — a tsvector is meaningless to the browser and would be the
     * single largest field in the response.
     */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', replace(coalesce(title, ''), '/', ' ')), 'A') || setweight(to_tsvector('english', replace(coalesce(array_to_tsvector(required_skills)::text, ''), '/', ' ')), 'B') || setweight(to_tsvector('english', replace(coalesce(requirements, ''), '/', ' ')), 'C') || setweight(to_tsvector('english', replace(coalesce(description, ''), '/', ' ')), 'D')`,
    ),

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
    index("jobs_is_fresher_eligible_idx").on(table.isFresherEligible),
    index("jobs_relevance_score_idx").on(table.relevanceScore),
    index("jobs_fresher_status_score_idx").on(
      table.isFresherEligible,
      table.status,
      table.relevanceScore.desc(),
    ),
    // ── Phase 7 ──
    /** Backs `search_vector @@ websearch_to_tsquery(...)`. */
    index("jobs_search_vector_idx").using("gin", table.searchVector),
    /**
     * The Jobs page's default order, key for key — including the null
     * placement, which is the part that is easy to get wrong. Postgres only
     * uses an index to satisfy an ORDER BY when the NULLS FIRST/LAST of every
     * key matches, and `ORDER BY x DESC` means NULLS FIRST while Drizzle's
     * `.desc()` on an INDEX column emits NULLS LAST. So the placements here
     * are spelled out to match `orderBy()` in jobs.repository.ts exactly:
     * relevance_score is explicitly NULLS LAST there, the other two are plain
     * DESC and therefore NULLS FIRST. Changing either side to "tidy" the
     * nulls would reorder the live feed and silently cost the index.
     */
    index("jobs_status_relevance_posted_idx").on(
      table.status,
      table.relevanceScore.desc().nullsLast(),
      table.postedDate.desc().nullsFirst(),
      table.createdAt.desc().nullsFirst(),
    ),
  ],
);

export type Job = typeof jobsTable.$inferSelect;
export type InsertJob = typeof jobsTable.$inferInsert;
