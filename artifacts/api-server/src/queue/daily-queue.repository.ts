/**
 * Today's Queue — the ranked read (Phase 3.1)
 * ────────────────────────────────────────────
 * `GET /api/dashboard/today` in one place: which rows are eligible, how
 * duplicates collapse, and in what order the survivors come back.
 *
 * TWO QUERIES, DELIBERATELY
 * ─────────────────────────
 * 1. Rank a NARROW projection of the eligible set — id, company, the dedupe
 *    key, the four components. ~1,500 rows of small scalars.
 * 2. Fetch the full joined rows for the ≤10 winners by id.
 *
 * Ranking and fetching in one statement would mean carrying `description`
 * (the heavy column, frequently several KB) through the window function for
 * every eligible row on a 512 MB instance. Two round trips against the same
 * connection cost less than one that materialises the table.
 *
 * DUPLICATE COLLAPSE
 * ──────────────────
 * The live table is full of the same advert ingested many times over. The
 * mechanism, measured on 2026-09-15: Adzuna's `source_url` carries a
 * per-response session token (`?se=…`), so `sourcePlatform + sourceUrl` — the
 * identity `providers/deduplication.ts` upserts on — is different on every
 * sync pass even though the ad id inside the URL is identical. Six rows of
 * "Web Developer — Sadbhav Futuretech Limited", six distinct source_urls, one
 * advert. Across the saturated band it is 620 rows for 483 real postings.
 *
 * This collapses them at RANK time, by `(company_id, normalised title)`,
 * keeping the highest-priority instance — which is what §"Duplicates" asks
 * for and is also the safe half of the fix: it changes no stored row, so it
 * cannot merge two postings that only look alike. `duplicateCount` comes back
 * with each row so the UI can say "6 identical listings collapsed" instead of
 * silently hiding five jobs. Repairing the ingest identity is a separate
 * change with a much larger blast radius and is not part of this phase.
 *
 * EXCLUSIONS
 * ──────────
 * `status = 'active'`, fresher-eligible, not already applied to (any
 * application row, whatever its status — "saved" means the user has seen it),
 * and not dismissed. Anti-joins are NOT EXISTS rather than NOT IN so a NULL
 * can never swallow the whole predicate.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  applicationsTable,
  bookmarksTable,
  companiesTable,
  jobDismissalsTable,
  jobsTable,
  type Company,
  type Job,
} from "@workspace/db";
import { companyColumns, jobColumns } from "../repositories/columns";
import {
  explainPriority,
  normalizedTitleSql,
  priorityComponentsSql,
  priorityContributions,
  priorityFromComponents,
  tieBreakSql,
  type PriorityComponents,
} from "./priority";

export type JobWithCompany = Job & { company: Company };

export interface QueueItem {
  job: JobWithCompany;
  /** The weighted total, 0–100. */
  priority: number;
  /** Each component's raw 0–100 value, before its weight. */
  components: PriorityComponents;
  /** Each component's weighted contribution to `priority`. */
  contributions: PriorityComponents;
  /** How many rows collapsed into this one by (company, normalised title). */
  duplicateCount: number;
  /** One plain-language line per component, in weight order. */
  reasons: string[];
}

export interface DailyQueueOptions {
  clerkId: string;
  /** From `profiles.id`. Null when the user has no profile row yet. */
  profileId: string | null;
  limit: number;
  now: Date;
  /**
   * The day whose rotation this request belongs to, YYYY-MM-DD in the user's
   * timezone — from `dailyQueueDay()`. Seeds the shuffle that breaks exact
   * priority ties, so a tied block rotates between days and is stable within
   * one. See the tie-problem section in priority.ts for the measurement that
   * made this necessary.
   */
  queueDay: string;
}

export interface DailyQueueResult {
  items: QueueItem[];
  /** Rows that passed every exclusion, before duplicate collapse. */
  eligibleCount: number;
  /** Distinct (company, normalised title) groups among those rows. */
  distinctCount: number;
  /** Milliseconds spent in the two queries. */
  queryMs: number;
}

/** Companies the user has bookmarked a job from — §3.1's "dream list". */
export async function dreamCompanyIds(clerkId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ companyId: jobsTable.companyId })
    .from(bookmarksTable)
    .innerJoin(jobsTable, eq(bookmarksTable.jobId, jobsTable.id))
    .where(eq(bookmarksTable.clerkId, clerkId));
  return rows.map((r) => r.companyId);
}

interface RankedRow {
  id: string;
  companyId: string;
  title: string;
  deadline: Date | null;
  postedDate: Date | null;
  relevanceScore: number;
  deadlineUrgency: number;
  freshness: number;
  dreamCompanyBoost: number;
  priority: number;
  duplicateCount: number;
}

/**
 * The ranking pass. Exported so `EXPLAIN ANALYZE` can be run against the
 * exact statement the endpoint issues, rather than a hand-typed lookalike.
 */
export function rankedQuery(options: DailyQueueOptions, dreamIds: string[]) {
  const components = priorityComponentsSql({
    relevanceScore: sql`${jobsTable.relevanceScore}`,
    deadline: sql`${jobsTable.deadline}`,
    postedDate: sql`${jobsTable.postedDate}`,
    companyId: sql`${jobsTable.companyId}`,
    dreamCompanyIds: dreamIds,
    now: options.now,
  });

  const dedupeKey = normalizedTitleSql(sql`${jobsTable.title}`);
  // Breaks exact priority ties only — see priority.ts. It sits between
  // `priority DESC` and the original `posted_date DESC, id`, so it can never
  // reorder two rows that differ in priority.
  const tieKey = tieBreakSql(sql`${jobsTable.id}`, options.queueDay);

  const eligible = db
    .select({
      id: jobsTable.id,
      companyId: jobsTable.companyId,
      title: jobsTable.title,
      deadline: jobsTable.deadline,
      postedDate: jobsTable.postedDate,
      dedupeKey: dedupeKey.as("dedupe_key"),
      tieKey: tieKey.as("tie_key"),
      relevanceScore: components.relevanceScore.as("c_relevance"),
      deadlineUrgency: components.deadlineUrgency.as("c_deadline"),
      freshness: components.freshness.as("c_freshness"),
      dreamCompanyBoost: components.dreamCompanyBoost.as("c_dream"),
      priority: components.priority.as("priority"),
    })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.status, "active"),
        eq(jobsTable.isFresherEligible, true),
        // Already applied to (or saved) — the queue assigns work, and this is
        // work already started.
        sql`not exists (
          select 1 from ${applicationsTable}
          where ${applicationsTable.jobId} = ${jobsTable.id}
            and ${applicationsTable.clerkId} = ${options.clerkId}
        )`,
        // Dismissed. Skipped entirely when the user has no profile row yet —
        // they cannot have dismissed anything.
        options.profileId
          ? sql`not exists (
              select 1 from ${jobDismissalsTable}
              where ${jobDismissalsTable.jobId} = ${jobsTable.id}
                and ${jobDismissalsTable.profileId} = ${options.profileId}
            )`
          : undefined,
      ),
    )
    .as("eligible");

  // Highest priority wins the group; posted date then id break ties so the
  // representative of a duplicate cluster is stable between requests.
  const ranked = db
    .select({
      id: eligible.id,
      companyId: eligible.companyId,
      title: eligible.title,
      deadline: eligible.deadline,
      postedDate: eligible.postedDate,
      tieKey: eligible.tieKey,
      relevanceScore: eligible.relevanceScore,
      deadlineUrgency: eligible.deadlineUrgency,
      freshness: eligible.freshness,
      dreamCompanyBoost: eligible.dreamCompanyBoost,
      priority: eligible.priority,
      dupRank: sql<number>`row_number() over (
        partition by ${eligible.companyId}, ${eligible.dedupeKey}
        order by ${eligible.priority} desc, ${eligible.postedDate} desc nulls last, ${eligible.id}
      )`.as("dup_rank"),
      duplicateCount: sql<number>`count(*) over (
        partition by ${eligible.companyId}, ${eligible.dedupeKey}
      )::int`.as("duplicate_count"),
      eligibleCount: sql<number>`count(*) over ()::int`.as("eligible_count"),
    })
    .from(eligible)
    .as("ranked");

  return db
    .select({
      id: ranked.id,
      companyId: ranked.companyId,
      title: ranked.title,
      deadline: ranked.deadline,
      postedDate: ranked.postedDate,
      tieKey: ranked.tieKey,
      relevanceScore: ranked.relevanceScore,
      deadlineUrgency: ranked.deadlineUrgency,
      freshness: ranked.freshness,
      dreamCompanyBoost: ranked.dreamCompanyBoost,
      priority: ranked.priority,
      duplicateCount: ranked.duplicateCount,
      eligibleCount: ranked.eligibleCount,
      distinctCount: sql<number>`count(*) over ()::int`.as("distinct_count"),
    })
    .from(ranked)
    .where(eq(ranked.dupRank, 1))
    .orderBy(
      sql`${ranked.priority} desc`,
      // The day-seeded rotation. Only reachable for rows whose priority is
      // byte-identical, so the spec's ordering is untouched.
      sql`${ranked.tieKey}`,
      sql`${ranked.postedDate} desc nulls last`,
      sql`${ranked.id}`,
    )
    .limit(options.limit);
}

export async function dailyQueue(
  options: DailyQueueOptions,
): Promise<DailyQueueResult> {
  const started = Date.now();
  const dreamIds = await dreamCompanyIds(options.clerkId);

  const rows = (await rankedQuery(options, dreamIds)) as Array<
    RankedRow & { eligibleCount: number; distinctCount: number }
  >;

  const jobs = await findJobsByIds(rows.map((r) => r.id));
  const queryMs = Date.now() - started;

  const items: QueueItem[] = [];
  for (const row of rows) {
    const job = jobs.get(row.id);
    // A job deleted between the two statements is simply not in the queue.
    if (!job) continue;

    const components: PriorityComponents = {
      relevanceScore: Number(row.relevanceScore),
      deadlineUrgency: Number(row.deadlineUrgency),
      freshness: Number(row.freshness),
      dreamCompanyBoost: Number(row.dreamCompanyBoost),
    };

    items.push({
      job,
      // Recomputed from the components rather than read off the SQL result.
      // Both come from the same weights in priority.ts, and asserting they
      // agree is what daily-queue.test.ts does; taking the TypeScript value
      // here means the number the UI shows and the reasons beside it were
      // produced by the same code path.
      priority: priorityFromComponents(components),
      components,
      contributions: priorityContributions(components),
      duplicateCount: Number(row.duplicateCount),
      reasons: explainPriority(components, {
        deadline: row.deadline,
        postedDate: row.postedDate,
        duplicateCount: Number(row.duplicateCount),
        now: options.now,
      }),
    });
  }

  return {
    items,
    eligibleCount: rows.length > 0 ? Number(rows[0]!.eligibleCount) : 0,
    distinctCount: rows.length > 0 ? Number(rows[0]!.distinctCount) : 0,
    queryMs,
  };
}

/** The full joined payload for the winners, in the shape /api/jobs returns. */
async function findJobsByIds(
  ids: string[],
): Promise<Map<string, JobWithCompany>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ ...jobColumns, company: companyColumns })
    .from(jobsTable)
    .innerJoin(companiesTable, eq(jobsTable.companyId, companiesTable.id))
    .where(inArray(jobsTable.id, ids));
  return new Map(
    (rows as JobWithCompany[]).map((row) => [row.id, row] as const),
  );
}
