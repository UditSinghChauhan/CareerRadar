/**
 * DeduplicationService
 * ─────────────────────
 * Decides whether a normalized job should be inserted, updated, or skipped.
 *
 * STRATEGY
 * ─────────
 * We use `sourcePlatform + sourceUrl` as the stable external identity of a
 * job posting. Both fields already exist on the jobs table — no schema
 * changes required.
 *
 * Insert  — sourceUrl not in DB for this provider → new posting.
 * Update  — sourceUrl exists but title, location, or deadline changed.
 * Skip    — sourceUrl exists and no tracked field changed.
 *
 * LAST-SEEN STAMPING
 * ───────────────────
 * Every decision above stamps `lastSeenAt`, including "skip". A skip means the
 * provider IS still listing that posting and simply hasn't changed it, which is
 * exactly the evidence the staleness sweep in `staleness.ts` needs. Treating a
 * skip as "not seen" would close every unchanged job on the next run.
 *
 * Skips are stamped with one batched UPDATE rather than a write per row, so a
 * steady-state run where nothing changed still costs a single statement.
 *
 * FUTURE IMPROVEMENTS
 * ────────────────────
 * - Add a content hash column to detect description-only updates.
 * - Batch DB lookups instead of per-job queries.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db, jobsTable, type InsertJob } from "@workspace/db";
import { logger } from "../lib/logger";
import type { DedupeDecision, DedupeAction } from "./types";

/** Fields we treat as "change triggers" for an update. */
const TRACKED_FIELDS = [
  "title",
  "location",
  "workMode",
  "deadline",
  "status",
] as const;
type TrackedField = (typeof TRACKED_FIELDS)[number];

/** Rows per lastSeenAt stamping UPDATE — the free-tier instance has 512 MB. */
const SEEN_STAMP_BATCH_SIZE = 500;

export interface UpsertResult {
  action: DedupeAction;
  id: string;
}

export interface UpsertBatchOptions {
  /**
   * Timestamp written to `lastSeenAt` for every row this batch touches.
   * The caller passes the run's start time so that "seen this run" is a single
   * instant, and the sweep's `lastSeenAt < runStartedAt` comparison cannot race
   * a long-running batch.
   */
  seenAt?: Date;
}

export class DeduplicationService {
  /**
   * Bulk-decide what to do with a batch of normalized jobs.
   * Returns parallel array of UpsertResult after performing inserts/updates.
   *
   * @param jobs — normalized jobs from a single provider+company run
   * @param options.seenAt — instant stamped onto every touched row's lastSeenAt
   */
  async upsertBatch(
    jobs: InsertJob[],
    options: UpsertBatchOptions = {},
  ): Promise<UpsertResult[]> {
    if (jobs.length === 0) return [];

    const seenAt = options.seenAt ?? new Date();

    // Collect all sourceUrls for a single DB query
    const sourceUrls = jobs
      .map((j) => j.sourceUrl)
      .filter((u): u is string => Boolean(u));

    const platform = jobs[0]?.sourcePlatform ?? "";

    // Fetch existing rows matching any of these sourceUrls + platform
    const existing = sourceUrls.length
      ? await db
          .select({
            id: jobsTable.id,
            sourceUrl: jobsTable.sourceUrl,
            title: jobsTable.title,
            location: jobsTable.location,
            workMode: jobsTable.workMode,
            deadline: jobsTable.deadline,
            status: jobsTable.status,
          })
          .from(jobsTable)
          .where(
            and(
              eq(jobsTable.sourcePlatform, platform),
              inArray(jobsTable.sourceUrl, sourceUrls),
            ),
          )
      : [];

    const existingByUrl = new Map(existing.map((row) => [row.sourceUrl, row]));

    const results: UpsertResult[] = [];
    /** Ids of unchanged rows, stamped together once the loop finishes. */
    const skippedIds: string[] = [];

    for (const job of jobs) {
      const existingRow = job.sourceUrl
        ? existingByUrl.get(job.sourceUrl)
        : undefined;

      if (!existingRow) {
        // INSERT
        const [inserted] = await db
          .insert(jobsTable)
          .values({ ...job, lastSeenAt: seenAt })
          .returning({ id: jobsTable.id });
        results.push({ action: "insert", id: inserted.id });
      } else {
        // Check for changes
        const changed = TRACKED_FIELDS.some((field) => {
          const newVal = job[field as keyof InsertJob];
          const oldVal = existingRow[field as TrackedField];

          if (field === "deadline") {
            const newDate =
              newVal instanceof Date
                ? newVal.toISOString()
                : String(newVal ?? "");
            const oldDate =
              oldVal instanceof Date
                ? (oldVal as Date).toISOString()
                : String(oldVal ?? "");
            return newDate !== oldDate;
          }
          return String(newVal ?? "") !== String(oldVal ?? "");
        });

        if (changed) {
          await db
            .update(jobsTable)
            .set({ ...job, lastSeenAt: seenAt, updatedAt: new Date() })
            .where(eq(jobsTable.id, existingRow.id));
          results.push({ action: "update", id: existingRow.id });
        } else {
          skippedIds.push(existingRow.id);
          results.push({ action: "skip", id: existingRow.id });
        }
      }
    }

    // One statement for the whole unchanged tail. `updatedAt` is deliberately
    // left alone: nothing about the posting changed, only our sighting of it.
    for (let i = 0; i < skippedIds.length; i += SEEN_STAMP_BATCH_SIZE) {
      const batch = skippedIds.slice(i, i + SEEN_STAMP_BATCH_SIZE);
      await db
        .update(jobsTable)
        .set({ lastSeenAt: seenAt })
        .where(inArray(jobsTable.id, batch));
    }

    return results;
  }
}

/** Singleton used by the scheduler. */
export const deduplicationService = new DeduplicationService();
