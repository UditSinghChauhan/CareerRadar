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
  type InsertJob,
  type Job,
  type Company,
} from "@workspace/db";
import { type PaginationParams, buildPaginatedResult } from "../lib/pagination";
import { FEATURED_METROS } from "../relevance/location";
import type { RelevanceTrack } from "../relevance/classifier";
import { companyColumns, jobColumns } from "./columns";

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
 */
export type JobSort = "newest" | "relevance";

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

function buildConditions(filters: JobFilters) {
  const conditions = [];

  if (filters.search) {
    conditions.push(
      or(
        ilike(jobsTable.title, `%${filters.search}%`),
        ilike(companiesTable.name, `%${filters.search}%`),
      ),
    );
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

function orderBy(sort: JobSort | undefined) {
  if (sort === "relevance") {
    return [
      sql`${jobsTable.relevanceScore} DESC NULLS LAST`,
      desc(jobsTable.postedDate),
      desc(jobsTable.createdAt),
    ];
  }
  return [desc(jobsTable.postedDate), desc(jobsTable.createdAt)];
}

export const jobsRepository = {
  async findAll(
    filters: JobFilters,
    pagination: PaginationParams,
    sort: JobSort = "newest",
  ) {
    const where = buildConditions(filters);
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
