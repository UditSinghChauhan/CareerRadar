/**
 * Notification generation (Phase 6.2)
 * ───────────────────────────────────
 * Runs after every POST /api/sync/cron pass, once the sync and the relevance
 * backfill have finished. Writes two kinds of row:
 *
 *   deadline_reminder — a job in the user's tracker closes inside 72h or 24h
 *   new_job           — a job that arrived since the last pass matches one of
 *                       the user's saved searches and scores above a threshold
 *
 * DEGRADES SILENTLY, ALWAYS. Every failure in here is caught and logged, and
 * `generateNotifications()` resolves rather than rejecting. A notification is a
 * convenience; a sync that reports itself failed because a bell icon has
 * nothing to show is not. The bell renders an empty popover when no rows exist,
 * so a generator that never ran is indistinguishable from a quiet week.
 *
 * IDEMPOTENT BY CONSTRUCTION. The cron runs every six hours, so the same job
 * sits inside the same deadline window for up to twelve consecutive passes.
 * Every generated row carries a `dedupeKey` and is inserted with
 * `onConflictDoNothing` against `notifications_clerk_dedupe_unique`, so the
 * second and later passes write nothing. That is a database guarantee, not a
 * read-then-write check, so two overlapping runs cannot both win.
 *
 * MEMORY. 512 MB and 0.1 CPU. The deadline query is bounded by "has a deadline
 * inside 72 hours AND is in someone's tracker", which is tens of rows; the
 * new-job scan is bounded per saved search by NEW_JOB_MAX_PER_SEARCH. Nothing
 * here loads a table.
 */

import { and, eq, gt, isNotNull, lte, notInArray } from "drizzle-orm";
import {
  db,
  applicationsTable,
  bookmarksTable,
  companiesTable,
  jobsTable,
  type Application,
  type InsertNotification,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { notificationsRepository } from "../repositories/notifications.repository";
import { savedSearchesRepository } from "../repositories/savedSearches.repository";
import { jobsService } from "../services/jobs.service";
import { TERMINAL_STATUSES } from "../repositories/applications.repository";
import {
  DEADLINE_BUCKETS,
  bucketFor,
  deadlineDedupeKey,
  newJobDedupeKey,
} from "./deadline-buckets";

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Relevance score a brand-new job must beat to be announced against a saved
 * search. UPGRADE.md §6.2 says "above a threshold" without naming one.
 *
 * MEASURED on the production table, 2026-09-16, 4,371 active rows, all scored.
 * The distribution is bimodal, not a bell curve: the median is 0, p75 is 85 and
 * p90 is 100. Roughly 41% of active rows score 70 or better, and almost all of
 * those sit in the 85-100 cluster. So 70 is a floor just below that cluster —
 * low enough to admit the 70-84 band on a quiet day, high enough to exclude the
 * large mass of zeros.
 *
 * It is NOT what bounds the volume. Daily arrivals over the preceding ten days
 * ranged from 60 to 1,666, of which 28 to 787 scored 70+, so on a busy day any
 * threshold in this range still matches far more than a bell can show. What
 * actually bounds it is NEW_JOB_MAX_PER_SEARCH below, applied to a
 * relevance-sorted query — the cap keeps the best N, and moving the threshold
 * between 70 and 85 changes almost nothing except on the quiet days. Raise the
 * threshold to make quiet days quieter; lower the cap to make busy days
 * quieter.
 *
 * Set NOTIFY_NEW_JOB_MIN_SCORE to move it; set it to 101 to turn new-job alerts
 * off entirely without touching the deadline reminders.
 */
const DEFAULT_NEW_JOB_MIN_SCORE = 70;

/**
 * How far back a "new" job may have been created. The cron runs every six
 * hours, but a free-tier instance that has been asleep, or a workflow run that
 * was skipped, can leave a much larger gap — and the first ever run would
 * otherwise announce the entire table. 48 hours is generous against the cadence
 * and still bounded.
 */
const DEFAULT_NEW_JOB_LOOKBACK_HOURS = 48;

/**
 * Per saved search, per pass. This is the real volume control — see the note on
 * the threshold above.
 *
 * Measured: on 2026-09-14 the aggregators delivered 1,666 new rows, 787 of them
 * scoring 70+. Without a cap that is one day's postings arriving as 787 unread
 * notifications, which is the same as no notifications at all. The query is
 * sorted by relevance, so the ten that survive are the ten best.
 *
 * Four cron passes a day makes the ceiling 40 alerts per saved search per day,
 * and only on a day like that one; the dedupe key means each job is announced
 * at most once per search ever, so the steady state is the genuine arrival rate.
 */
const DEFAULT_NEW_JOB_MAX_PER_SEARCH = 10;

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export interface GenerationReport {
  deadlineReminders: number;
  newJobAlerts: number;
  durationMs: number;
  /** Present when something failed; the pass is still reported, not thrown. */
  error?: string;
}

// ─── Deadline reminders ───────────────────────────────────────────────────────

/**
 * Statuses that suppress a deadline reminder.
 *
 * TWO DIFFERENT QUESTIONS, TWO DIFFERENT LISTS. `TERMINAL_STATUSES` answers
 * "is there anything left to chase here?", which is what the Awaiting
 * follow-up filter needs. This answers "would a reminder that the POSTING
 * closes soon be useful?", which is not the same question — and the gap
 * between them is exactly `offered`.
 *
 * An unanswered offer badly needs following up, so it belongs in the filter.
 * But the thing it needs following up ON is the offer's accept-by date, which
 * is not the job posting's closing date and is not a column this table has.
 * Telling someone that a posting they already hold an offer from is about to
 * close is noise at best.
 *
 * Derived from TERMINAL_STATUSES rather than retyped, so a status that becomes
 * terminal later stops producing reminders automatically. The extra entries
 * below are the deliberate difference, and adding one is a decision about
 * reminders alone — it cannot reach the follow-up filter from here.
 */
export const REMINDER_SUPPRESSED_STATUSES = [
  ...TERMINAL_STATUSES,
  "offered",
] as const satisfies readonly Application["status"][];

interface DeadlineCandidate {
  clerkId: string;
  jobId: string;
  title: string;
  companyName: string;
  deadline: Date | null;
  /** True when the user has not applied yet — a saved row or a bare bookmark. */
  notYetApplied: boolean;
}

/**
 * Jobs in somebody's tracker whose deadline falls inside the widest bucket.
 *
 * "In somebody's tracker" is both halves of §6.2's "saved or applied": an
 * application row whose status still makes a posting deadline meaningful, and a
 * bookmark. See REMINDER_SUPPRESSED_STATUSES for which statuses those are and
 * why the list is not simply TERMINAL_STATUSES.
 */
async function findDeadlineCandidates(
  now: Date,
  horizon: Date,
): Promise<DeadlineCandidate[]> {
  const deadlineWindow = and(
    isNotNull(jobsTable.deadline),
    gt(jobsTable.deadline, now),
    lte(jobsTable.deadline, horizon),
    eq(jobsTable.status, "active"),
  );

  const [fromApplications, fromBookmarks] = await Promise.all([
    db
      .select({
        clerkId: applicationsTable.clerkId,
        jobId: jobsTable.id,
        title: jobsTable.title,
        companyName: companiesTable.name,
        deadline: jobsTable.deadline,
        status: applicationsTable.status,
      })
      .from(applicationsTable)
      .innerJoin(jobsTable, eq(applicationsTable.jobId, jobsTable.id))
      .innerJoin(companiesTable, eq(jobsTable.companyId, companiesTable.id))
      .where(
        and(
          notInArray(applicationsTable.status, [
            ...REMINDER_SUPPRESSED_STATUSES,
          ]),
          deadlineWindow,
        ),
      ),
    db
      .select({
        clerkId: bookmarksTable.clerkId,
        jobId: jobsTable.id,
        title: jobsTable.title,
        companyName: companiesTable.name,
        deadline: jobsTable.deadline,
      })
      .from(bookmarksTable)
      .innerJoin(jobsTable, eq(bookmarksTable.jobId, jobsTable.id))
      .innerJoin(companiesTable, eq(jobsTable.companyId, companiesTable.id))
      .where(deadlineWindow),
  ]);

  // A job can be both bookmarked and saved. Keyed by user+job so it is
  // announced once; the application row wins because it knows the status.
  const byUserJob = new Map<string, DeadlineCandidate>();
  for (const row of fromBookmarks) {
    byUserJob.set(`${row.clerkId}:${row.jobId}`, {
      ...row,
      notYetApplied: true,
    });
  }
  for (const row of fromApplications) {
    byUserJob.set(`${row.clerkId}:${row.jobId}`, {
      clerkId: row.clerkId,
      jobId: row.jobId,
      title: row.title,
      companyName: row.companyName,
      deadline: row.deadline,
      notYetApplied: row.status === "saved",
    });
  }
  return [...byUserJob.values()];
}

function deadlineRows(
  candidates: DeadlineCandidate[],
  now: Date,
): InsertNotification[] {
  const rows: InsertNotification[] = [];
  for (const candidate of candidates) {
    const bucket = bucketFor(candidate.deadline, now);
    if (!bucket) continue;
    rows.push({
      clerkId: candidate.clerkId,
      type: "deadline_reminder",
      title:
        bucket.id === "24h" ? "Closes within 24 hours" : "Closes within 3 days",
      message:
        `${candidate.title} at ${candidate.companyName} ${bucket.label}.` +
        (candidate.notYetApplied ? " You have not applied yet." : ""),
      relatedJobId: candidate.jobId,
      dedupeKey: deadlineDedupeKey(candidate.jobId, bucket.id),
      metadata: {
        bucket: bucket.id,
        deadline: candidate.deadline?.toISOString() ?? null,
      },
    });
  }
  return rows;
}

// ─── New-job alerts ───────────────────────────────────────────────────────────

async function newJobRows(now: Date): Promise<InsertNotification[]> {
  const minScore = intFromEnv(
    "NOTIFY_NEW_JOB_MIN_SCORE",
    DEFAULT_NEW_JOB_MIN_SCORE,
  );
  const lookbackHours = intFromEnv(
    "NOTIFY_NEW_JOB_LOOKBACK_HOURS",
    DEFAULT_NEW_JOB_LOOKBACK_HOURS,
  );
  const maxPerSearch = intFromEnv(
    "NOTIFY_NEW_JOB_MAX_PER_SEARCH",
    DEFAULT_NEW_JOB_MAX_PER_SEARCH,
  );

  // A score above the classifier's ceiling is the documented off switch.
  if (minScore > 100) return [];

  const searches = await savedSearchesRepository.findAllForGeneration();
  if (searches.length === 0) return [];

  const createdAfter = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  const rows: InsertNotification[] = [];

  for (const search of searches) {
    const saved = (search.filters ?? {}) as Record<string, unknown>;
    // The saved search's own filters, run through the SAME parser /api/jobs
    // uses, so "matches this saved search" means exactly what it means on the
    // Jobs page — a filter that works there works here, with no second
    // implementation to drift.
    //
    // The keys spread in are then overridden where this pass needs to differ:
    // the freshness bound and the score floor are what make it an ALERT rather
    // than a search, the sort and limit are what make the cap keep the best N,
    // and `status` is forced because a saved search must not be able to opt
    // into announcing closed postings.
    const page = await jobsService.list(
      {
        ...saved,
        createdAfter,
        minRelevanceScore: Math.max(
          minScore,
          Number(saved.minRelevanceScore) || 0,
        ),
        sort: "relevance",
        page: 1,
        limit: maxPerSearch,
        // A saved search cannot opt into closed postings for this purpose.
        status: "active",
      },
      { clerkId: search.clerkId },
    );

    for (const job of page.data) {
      rows.push({
        clerkId: search.clerkId,
        type: "new_job",
        title: `New match for "${search.name}"`,
        message: `${job.title} at ${job.company.name}${
          job.location ? ` · ${job.location}` : ""
        }`,
        relatedJobId: job.id,
        dedupeKey: newJobDedupeKey(search.id, job.id),
        metadata: {
          savedSearchId: search.id,
          savedSearchName: search.name,
          relevanceScore: job.relevanceScore,
        },
      });
    }
  }
  return rows;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Generate both kinds of notification. Never throws.
 *
 * `now` is injectable so the specs can place a deadline at a known offset
 * rather than racing the wall clock.
 */
export async function generateNotifications(
  now: Date = new Date(),
): Promise<GenerationReport> {
  const startedAt = Date.now();
  const report: GenerationReport = {
    deadlineReminders: 0,
    newJobAlerts: 0,
    durationMs: 0,
  };

  try {
    const widest = Math.max(...DEADLINE_BUCKETS.map((b) => b.hours));
    const horizon = new Date(now.getTime() + widest * 60 * 60 * 1000);

    const candidates = await findDeadlineCandidates(now, horizon);
    report.deadlineReminders = await notificationsRepository.createMany(
      deadlineRows(candidates, now),
    );

    report.newJobAlerts = await notificationsRepository.createMany(
      await newJobRows(now),
    );
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    logger.error(
      { err },
      "Notification generation failed — the sync itself is unaffected",
    );
  }

  report.durationMs = Date.now() - startedAt;
  return report;
}

/**
 * NO RETENTION SWEEP, deliberately. `related_job_id` is `ON DELETE SET NULL`,
 * so a purged job leaves its notification readable ("X at Y closes within 3
 * days") with a dead link rather than vanishing from the user's history. If
 * the table ever needs trimming that belongs in its own sweep, not here.
 */

/** Exported for the specs, which exercise each half in isolation. */
export const _generatorInternals = {
  findDeadlineCandidates,
  deadlineRows,
  newJobRows,
};
