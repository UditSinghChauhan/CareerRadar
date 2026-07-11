/**
 * SchedulerService
 * ─────────────────
 * Orchestrates periodic job ingestion across all enabled company/provider
 * configurations.
 *
 * EXECUTION MODEL
 * ─────────────────
 * Single run:
 *   for each enabled CompanyProviderConfig:
 *     1. Resolve the provider from the registry
 *     2. Fetch jobs (with retry)
 *     3. Normalize each job (resolve company/source FKs)
 *     4. Deduplicate: insert / update / skip
 *     5. Record metrics
 *
 * Concurrency: configs run sequentially by default to be polite to upstream
 * APIs. Set PROVIDER_CONCURRENCY > 1 to parallelize (careful — rate limits).
 *
 * CONFIGURATION (environment variables)
 * ───────────────────────────────────────
 *   PROVIDER_ENABLED      "true" | "false"   default: "true"
 *   PROVIDER_INTERVAL_MS  milliseconds        default: 21600000 (6 hours)
 *   PROVIDER_CONCURRENCY  number              default: 1
 *   PROVIDER_RUN_ON_START "true" | "false"   default: "true"
 */

import { logger } from "../lib/logger";
import { db, providerSyncLogsTable } from "@workspace/db";
import { providerRegistry } from "./registry";
import { getEnabledConfigs } from "./config";
import { jobNormalizer } from "./normalizer";
import { deduplicationService } from "./deduplication";
import { metrics } from "./metrics";
import type { SchedulerRunResult, FetchResult } from "./types";

async function writeSyncLog(entry: {
  providerName: string;
  companySlug: string;
  status: "success" | "failure" | "skipped";
  jobsFetched?: number;
  jobsInserted?: number;
  jobsUpdated?: number;
  jobsSkipped?: number;
  errorMessage?: string;
  startedAt: Date;
  finishedAt?: Date;
}): Promise<void> {
  try {
    await db.insert(providerSyncLogsTable).values({
      providerName: entry.providerName,
      companySlug: entry.companySlug,
      status: entry.status,
      jobsFetched: entry.jobsFetched ?? 0,
      jobsInserted: entry.jobsInserted ?? 0,
      jobsUpdated: entry.jobsUpdated ?? 0,
      jobsSkipped: entry.jobsSkipped ?? 0,
      errorMessage: entry.errorMessage,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt ?? new Date(),
    });
  } catch (err) {
    logger.warn({ err }, "Failed to write sync log to DB — continuing");
  }
}

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export class SchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  get enabled(): boolean {
    return process.env["PROVIDER_ENABLED"] !== "false";
  }

  get intervalMs(): number {
    const raw = process.env["PROVIDER_INTERVAL_MS"];
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return isNaN(parsed) || parsed < 60_000 ? DEFAULT_INTERVAL_MS : parsed;
  }

  get concurrency(): number {
    const raw = process.env["PROVIDER_CONCURRENCY"];
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return isNaN(parsed) || parsed < 1 ? 1 : parsed;
  }

  get runOnStart(): boolean {
    return process.env["PROVIDER_RUN_ON_START"] !== "false";
  }

  /** Start the periodic scheduler. Safe to call once at server boot. */
  start(): void {
    if (!this.enabled) {
      logger.info("Provider scheduler disabled (PROVIDER_ENABLED=false)");
      return;
    }

    logger.info(
      { intervalMs: this.intervalMs, runOnStart: this.runOnStart },
      "Provider scheduler starting",
    );

    if (this.runOnStart) {
      // Small delay so the server finishes booting first
      setTimeout(() => this.runAll(), 5_000);
    }

    const nextRunAt = new Date(Date.now() + this.intervalMs);
    metrics.setNextRun(nextRunAt);

    this.timer = setInterval(() => {
      void this.runAll();
    }, this.intervalMs);
  }

  /** Gracefully stop the scheduler. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("Provider scheduler stopped");
    }
  }

  /** Manually trigger a full run. Returns a summary when complete. */
  async runAll(): Promise<SchedulerRunResult> {
    if (this.isRunning) {
      logger.warn("Scheduler run requested while already running — skipping");
      return this.emptyResult();
    }

    this.isRunning = true;
    metrics.recordSchedulerStart();

    const startedAt = new Date();
    logger.info("Scheduler run started");

    await jobNormalizer.warmUp();

    const configs = getEnabledConfigs();
    logger.info({ count: configs.length }, `Processing ${configs.length} provider configs`);

    const fetchResults: FetchResult[] = [];
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let errors = 0;

    // Sequential execution (respect upstream rate limits)
    for (const config of configs) {
      const provider = providerRegistry.get(config.providerName);
      if (!provider) {
        logger.warn(
          { providerName: config.providerName, companySlug: config.companySlug },
          "Unknown provider in config — skipping",
        );
        continue;
      }

      const fetchStart = Date.now();
      let result: FetchResult;

      try {
        const rawJobs = await provider.fetchJobs(config);

        // Normalize (sequential — auto company-creation must not race within a batch)
        const normalizedJobs: NonNullable<Awaited<ReturnType<typeof jobNormalizer.normalize>>>[] = [];
        for (const j of rawJobs) {
          const normalized = await jobNormalizer.normalize(j);
          if (normalized !== null) normalizedJobs.push(normalized);
        }

        // Deduplicate + persist
        const upsertResults = await deduplicationService.upsertBatch(normalizedJobs);

        const inserted = upsertResults.filter((r) => r.action === "insert").length;
        const updated = upsertResults.filter((r) => r.action === "update").length;
        const skipped = upsertResults.filter((r) => r.action === "skip").length;

        totalInserted += inserted;
        totalUpdated += updated;
        totalSkipped += skipped;

        result = {
          companySlug: config.companySlug,
          providerName: config.providerName,
          jobs: rawJobs,
          rawCount: rawJobs.length,
          durationMs: Date.now() - fetchStart,
        };

        metrics.recordSuccess(
          config.providerName,
          config.companySlug,
          rawJobs.length,
          inserted,
          updated,
          skipped,
        );

        await writeSyncLog({
          providerName: config.providerName,
          companySlug: config.companySlug,
          status: "success",
          jobsFetched: rawJobs.length,
          jobsInserted: inserted,
          jobsUpdated: updated,
          jobsSkipped: skipped,
          startedAt: new Date(fetchStart),
          finishedAt: new Date(),
        });

        logger.info(
          { companySlug: config.companySlug, provider: config.providerName, inserted, updated, skipped },
          "Provider run complete",
        );
      } catch (err: unknown) {
        errors++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        metrics.recordFailure(config.providerName, config.companySlug, errorMsg);

        await writeSyncLog({
          providerName: config.providerName,
          companySlug: config.companySlug,
          status: "failure",
          errorMessage: errorMsg,
          startedAt: new Date(fetchStart),
          finishedAt: new Date(),
        });

        result = {
          companySlug: config.companySlug,
          providerName: config.providerName,
          jobs: [],
          rawCount: 0,
          durationMs: Date.now() - fetchStart,
          error: errorMsg,
        };

        logger.error(
          { err, companySlug: config.companySlug, provider: config.providerName },
          "Provider run failed",
        );
      }

      fetchResults.push(result);

      // Polite pause between providers (300ms)
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const finishedAt = new Date();
    const nextRunAt = new Date(Date.now() + this.intervalMs);
    metrics.recordSchedulerEnd(nextRunAt);
    this.isRunning = false;

    const summary: SchedulerRunResult = {
      startedAt,
      finishedAt,
      results: fetchResults,
      totalFetched: fetchResults.reduce((s, r) => s + r.rawCount, 0),
      totalInserted,
      totalUpdated,
      totalSkipped,
      errors,
    };

    logger.info(
      {
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        totalFetched: summary.totalFetched,
        totalInserted,
        totalUpdated,
        totalSkipped,
        errors,
      },
      "Scheduler run finished",
    );

    return summary;
  }

  /** Run a single provider+company combination (used by the manual trigger route). */
  async runOne(
    providerName: string,
    companySlug: string,
  ): Promise<FetchResult> {
    const configs = getEnabledConfigs().filter(
      (c) => c.providerName === providerName && c.companySlug === companySlug,
    );

    if (configs.length === 0) {
      throw new Error(
        `No enabled config found for provider "${providerName}" + company "${companySlug}"`,
      );
    }

    await jobNormalizer.warmUp();

    const config = configs[0];
    const provider = providerRegistry.get(providerName);
    if (!provider) {
      throw new Error(`Provider "${providerName}" is not registered`);
    }

    const start = Date.now();
    const rawJobs = await provider.fetchJobs(config);

    const normalizedJobs: NonNullable<Awaited<ReturnType<typeof jobNormalizer.normalize>>>[] = [];
    for (const j of rawJobs) {
      const normalized = await jobNormalizer.normalize(j);
      if (normalized !== null) normalizedJobs.push(normalized);
    }

    const upsertResults = await deduplicationService.upsertBatch(normalizedJobs);

    const inserted = upsertResults.filter((r) => r.action === "insert").length;
    const updated = upsertResults.filter((r) => r.action === "update").length;
    const skipped = upsertResults.filter((r) => r.action === "skip").length;

    metrics.recordSuccess(providerName, companySlug, rawJobs.length, inserted, updated, skipped);

    await writeSyncLog({
      providerName,
      companySlug,
      status: "success",
      jobsFetched: rawJobs.length,
      jobsInserted: inserted,
      jobsUpdated: updated,
      jobsSkipped: skipped,
      startedAt: new Date(start),
      finishedAt: new Date(),
    });

    return {
      companySlug,
      providerName,
      jobs: rawJobs,
      rawCount: rawJobs.length,
      durationMs: Date.now() - start,
    };
  }

  private emptyResult(): SchedulerRunResult {
    return {
      startedAt: new Date(),
      finishedAt: new Date(),
      results: [],
      totalFetched: 0,
      totalInserted: 0,
      totalUpdated: 0,
      totalSkipped: 0,
      errors: 0,
    };
  }
}

/** Singleton — start this at server boot in index.ts. */
export const schedulerService = new SchedulerService();
