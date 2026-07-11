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
  /** In-flight company creations, keyed by slug — collapses concurrent inserts for the same new company. */
  private pendingCompanyCreates = new Map<string, Promise<string | null>>();

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
   * Resolve a company slug to a DB id, auto-creating the company row when
   * it doesn't exist yet and a display name is available. Used by
   * multi-company aggregator providers (RemoteOK, Remotive, Adzuna,
   * JSearch) which pull jobs from employers not pre-seeded in the DB.
   * Concurrent lookups for the same new slug collapse onto one insert.
   */
  private async resolveCompanyId(slug: string, companyName?: string): Promise<string | null> {
    const cached = this.companyCache.get(slug);
    if (cached) return cached;

    if (!companyName) return null;

    const pending = this.pendingCompanyCreates.get(slug);
    if (pending) return pending;

    const creation = (async () => {
      try {
        const [inserted] = await db
          .insert(companiesTable)
          .values({ slug, name: companyName })
          .onConflictDoNothing({ target: companiesTable.slug })
          .returning({ id: companiesTable.id });

        if (inserted) {
          this.companyCache.set(slug, inserted.id);
          return inserted.id;
        }

        // Row already existed (race with a concurrent insert) — fetch it.
        const [existing] = await db
          .select({ id: companiesTable.id })
          .from(companiesTable)
          .where(eq(companiesTable.slug, slug));

        if (existing) {
          this.companyCache.set(slug, existing.id);
          return existing.id;
        }

        return null;
      } catch (err) {
        logger.error({ err, slug, companyName }, "Failed to auto-create company for aggregator job");
        return null;
      } finally {
        this.pendingCompanyCreates.delete(slug);
      }
    })();

    this.pendingCompanyCreates.set(slug, creation);
    return creation;
  }

  /**
   * Normalize a ProviderJob into an InsertJob.
   * Returns null if the company slug can't be resolved (unknown, and no
   * companyName was provided to auto-create it).
   */
  async normalize(job: ProviderJob): Promise<NormalizedJob | null> {
    const companyId = await this.resolveCompanyId(job.companySlug, job.companyName);
    if (!companyId) {
      logger.warn(
        { companySlug: job.companySlug, provider: job.sourceProvider },
        "Skipping job — companySlug not found in DB and no companyName to auto-create it.",
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
