/**
 * Staleness sweeps
 * ─────────────────
 * Nothing in the ingestion path ever closed a job before this module existed:
 * `deduplication.ts` only inserts and updates, and `normalizer.ts` hardcodes
 * `status: "active"`. The live table was 2,105 active out of 2,105 total, which
 * for the one user this app serves means mornings spent clicking through to
 * expired postings.
 *
 * Three sweeps, each with a different notion of "dead":
 *
 *   closeUnseenJobs()            ATS providers return an authoritative, complete
 *                                listing per company. A job that was in yesterday's
 *                                listing and is absent from today's is closed.
 *
 *   closeStaleAggregatorJobs()   RemoteOK / Remotive / Adzuna / JSearch return
 *                                paged, query-shaped, incomplete results. Absence
 *                                proves nothing there, so those platforms fall back
 *                                to an age cutoff (SYNC_MAX_AGE_DAYS).
 *
 *   closeExpiredDeadlineJobs()   Any platform: the posting stated a deadline and it
 *                                has passed.
 *
 * THE GUARD
 * ──────────
 * `closeUnseenJobs` refuses to run unless the provider actually returned jobs AND
 * at least one of them was persisted. A provider that 500s, rate-limits, changes
 * its response shape, or returns `[]` must never be read as "this company has no
 * open roles" — that single misreading would close a company's entire catalogue,
 * and the rows are not recoverable from the upstream API on the next run. Every
 * skip is logged at INFO with the reason, because a sweep that silently does
 * nothing is as hard to diagnose as one that wrongly does everything.
 */

import { and, eq, inArray, isNotNull, lt, or, isNull, sql } from "drizzle-orm";
import { db, jobsTable } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * Platforms whose listings are NOT authoritative — they answer search queries
 * rather than enumerate one employer's open roles, so "absent from this run"
 * never implies "closed". These are excluded from the last-seen sweep and
 * handled by the age fallback instead.
 */
export const AGGREGATOR_PLATFORMS = [
  "remoteok",
  "remotive",
  "adzuna",
  "jsearch",
] as const;

const AGGREGATOR_SET = new Set<string>(AGGREGATOR_PLATFORMS);

export function isAggregatorPlatform(platform: string): boolean {
  return AGGREGATOR_SET.has(platform.toLowerCase());
}

export const DEFAULT_MAX_AGE_DAYS = 45;

/** Rows per UPDATE. The free-tier instance has 512 MB — never build one giant statement. */
const CLOSE_BATCH_SIZE = 500;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * SYNC_MAX_AGE_DAYS, defaulting to 45. A missing, unparseable or non-positive
 * value falls back to the default rather than throwing: this runs inside the
 * scheduler, and a typo in an env var must not take ingestion down.
 */
export function getMaxAgeDays(): number {
  const raw = process.env["SYNC_MAX_AGE_DAYS"];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) {
    if (raw !== undefined && raw !== "") {
      logger.warn(
        { SYNC_MAX_AGE_DAYS: raw, fallback: DEFAULT_MAX_AGE_DAYS },
        "SYNC_MAX_AGE_DAYS is not a positive integer — using the default",
      );
    }
    return DEFAULT_MAX_AGE_DAYS;
  }
  return parsed;
}

export type SweepSkipReason =
  | "empty-fetch"
  | "nothing-persisted"
  | "aggregator-platform"
  | "no-companies";

export interface SweepResult {
  /** How many rows this sweep flipped to `closed`. */
  closed: number;
  /** Ids of the closed rows, in the order the sweep found them. */
  closedIds: string[];
  /** Set when the sweep deliberately did nothing; `null` when it ran. */
  skipped: SweepSkipReason | null;
}

function noop(skipped: SweepSkipReason): SweepResult {
  return { closed: 0, closedIds: [], skipped };
}

/**
 * Flip the given ids to `closed`, in batches. Only ever touches rows that are
 * still `active`, which is what makes every sweep idempotent: a second pass
 * re-selects nothing because the first pass already moved the rows out of the
 * `active` set.
 */
async function closeJobsByIds(ids: string[]): Promise<string[]> {
  const closed: string[] = [];
  for (let i = 0; i < ids.length; i += CLOSE_BATCH_SIZE) {
    const batch = ids.slice(i, i + CLOSE_BATCH_SIZE);
    const rows = await db
      .update(jobsTable)
      .set({ status: "closed", updatedAt: new Date() })
      .where(and(inArray(jobsTable.id, batch), eq(jobsTable.status, "active")))
      .returning({ id: jobsTable.id });
    closed.push(...rows.map((r) => r.id));
  }
  return closed;
}

export interface CloseUnseenJobsArgs {
  /** `jobs.source_platform`, e.g. "greenhouse". */
  sourcePlatform: string;
  /** Companies touched by this run — one entry for a single-company ATS config. */
  companyIds: string[];
  /**
   * Start of the run. Rows last seen strictly before this (or never seen at all)
   * were not in the listing this run just processed.
   */
  runStartedAt: Date;
  /** Raw jobs the provider returned. Zero here disarms the sweep entirely. */
  fetchedCount: number;
  /** Jobs actually written/stamped this run. Zero here also disarms the sweep. */
  persistedCount: number;
  /** Only for log lines. */
  companySlug?: string;
}

/**
 * Close active jobs for this platform+company that the provider did not list in
 * the run that started at `runStartedAt`.
 *
 * NULL `last_seen_at` counts as unseen. Every row predating this feature is NULL,
 * so excluding it would make the sweep a permanent no-op on the live table; and a
 * job that IS still listed cannot be NULL by the time the sweep runs, because the
 * same run stamped it on insert, update or skip.
 */
export async function closeUnseenJobs(
  args: CloseUnseenJobsArgs,
): Promise<SweepResult> {
  const {
    sourcePlatform,
    companyIds,
    runStartedAt,
    fetchedCount,
    persistedCount,
    companySlug,
  } = args;

  const logContext = {
    sweep: "last-seen",
    platform: sourcePlatform,
    companySlug,
    companyCount: companyIds.length,
    fetchedCount,
    persistedCount,
  };

  // ── The guard. Order matters only for which reason gets logged. ────────────
  if (isAggregatorPlatform(sourcePlatform)) {
    logger.info(
      { ...logContext, reason: "aggregator-platform" },
      "Last-seen sweep skipped — aggregator listings are not authoritative, age fallback handles this platform",
    );
    return noop("aggregator-platform");
  }

  if (fetchedCount <= 0) {
    logger.info(
      { ...logContext, reason: "empty-fetch" },
      "Last-seen sweep skipped — provider returned zero jobs, refusing to close this company's catalogue",
    );
    return noop("empty-fetch");
  }

  if (persistedCount <= 0) {
    logger.info(
      { ...logContext, reason: "nothing-persisted" },
      "Last-seen sweep skipped — provider returned jobs but none were persisted, so nothing was stamped as seen",
    );
    return noop("nothing-persisted");
  }

  const uniqueCompanyIds = [...new Set(companyIds)];
  if (uniqueCompanyIds.length === 0) {
    logger.info(
      { ...logContext, reason: "no-companies" },
      "Last-seen sweep skipped — no company could be resolved from this run",
    );
    return noop("no-companies");
  }

  const candidates = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.status, "active"),
        eq(jobsTable.sourcePlatform, sourcePlatform),
        inArray(jobsTable.companyId, uniqueCompanyIds),
        or(
          isNull(jobsTable.lastSeenAt),
          lt(jobsTable.lastSeenAt, runStartedAt),
        ),
      ),
    );

  // Logged BEFORE the write, with the count it is about to close: if this ever
  // misfires in production the log has to say why, not just that it happened.
  logger.info(
    { ...logContext, toClose: candidates.length, runStartedAt },
    `Last-seen sweep closing ${candidates.length} job(s) for ${companySlug ?? "?"} on ${sourcePlatform}`,
  );

  if (candidates.length === 0) {
    return { closed: 0, closedIds: [], skipped: null };
  }

  const closedIds = await closeJobsByIds(candidates.map((c) => c.id));
  return { closed: closedIds.length, closedIds, skipped: null };
}

export interface CloseStaleAggregatorJobsArgs {
  /** Defaults to SYNC_MAX_AGE_DAYS. */
  maxAgeDays?: number;
  /** Injectable for tests. */
  now?: Date;
}

/**
 * Age fallback for the aggregator platforms. Rows with no `posted_date` are left
 * alone — an unknown date is not evidence of staleness.
 */
export async function closeStaleAggregatorJobs(
  args: CloseStaleAggregatorJobsArgs = {},
): Promise<SweepResult> {
  const maxAgeDays = args.maxAgeDays ?? getMaxAgeDays();
  const now = args.now ?? new Date();
  const cutoff = new Date(now.getTime() - maxAgeDays * MS_PER_DAY);

  const candidates = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.status, "active"),
        inArray(jobsTable.sourcePlatform, [...AGGREGATOR_PLATFORMS]),
        isNotNull(jobsTable.postedDate),
        lt(jobsTable.postedDate, cutoff),
      ),
    );

  logger.info(
    {
      sweep: "aggregator-age",
      platforms: AGGREGATOR_PLATFORMS,
      maxAgeDays,
      cutoff,
      toClose: candidates.length,
    },
    `Aggregator age sweep closing ${candidates.length} job(s) posted before ${cutoff.toISOString()}`,
  );

  if (candidates.length === 0) {
    return { closed: 0, closedIds: [], skipped: null };
  }

  const closedIds = await closeJobsByIds(candidates.map((c) => c.id));
  return { closed: closedIds.length, closedIds, skipped: null };
}

/** Close any active job, on any platform, whose stated deadline has passed. */
export async function closeExpiredDeadlineJobs(
  args: { now?: Date } = {},
): Promise<SweepResult> {
  const now = args.now ?? new Date();

  const candidates = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.status, "active"),
        isNotNull(jobsTable.deadline),
        lt(jobsTable.deadline, now),
      ),
    );

  logger.info(
    { sweep: "expired-deadline", now, toClose: candidates.length },
    `Expired-deadline sweep closing ${candidates.length} job(s)`,
  );

  if (candidates.length === 0) {
    return { closed: 0, closedIds: [], skipped: null };
  }

  const closedIds = await closeJobsByIds(candidates.map((c) => c.id));
  return { closed: closedIds.length, closedIds, skipped: null };
}

/** A row of the backfill's platform breakdown. `platform` is null for rows that carry none. */
export interface PlatformCount {
  platform: string | null;
  count: number;
}

export interface AgeCutoffSurvey {
  cutoff: Date;
  /** Aggregator rows past the cutoff — the only ones age alone may close. */
  closable: PlatformCount[];
  closableCount: number;
  /** Rows past the cutoff on every other platform. Left alone on purpose. */
  excluded: PlatformCount[];
  excludedCount: number;
}

/**
 * What does the age cutoff actually see, broken down by platform?
 *
 * WHY THE BREAKDOWN, AND NOT JUST A COUNT
 * ────────────────────────────────────────
 * The backfill used to report one number for every platform at once, and on the
 * live table all 84 of those rows turned out to be Lever (58) and Greenhouse
 * (26) — ATS postings still listed upstream, which the age rule has no business
 * closing. A single total hid that; the split makes it impossible to miss, and
 * the caller prints both halves so the exclusion is visible rather than implied.
 */
export async function surveyJobsOlderThan(
  days: number,
  now: Date = new Date(),
): Promise<AgeCutoffSurvey> {
  const cutoff = new Date(now.getTime() - days * MS_PER_DAY);

  const rows = await db
    .select({
      platform: jobsTable.sourcePlatform,
      count: sql<number>`count(*)::int`,
    })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.status, "active"),
        isNotNull(jobsTable.postedDate),
        lt(jobsTable.postedDate, cutoff),
      ),
    )
    .groupBy(jobsTable.sourcePlatform);

  const byCountDesc = (a: PlatformCount, b: PlatformCount) => b.count - a.count;
  const closable = rows
    .filter((r) => r.platform !== null && isAggregatorPlatform(r.platform))
    .sort(byCountDesc);
  const excluded = rows
    .filter((r) => r.platform === null || !isAggregatorPlatform(r.platform))
    .sort(byCountDesc);
  const total = (list: PlatformCount[]) =>
    list.reduce((sum, r) => sum + r.count, 0);

  return {
    cutoff,
    closable,
    closableCount: total(closable),
    excluded,
    excludedCount: total(excluded),
  };
}

/**
 * Close aggregator jobs older than `days`, paging so the backfill never loads
 * the whole table into memory.
 *
 * SCOPED TO AGGREGATORS, DELIBERATELY
 * ────────────────────────────────────
 * Age is only evidence of death where absence is not. RemoteOK, Remotive,
 * Adzuna and JSearch answer search queries, so a row that has aged out of their
 * results can never be confirmed closed any other way. An ATS board is the
 * opposite: Greenhouse and Lever enumerate an employer's open roles completely,
 * and a role posted eight months ago and still listed today is still open —
 * companies genuinely leave graduate pipelines up for a year. `closeUnseenJobs`
 * is the authority for those platforms, and it is the only thing allowed to
 * close them.
 *
 * This mirrors the scoping `closeStaleAggregatorJobs` already applies to the
 * scheduled sweep; the backfill is the same rule applied once to the backlog,
 * so it has to carry the same restriction.
 */
export async function closeAggregatorJobsOlderThan(
  days: number,
  now: Date = new Date(),
): Promise<{ cutoff: Date; closed: number }> {
  const cutoff = new Date(now.getTime() - days * MS_PER_DAY);
  let closed = 0;

  for (;;) {
    const batch = await db
      .select({ id: jobsTable.id })
      .from(jobsTable)
      .where(
        and(
          eq(jobsTable.status, "active"),
          inArray(jobsTable.sourcePlatform, [...AGGREGATOR_PLATFORMS]),
          isNotNull(jobsTable.postedDate),
          lt(jobsTable.postedDate, cutoff),
        ),
      )
      .limit(CLOSE_BATCH_SIZE);

    if (batch.length === 0) break;

    const ids = await closeJobsByIds(batch.map((b) => b.id));
    closed += ids.length;

    // Defensive: if a batch somehow closed nothing the predicate and the write
    // disagree, and looping again would spin forever.
    if (ids.length === 0) break;
  }

  return { cutoff, closed };
}
