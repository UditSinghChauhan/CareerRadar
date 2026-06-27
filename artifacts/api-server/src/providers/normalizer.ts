/**
 * JobNormalizer
 * ─────────────
 * Converts a validated ProviderJob into a shape compatible with the DB
 * jobs table, resolving foreign keys (companyId, sourceId) from the DB.
 *
 * The normalizer does NOT write to the DB — it produces a plain object
 * that the persistence layer (deduplication + upsert) consumes.
 */

import { eq } from "drizzle-orm";
import { db, companiesTable, jobSourcesTable, type InsertJob } from "@workspace/db";
import { logger } from "../lib/logger";
import type { ProviderJob } from "./types";

export type NormalizedJob = InsertJob;

export class JobNormalizer {
  private companyCache = new Map<string, string>();
  private sourceCache = new Map<string, string>();

  /** Warm up caches to avoid repeated DB round-trips during a scheduler run. */
  async warmUp(): Promise<void> {
    const [companies, sources] = await Promise.all([
      db.select({ id: companiesTable.id, slug: companiesTable.slug }).from(companiesTable),
      db.select({ id: jobSourcesTable.id, name: jobSourcesTable.name }).from(jobSourcesTable),
    ]);

    companies.forEach((c) => this.companyCache.set(c.slug, c.id));
    sources.forEach((s) => this.sourceCache.set(s.name.toLowerCase(), s.id));

    logger.info(
      { companies: companies.length, sources: sources.length },
      "Normalizer cache warmed up",
    );
  }

  /**
   * Normalize a ProviderJob into an InsertJob.
   * Returns null if the company slug is unknown (job is skipped).
   */
  normalize(job: ProviderJob): NormalizedJob | null {
    const companyId = this.companyCache.get(job.companySlug);
    if (!companyId) {
      logger.warn(
        { companySlug: job.companySlug, provider: job.sourceProvider },
        "Skipping job — companySlug not found in DB. Add the company first.",
      );
      return null;
    }

    const sourceId =
      this.sourceCache.get(job.sourceProvider.toLowerCase()) ?? null;

    const workMode = job.workMode ?? "onsite";
    const jobType = job.jobType ?? "full_time";

    return {
      companyId,
      sourceId: sourceId ?? undefined,
      title: job.title,
      department: job.department,
      location: job.location,
      country: job.country,
      workMode,
      jobType,
      description: job.description,
      requirements: job.requirements,
      applyUrl: job.applyUrl,
      sourceUrl: job.sourceUrl,
      sourcePlatform: job.sourceProvider,
      postedDate: job.postedDate ?? new Date(),
      deadline: job.deadline,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      stipend: job.stipend,
      currency: job.currency ?? "INR",
      eligibleBatch: job.eligibleBatch ?? [],
      eligibleBranches: job.eligibleBranches ?? [],
      requiredSkills: job.requiredSkills ?? [],
      benefits: job.benefits ?? [],
      status: "active",
    };
  }
}

/** Singleton — shared across the scheduler run. */
export const jobNormalizer = new JobNormalizer();
