import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  jobsTable,
  companiesTable,
  jobDismissalsTable,
  applicationsTable,
  type InsertJob,
  type Job,
  type Company,
} from "@workspace/db";
import { type PaginationParams, buildPaginatedResult } from "../lib/pagination";
import { FEATURED_METROS } from "../relevance/location";
import type { RelevanceTrack } from "../relevance/classifier";
import { companyColumns, jobColumns } from "./columns";
import { prefixTsQuery, useFullTextSearch } from "../lib/search-query";

export type JobWithCompany = Job & { company: Company };

export interface JobFilters {
  search?: string;
  companyId?: string;
  workMode?: "remote" | "hybrid" | "onsite";
  jobType?: "internship" | "full_time";
  status?: "active" | "closed" | "draft";
  eligibleBatch?: number;
  minCgpaLte?: number;
  deadlineBefore?: Date;
  // ── Phase 2.0 location filters. All server-side: the page fetches a bounded
  // window of rows, so anything filtered in the browser would silently miss
  // every match outside that window. ──
  /** AND `is_india = <value>`. Rows with `is_india IS NULL` never match. */
  isIndia?: boolean;
  /** AND `is_remote = <value>`. */
  isRemote?: boolean;
  /**
   * OR-ed buckets. A metro name matches `location_metro` exactly;
   * `remote`       = is_remote AND is_india IS NOT false (remote-elsewhere
   *                  such as 'Remote - US' is excluded on purpose);
   * `other_india`  = is_india AND a metro that is not in FEATURED_METROS;
   * `india_unspecified` = is_india AND no metro at all (bare 'India') — kept
   *                  apart from other_india because "didn't say where" is not
   *                  "said somewhere else";
   * `unknown`      = is_india IS NULL — rule 6's reviewable bucket.
   * Empty / absent = no location filtering at all.
   */
  locations?: string[];
  // ── Phase 2.1 relevance filters. Same rule: server-side, never a pass
  // over the fetched window. Absent = the pre-2.1 behaviour exactly. ──
  /** AND `is_fresher_eligible = <value>`. Unclassified rows are false. */
  isFresherEligible?: boolean;
  /** AND `relevance_track IN (...)`. Unclassified rows (NULL) never match. */
  relevanceTrack?: RelevanceTrack[];
  /** AND `relevance_score >= n`. Unclassified rows (NULL) never match. */
  minRelevanceScore?: number;
  // ── Phase 7. Everything the Jobs page used to filter in the browser.
  // Same rule as Phase 2.0 spelled out above, and now load-bearing: Phase 7
  // paginates server-side, so a browser-side pass would be filtering ONE PAGE
  // of twenty rows rather than the result set. ──
  /** OR-ed. `work_mode IN (...)`. Empty / absent = no work-mode filtering. */
  workModes?: Array<"remote" | "hybrid" | "onsite">;
  /**
   * OR-ed graduation years. A row naming NO batch matches any of them — that
   * is how the browser-side filter behaved and how `eligibleBatch` (singular)
   * already behaves, and it matters because most postings state no batch.
   */
  batches?: number[];
  /** OR-ed. Same "states none = matches anything" rule as `batches`. */
  branches?: string[];
  /**
   * OR-ed, and NO empty-allowance: a row listing no skills matches nothing
   * here. That is deliberate and mirrors the browser-side filter — asking for
   * "Python" and being shown rows that never mention a skill is noise.
   */
  skills?: string[];
  /** `source_platform = <value>`. */
  sourcePlatform?: string;
  /**
   * Hide rows this Clerk user already has an application for, in any pipeline
   * stage. Absent (or null) = no filtering, which is what an anonymous caller
   * always gets.
   */
  excludeAppliedForClerkId?: string | null;
  /**
   * Company ids whose NAME matched the search text, resolved by `findAll` in a
   * separate round trip. See the search branch of `buildConditions` for why
   * this is not an `IN (subquery)`.
   */
  searchCompanyIds?: string[];
  // ── Phase 3.2 dismissals. ──
  /**
   * Hide rows this profile has dismissed. Absent (or null) = no dismissal
   * filtering at all, which is the pre-3.2 behaviour and what an anonymous
   * caller always gets — dismissals are per-profile, so there is nothing to
   * hide from someone who is not signed in.
   */
  excludeDismissedForProfileId?: string | null;
}

/**
 * `relevance` = score desc, newest first among equals — the score caps at 100
 * and hundreds of active internships sit there, so recency is the tie-break
 * that keeps the feed a feed. Unclassified rows (NULL score) sort last.
 * `newest` is the pre-2.1 order, unchanged.
 *
 * Phase 7 added `deadline`, `salary` and `company`. They existed before as
 * browser-side sorts over the fetched window, which meant "Deadline" really
 * meant "the soonest deadline among the first hundred rows". Server-side they
 * mean what they say.
 */
export type JobSort =
  | "newest"
  | "relevance"
  | "deadline"
  | "salary"
  | "company";

export const JOB_SORTS = [
  "newest",
  "relevance",
  "deadline",
  "salary",
  "company",
] as const satisfies readonly JobSort[];

/** Bucket keys that are not metro names. Anything else in `locations` is a metro. */
const SPECIAL_BUCKETS = new Set([
  "remote",
  "other_india",
  "india_unspecified",
  "unknown",
]);

/**
 * The OR of every selected bucket, or undefined when nothing is selected.
 * Exported so the backfill report can count buckets with the exact predicate
 * the filter uses.
 */
export function locationBucketCondition(locations: string[]) {
  const metros = locations.filter((l) => !SPECIAL_BUCKETS.has(l));
  const parts = [];

  if (metros.length > 0) {
    parts.push(inArray(jobsTable.locationMetro, metros));
  }
  if (locations.includes("remote")) {
    parts.push(
      and(
        eq(jobsTable.isRemote, true),
        or(isNull(jobsTable.isIndia), eq(jobsTable.isIndia, true)),
      ),
    );
  }
  if (locations.includes("other_india")) {
    parts.push(
      and(
        eq(jobsTable.isIndia, true),
        isNotNull(jobsTable.locationMetro),
        notInArray(jobsTable.locationMetro, [...FEATURED_METROS]),
      ),
    );
  }
  if (locations.includes("india_unspecified")) {
    parts.push(
      and(eq(jobsTable.isIndia, true), isNull(jobsTable.locationMetro)),
    );
  }
  if (locations.includes("unknown")) {
    parts.push(isNull(jobsTable.isIndia));
  }

  return parts.length > 0 ? or(...parts) : undefined;
}

function buildJobSelect() {
  return db
    .select({ ...jobColumns, company: companyColumns })
    .from(jobsTable)
    .innerJoin(companiesTable, eq(jobsTable.companyId, companiesTable.id));
}

/**
 * `ARRAY[$1, $2, ...]::integer[]` — every element bound as a parameter, never
 * interpolated. Matches how the pre-existing `eligibleBatch` condition below
 * builds its literal.
 */
function intArray(values: number[]) {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::integer[]`;
}

/** As `intArray`, for text[] columns. */
function textArray(values: string[]) {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

/**
 * The Phase 7 search predicate.
 *
 * Every arm is a condition on `jobs` ALONE, and that is the whole design. The
 * obvious spelling — OR-ing `companies.name ILIKE ...` across the join, or
 * `company_id IN (SELECT ... FROM companies ...)` — cannot be satisfied by an
 * index: Postgres will not build a BitmapOr across a join filter or a hashed
 * subplan, so the entire query degrades to a sequential scan and, worse,
 * detoasts `search_vector` for every row it walks. Measured on production
 * (4,074 active rows), that shape cost 19.5 ms and 12,252 buffers for a count
 * that the pre-Phase-7 ILIKE did in 5.2 ms — a full-text search slower than
 * the thing it replaced.
 *
 * Resolving the matching company ids in a separate round trip (see `findAll`)
 * turns that arm into `company_id = ANY($1)`, a plain btree lookup, and all
 * three arms then BitmapOr together off their own indexes: 0.97 ms and 106
 * buffers for the same count. The extra query is one sequential scan of a
 * 1,515-row table and only runs when there is a search term at all.
 */
function searchCondition(filters: JobFilters) {
  const raw = (filters.search ?? "").trim();
  if (!raw) return undefined;

  const companyIds = filters.searchCompanyIds ?? [];
  // Empty means no company name matched, NOT "match every company" — the arm
  // is dropped rather than widened.
  const companyArm =
    companyIds.length > 0
      ? inArray(jobsTable.companyId, companyIds)
      : undefined;

  // Below three characters, the pre-Phase-7 predicate verbatim. A one- or
  // two-character tsquery carries almost no lexical signal, and this is the
  // `ilike` fallback UPGRADE.md §7 asks for.
  if (!useFullTextSearch(raw)) {
    return or(
      ilike(jobsTable.title, `%${raw}%`),
      ...(companyArm ? [companyArm] : []),
    );
  }

  const prefix = prefixTsQuery(raw);
  return or(
    // Phrases, OR and -negation, exactly as the user typed them.
    sql`${jobsTable.searchVector} @@ websearch_to_tsquery('english', ${raw})`,
    // Restores ILIKE-style prefix matching that stemming alone would lose:
    // "intern" finding "Internship". Omitted when the input has no word
    // characters to build a query from.
    ...(prefix
      ? [sql`${jobsTable.searchVector} @@ to_tsquery('english', ${prefix})`]
      : []),
    ...(companyArm ? [companyArm] : []),
  );
}

function buildConditions(filters: JobFilters) {
  const conditions = [];

  if (filters.search) {
    const condition = searchCondition(filters);
    if (condition) conditions.push(condition);
  }
  if (filters.companyId) {
    conditions.push(eq(jobsTable.companyId, filters.companyId));
  }
  if (filters.workMode) {
    conditions.push(eq(jobsTable.workMode, filters.workMode));
  }
  if (filters.jobType) {
    conditions.push(eq(jobsTable.jobType, filters.jobType));
  }
  if (filters.status) {
    conditions.push(eq(jobsTable.status, filters.status));
  }
  if (filters.eligibleBatch !== undefined) {
    conditions.push(
      or(
        sql`${jobsTable.eligibleBatch} = '{}'::integer[]`,
        sql`${jobsTable.eligibleBatch} @> ARRAY[${filters.eligibleBatch}]::integer[]`,
      ),
    );
  }
  if (filters.minCgpaLte !== undefined) {
    conditions.push(
      or(isNull(jobsTable.minCgpa), lte(jobsTable.minCgpa, filters.minCgpaLte)),
    );
  }
  if (filters.deadlineBefore) {
    conditions.push(lte(jobsTable.deadline, filters.deadlineBefore));
  }
  if (filters.isIndia !== undefined) {
    conditions.push(eq(jobsTable.isIndia, filters.isIndia));
  }
  if (filters.isRemote !== undefined) {
    conditions.push(eq(jobsTable.isRemote, filters.isRemote));
  }
  if (filters.locations && filters.locations.length > 0) {
    const bucket = locationBucketCondition(filters.locations);
    if (bucket) conditions.push(bucket);
  }
  if (filters.isFresherEligible !== undefined) {
    conditions.push(eq(jobsTable.isFresherEligible, filters.isFresherEligible));
  }
  if (filters.relevanceTrack && filters.relevanceTrack.length > 0) {
    conditions.push(inArray(jobsTable.relevanceTrack, filters.relevanceTrack));
  }
  if (filters.minRelevanceScore !== undefined) {
    conditions.push(gte(jobsTable.relevanceScore, filters.minRelevanceScore));
  }
  if (filters.workModes && filters.workModes.length > 0) {
    conditions.push(inArray(jobsTable.workMode, filters.workModes));
  }
  if (filters.batches && filters.batches.length > 0) {
    conditions.push(
      or(
        sql`${jobsTable.eligibleBatch} = '{}'::integer[]`,
        sql`${jobsTable.eligibleBatch} && ${intArray(filters.batches)}`,
      ),
    );
  }
  if (filters.branches && filters.branches.length > 0) {
    conditions.push(
      or(
        sql`${jobsTable.eligibleBranches} = '{}'::text[]`,
        sql`${jobsTable.eligibleBranches} && ${textArray(filters.branches)}`,
      ),
    );
  }
  if (filters.skills && filters.skills.length > 0) {
    // No empty-allowance here, unlike batches and branches — see JobFilters.
    conditions.push(
      sql`${jobsTable.requiredSkills} && ${textArray(filters.skills)}`,
    );
  }
  if (filters.sourcePlatform) {
    conditions.push(eq(jobsTable.sourcePlatform, filters.sourcePlatform));
  }
  if (filters.excludeAppliedForClerkId) {
    // NOT EXISTS for the same reason as dismissals below: a NULL anywhere in a
    // NOT IN subquery empties the whole list.
    conditions.push(
      sql`not exists (
        select 1 from ${applicationsTable}
        where ${applicationsTable.jobId} = ${jobsTable.id}
          and ${applicationsTable.clerkId} = ${filters.excludeAppliedForClerkId}
      )`,
    );
  }
  if (filters.excludeDismissedForProfileId) {
    // NOT EXISTS rather than NOT IN: a NULL in the subquery would make NOT IN
    // return NULL for every row and empty the list.
    conditions.push(
      sql`not exists (
        select 1 from ${jobDismissalsTable}
        where ${jobDismissalsTable.jobId} = ${jobsTable.id}
          and ${jobDismissalsTable.profileId} = ${filters.excludeDismissedForProfileId}
      )`,
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * NOTE ON NULLS. `relevance` spells out NULLS LAST on the score and leaves the
 * other two as plain DESC (i.e. NULLS FIRST). `jobs_status_relevance_posted_idx`
 * is declared with exactly that placement so Postgres can read the feed
 * straight off the index — measured on production, page 1 went from 3.88 ms
 * and 728 buffers to 0.15 ms and 66. Change the null placement on either side
 * and you both reorder the live feed and silently lose the index.
 */
function orderBy(sort: JobSort | undefined) {
  switch (sort) {
    case "relevance":
      return [
        sql`${jobsTable.relevanceScore} DESC NULLS LAST`,
        desc(jobsTable.postedDate),
        desc(jobsTable.createdAt),
      ];
    case "deadline":
      // Soonest first, and rows with no deadline last rather than first —
      // "no deadline" is not "due today". This is what the browser-side sort
      // did with `Infinity`.
      return [
        sql`${jobsTable.deadline} ASC NULLS LAST`,
        desc(jobsTable.createdAt),
      ];
    case "salary":
      // Best-of whatever the posting stated, highest first, exactly the
      // `salaryMax ?? salaryMin ?? stipend ?? 0` the browser used.
      return [
        sql`coalesce(${jobsTable.salaryMax}, ${jobsTable.salaryMin}, ${jobsTable.stipend}, 0) DESC`,
        desc(jobsTable.createdAt),
      ];
    case "company":
      return [asc(companiesTable.name), desc(jobsTable.createdAt)];
    default:
      return [desc(jobsTable.postedDate), desc(jobsTable.createdAt)];
  }
}

export const jobsRepository = {
  /**
   * Company ids whose name matches the search text. One indexless scan of a
   * small table, run only when there is a search term — see `searchCondition`
   * for why this is a separate round trip rather than a subquery.
   */
  async companyIdsMatchingName(search: string): Promise<string[]> {
    const rows = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(ilike(companiesTable.name, `%${search}%`));
    return rows.map((r) => r.id);
  },

  async findAll(
    filters: JobFilters,
    pagination: PaginationParams,
    sort: JobSort = "newest",
  ) {
    const search = filters.search?.trim();
    const resolved: JobFilters = search
      ? {
          ...filters,
          searchCompanyIds: await this.companyIdsMatchingName(search),
        }
      : filters;
    const where = buildConditions(resolved);
    const offset = (pagination.page - 1) * pagination.limit;

    const [rows, countResult] = await Promise.all([
      buildJobSelect()
        .where(where)
        .orderBy(...orderBy(sort))
        .limit(pagination.limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(jobsTable)
        .innerJoin(companiesTable, eq(jobsTable.companyId, companiesTable.id))
        .where(where),
    ]);

    return buildPaginatedResult(
      rows as JobWithCompany[],
      Number(countResult[0].value),
      pagination,
    );
  },

  async findById(id: string): Promise<JobWithCompany | null> {
    const [row] = await buildJobSelect().where(eq(jobsTable.id, id));
    return (row as JobWithCompany) ?? null;
  },

  async findClosingSoon(days: number): Promise<JobWithCompany[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const rows = await buildJobSelect()
      .where(
        and(
          eq(jobsTable.status, "active"),
          lte(jobsTable.deadline, cutoff),
          sql`${jobsTable.deadline} >= NOW()`,
        ),
      )
      .orderBy(asc(jobsTable.deadline));

    return rows as JobWithCompany[];
  },

  async countActive(): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(jobsTable)
      .where(eq(jobsTable.status, "active"));
    return Number(value);
  },

  async countClosingSoon(days: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    const [{ value }] = await db
      .select({ value: count() })
      .from(jobsTable)
      .where(
        and(
          eq(jobsTable.status, "active"),
          lte(jobsTable.deadline, cutoff),
          sql`${jobsTable.deadline} >= NOW()`,
        ),
      );
    return Number(value);
  },

  async create(data: InsertJob): Promise<JobWithCompany> {
    const [row] = await db.insert(jobsTable).values(data).returning();
    const job = await this.findById(row.id);
    return job!;
  },

  async update(
    id: string,
    data: Partial<InsertJob>,
  ): Promise<JobWithCompany | null> {
    await db
      .update(jobsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(jobsTable.id, id));
    return this.findById(id);
  },

  async softDelete(id: string): Promise<JobWithCompany | null> {
    await db
      .update(jobsTable)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(jobsTable.id, id));
    return this.findById(id);
  },
};
