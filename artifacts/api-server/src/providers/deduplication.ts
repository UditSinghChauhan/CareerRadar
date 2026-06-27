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
 * FUTURE IMPROVEMENTS
 * ────────────────────
 * - Add a content hash column to detect description-only updates.
 * - Track a "last seen" timestamp per posting for stale-detection.
 * - Batch DB lookups instead of per-job queries.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db, jobsTable, type InsertJob } from "@workspace/db";
import { logger } from "../lib/logger";
import type { DedupeDecision, DedupeAction } from "./types";

/** Fields we treat as "change triggers" for an update. */
const TRACKED_FIELDS = ["title", "location", "workMode", "deadline", "status"] as const;
type TrackedField = (typeof TRACKED_FIELDS)[number];

export interface UpsertResult {
  action: DedupeAction;
  id: string;
}

export class DeduplicationService {
  /**
   * Bulk-decide what to do with a batch of normalized jobs.
   * Returns parallel array of UpsertResult after performing inserts/updates.
   *
   * @param jobs — normalized jobs from a single provider+company run
   */
  async upsertBatch(jobs: InsertJob[]): Promise<UpsertResult[]> {
    if (jobs.length === 0) return [];

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

    const existingByUrl = new Map(
      existing.map((row) => [row.sourceUrl, row]),
    );

    const results: UpsertResult[] = [];

    for (const job of jobs) {
      const existingRow = job.sourceUrl
        ? existingByUrl.get(job.sourceUrl)
        : undefined;

      if (!existingRow) {
        // INSERT
        const [inserted] = await db.insert(jobsTable).values(job).returning({ id: jobsTable.id });
        results.push({ action: "insert", id: inserted.id });
      } else {
        // Check for changes
        const changed = TRACKED_FIELDS.some((field) => {
          const newVal = job[field as keyof InsertJob];
          const oldVal = existingRow[field as TrackedField];

          if (field === "deadline") {
            const newDate = newVal instanceof Date ? newVal.toISOString() : String(newVal ?? "");
            const oldDate = oldVal instanceof Date ? (oldVal as Date).toISOString() : String(oldVal ?? "");
            return newDate !== oldDate;
          }
          return String(newVal ?? "") !== String(oldVal ?? "");
        });

        if (changed) {
          await db
            .update(jobsTable)
            .set({ ...job, updatedAt: new Date() })
            .where(eq(jobsTable.id, existingRow.id));
          results.push({ action: "update", id: existingRow.id });
        } else {
          results.push({ action: "skip", id: existingRow.id });
        }
      }
    }

    return results;
  }
}

/** Singleton used by the scheduler. */
export const deduplicationService = new DeduplicationService();
