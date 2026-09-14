/**
 * Relevance backfill (Phase 2.2) — the runner shared by the tsx script and
 * the authenticated admin route.
 *
 * RECOMPUTE-ALL, BY DESIGN
 * ────────────────────────
 * `classifyJob` is deterministic for a fixed clock, so this recomputes every
 * row on every run — the same shape as backfill-location.ts. There is no
 * "skip rows already classified": a rules change in classifier.ts reaches
 * old rows by running this again, and a half-finished run leaves nothing to
 * repair. It is also how the time-based modifiers (posted ≤ 7 days +10,
 * > 45 days −20) stay honest for rows the sync no longer touches: rerun it
 * and the scores move with the calendar.
 *
 * ONLY THE SIX RELEVANCE COLUMNS ARE WRITTEN. `title`, `eligibleBatch`,
 * `jobType`, `updatedAt` and everything else are untouched — this is a
 * derived-column refresh, not an edit. Unchanged rows are not rewritten, so
 * `classifiedAt` means "when these values were last computed and found
 * different", and a second run back-to-back updates nothing.
 *
 * MEMORY
 * ──────
 * Keyset pagination by primary key in batches of 500 — never `offset`, never
 * the whole table. The live instance has 512 MB and the table is past 3,700
 * rows. Descriptions are the heavy column; only one batch is resident.
 *
 * READS `is_india` / `is_remote` (Phase 2.0), NEVER `jobs.country`.
 */

import { asc, eq, gt, sql } from "drizzle-orm";
import { db, jobsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  classifyJob,
  RELEVANCE_TRACKS,
  toRelevanceColumns,
  type RelevanceTrack,
} from "./classifier";
import { resolveGraduationYear } from "./graduation-year";

export const BACKFILL_BATCH_SIZE = 500;

/** One row per track, exclusive, summing to the total. */
export type TrackCounts = Record<RelevanceTrack, number>;

export interface RankedTitle {
  id: string;
  title: string;
  company: string | null;
  track: RelevanceTrack;
  score: number;
  postedDate: string | null;
  sourcePlatform: string | null;
  signals: string[];
}

export interface BackfillRelevanceReport {
  /** Rows read (every row in the table, whatever its status). */
  scanned: number;
  /** Rows whose relevance columns actually changed as a result. */
  updated: number;
  /** The year the batch modifiers were scored against, or null if none. */
  graduationYear: number | null;
  /** Track distribution over ALL rows scanned. */
  tracks: TrackCounts;
  /** The same distribution restricted to `status = 'active'` — the feed the user sees. */
  activeTracks: TrackCounts;
  /** Active rows with is_fresher_eligible = true — what the default filter shows. */
  activeFresherEligible: number;
  /** Active rows a seniority/level/years marker ruled out. */
  activeSeniorityExcluded: number;
  /** Active rows the provider called 'internship' that the classifier did not, and vice versa. */
  activeJobTypeDisagreements: {
    /** job_type = 'internship' but track ≠ internship (the substring-bug rows). */
    providerInternshipNotTrack: number;
    /** track = internship but job_type ≠ 'internship' (title/description evidence the provider missed). */
    trackInternshipNotProvider: number;
  };
  /** Active fresher-eligible rows bucketed by score, 10 wide, for a glance at the spread. */
  activeScoreHistogram: Record<string, number>;
  /** The 20 highest-scoring active rows — the ranking the user sanity-checks. */
  topActiveTitles: RankedTitle[];
  batches: number;
  durationMs: number;
}

function emptyCounts(): TrackCounts {
  return Object.fromEntries(RELEVANCE_TRACKS.map((t) => [t, 0])) as TrackCounts;
}

type Row = {
  id: string;
  status: string;
  title: string;
  description: string | null;
  requirements: string | null;
  experienceMin: number | null;
  experienceMax: number | null;
  jobType: "internship" | "full_time";
  isIndia: boolean | null;
  isRemote: boolean;
  eligibleBatch: number[];
  deadline: Date | null;
  postedDate: Date | null;
  companyName: string | null;
  sourcePlatform: string | null;
  relevanceTrack: string | null;
  relevanceScore: number | null;
  isFresherEligible: boolean;
  seniorityExcluded: boolean;
  relevanceSignals: string[];
};

function sameSignals(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

function unchanged(
  row: Row,
  next: ReturnType<typeof toRelevanceColumns>,
): boolean {
  return (
    row.relevanceTrack === next.relevanceTrack &&
    row.relevanceScore === next.relevanceScore &&
    row.isFresherEligible === next.isFresherEligible &&
    row.seniorityExcluded === next.seniorityExcluded &&
    sameSignals(row.relevanceSignals, next.relevanceSignals)
  );
}

export interface BackfillRelevanceOptions {
  /** Report only — compute everything, write nothing. */
  dryRun?: boolean;
  /** Score against this year instead of the profile's. Tests and the script's --year. */
  graduationYear?: number | null;
  /** Injectable clock for the recency modifiers. */
  now?: Date;
  /** How many titles to rank in the report. */
  topN?: number;
  /** Called after each batch; the script uses it to print progress. */
  onBatch?: (progress: {
    batch: number;
    scanned: number;
    updated: number;
  }) => void;
}

export async function backfillRelevance(
  options: BackfillRelevanceOptions = {},
): Promise<BackfillRelevanceReport> {
  const started = Date.now();
  const now = options.now ?? new Date();
  const topN = options.topN ?? 20;
  const graduationYear =
    options.graduationYear !== undefined
      ? options.graduationYear
      : await resolveGraduationYear();

  const tracks = emptyCounts();
  const activeTracks = emptyCounts();
  const activeScoreHistogram: Record<string, number> = {};
  const top: RankedTitle[] = [];
  let activeFresherEligible = 0;
  let activeSeniorityExcluded = 0;
  let providerInternshipNotTrack = 0;
  let trackInternshipNotProvider = 0;
  let scanned = 0;
  let updated = 0;
  let batches = 0;
  let cursor: string | null = null;

  for (;;) {
    const rows: Row[] = await db
      .select({
        id: jobsTable.id,
        status: jobsTable.status,
        title: jobsTable.title,
        description: jobsTable.description,
        requirements: jobsTable.requirements,
        experienceMin: jobsTable.experienceMin,
        experienceMax: jobsTable.experienceMax,
        jobType: jobsTable.jobType,
        isIndia: jobsTable.isIndia,
        isRemote: jobsTable.isRemote,
        eligibleBatch: jobsTable.eligibleBatch,
        deadline: jobsTable.deadline,
        postedDate: jobsTable.postedDate,
        // A correlated subquery rather than a join keeps the keyset cursor on
        // jobs.id alone.
        companyName: sql<
          string | null
        >`(select name from companies where companies.id = ${jobsTable.companyId})`,
        sourcePlatform: jobsTable.sourcePlatform,
        relevanceTrack: jobsTable.relevanceTrack,
        relevanceScore: jobsTable.relevanceScore,
        isFresherEligible: jobsTable.isFresherEligible,
        seniorityExcluded: jobsTable.seniorityExcluded,
        relevanceSignals: jobsTable.relevanceSignals,
      })
      .from(jobsTable)
      .where(cursor ? gt(jobsTable.id, cursor) : undefined)
      .orderBy(asc(jobsTable.id))
      .limit(BACKFILL_BATCH_SIZE);

    if (rows.length === 0) break;
    batches += 1;

    for (const row of rows) {
      scanned += 1;
      const result = classifyJob({
        title: row.title,
        description: row.description,
        requirements: row.requirements,
        experienceMin: row.experienceMin,
        experienceMax: row.experienceMax,
        jobType: row.jobType,
        isIndia: row.isIndia,
        isRemote: row.isRemote,
        eligibleBatch: row.eligibleBatch,
        deadline: row.deadline,
        postedDate: row.postedDate,
        graduationYear,
        now,
      });
      const next = toRelevanceColumns(result, now);
      const active = row.status === "active";

      tracks[result.track] += 1;
      if (active) {
        activeTracks[result.track] += 1;
        if (result.isFresherEligible) {
          activeFresherEligible += 1;
          const bucket = `${Math.min(90, Math.floor(result.score / 10) * 10)}`;
          activeScoreHistogram[bucket] =
            (activeScoreHistogram[bucket] ?? 0) + 1;
        }
        if (result.seniorityExcluded) activeSeniorityExcluded += 1;
        if (row.jobType === "internship" && result.track !== "internship") {
          providerInternshipNotTrack += 1;
        }
        if (row.jobType !== "internship" && result.track === "internship") {
          trackInternshipNotProvider += 1;
        }
        if (result.score > 0) {
          insertRanked(top, topN, {
            id: row.id,
            title: row.title,
            company: row.companyName,
            track: result.track,
            score: result.score,
            postedDate: row.postedDate?.toISOString() ?? null,
            sourcePlatform: row.sourcePlatform,
            signals: result.signals,
          });
        }
      }

      if (unchanged(row, next)) continue;
      updated += 1;

      if (!options.dryRun) {
        // No `updatedAt` here on purpose — see the header.
        await db.update(jobsTable).set(next).where(eq(jobsTable.id, row.id));
      }
    }

    cursor = rows[rows.length - 1]!.id;
    options.onBatch?.({ batch: batches, scanned, updated });

    if (rows.length < BACKFILL_BATCH_SIZE) break;
  }

  const report: BackfillRelevanceReport = {
    scanned,
    updated,
    graduationYear,
    tracks,
    activeTracks,
    activeFresherEligible,
    activeSeniorityExcluded,
    activeJobTypeDisagreements: {
      providerInternshipNotTrack,
      trackInternshipNotProvider,
    },
    activeScoreHistogram: Object.fromEntries(
      Object.entries(activeScoreHistogram).sort(
        (a, b) => Number(a[0]) - Number(b[0]),
      ),
    ),
    topActiveTitles: top,
    batches,
    durationMs: Date.now() - started,
  };

  logger.info(
    {
      backfill: "relevance",
      dryRun: options.dryRun === true,
      scanned,
      updated,
      graduationYear,
      activeTracks,
      activeFresherEligible,
    },
    options.dryRun
      ? `Relevance backfill (dry run) — ${updated} of ${scanned} rows would change`
      : `Relevance backfill — ${updated} of ${scanned} rows updated`,
  );

  return report;
}

/**
 * The order the Jobs page shows: score desc, then newest first, then title
 * so the order is stable between runs. Mirrors ORDER BY in
 * jobs.repository.ts — the report must rank the way the feed does.
 */
function rankCompare(a: RankedTitle, b: RankedTitle): number {
  return (
    b.score - a.score ||
    (b.postedDate ?? "").localeCompare(a.postedDate ?? "") ||
    a.title.localeCompare(b.title)
  );
}

/**
 * Keep a bounded, sorted top-N without holding every row: insert in place,
 * drop the tail.
 */
function insertRanked(top: RankedTitle[], n: number, item: RankedTitle) {
  if (top.length === n && rankCompare(item, top[n - 1]!) >= 0) return;
  let i = top.length;
  while (i > 0 && rankCompare(top[i - 1]!, item) > 0) i -= 1;
  top.splice(i, 0, item);
  if (top.length > n) top.length = n;
}

/**
 * The track distribution of what is in the table right now, computed in SQL
 * from the stored columns rather than by re-classifying. This is what the
 * Jobs page filter actually sees; if it disagrees with a fresh backfill's
 * report, the columns are stale and the backfill needs re-running.
 */
export async function relevanceTrackCountsFromDb(): Promise<{
  active: TrackCounts & { unclassified: number };
  activeTotal: number;
  activeFresherEligible: number;
}> {
  const rows = await db
    .select({
      track: sql<string>`coalesce(${jobsTable.relevanceTrack}, 'unclassified')`,
      fresher: jobsTable.isFresherEligible,
      count: sql<number>`count(*)::int`,
    })
    .from(jobsTable)
    .where(eq(jobsTable.status, "active"))
    .groupBy(sql`1`, jobsTable.isFresherEligible);

  const active = { ...emptyCounts(), unclassified: 0 };
  let activeTotal = 0;
  let activeFresherEligible = 0;
  for (const r of rows) {
    if (r.track in active) active[r.track as keyof typeof active] += r.count;
    activeTotal += r.count;
    if (r.fresher) activeFresherEligible += r.count;
  }
  return { active, activeTotal, activeFresherEligible };
}
