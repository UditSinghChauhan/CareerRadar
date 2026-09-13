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
 *     4. Deduplicate: insert / update / skip (each stamps lastSeenAt)
 *     5. Close anything this provider stopped listing (guarded — see staleness.ts)
 *     6. Record metrics
 *
 * After every config has run, two global sweeps close aggregator jobs past
 * SYNC_MAX_AGE_DAYS and any job whose stated deadline has passed.
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
 *   SYNC_MAX_AGE_DAYS     number              default: 45
 */

import { logger } from "../lib/logger";
import { db, providerSyncLogsTable } from "@workspace/db";
import { providerRegistry } from "./registry";
import { getEnabledConfigs } from "./config";
import { jobNormalizer } from "./normalizer";
import { deduplicationService } from "./deduplication";
import { metrics } from "./metrics";
import {
  closeExpiredDeadlineJobs,
  closeStaleAggregatorJobs,
  closeUnseenJobs,
  getMaxAgeDays,
} from "./staleness";
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
      setTimeout(() => {
        this.runAll().catch((err) => {
          logger.error(
            { err },
            "Unhandled error in scheduler run — server remains up",
          );
        });
      }, 5_000);
    }

    const nextRunAt = new Date(Date.now() + this.intervalMs);
    metrics.setNextRun(nextRunAt);

    this.timer = setInterval(() => {
      this.runAll().catch((err) => {
        logger.error(
          { err },
          "Unhandled error in scheduler run — server remains up",
        );
      });
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

    try {
      await jobNormalizer.warmUp();
    } catch (err) {
      logger.error(
        { err },
        "Scheduler run aborted — failed to warm up normalizer cache (DB unreachable?)",
      );
      this.isRunning = false;
      return this.emptyResult();
    }

    const configs = getEnabledConfigs();
    logger.info(
      { count: configs.length },
      `Processing ${configs.length} provider configs`,
    );

    const fetchResults: FetchResult[] = [];
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalClosed = 0;
    let errors = 0;

    // Sequential execution (respect upstream rate limits)
    for (const config of configs) {
      const provider = providerRegistry.get(config.providerName);
      if (!provider) {
        logger.warn(
          {
            providerName: config.providerName,
            companySlug: config.companySlug,
          },
          "Unknown provider in config — skipping",
        );
        continue;
      }

      const fetchStart = Date.now();
      const configRunStartedAt = new Date(fetchStart);
      let result: FetchResult;

      try {
        const rawJobs = await provider.fetchJobs(config);

        // Normalize (sequential — auto company-creation must not race within a batch)
        const normalizedJobs: NonNullable<
          Awaited<ReturnType<typeof jobNormalizer.normalize>>
        >[] = [];
        for (const j of rawJobs) {
          const normalized = await jobNormalizer.normalize(j);
          if (normalized !== null) normalizedJobs.push(normalized);
        }

        // Deduplicate + persist. Every touched row is stamped with exactly
        // `configRunStartedAt`, so the sweep's `lastSeenAt < configRunStartedAt`
        // predicate excludes this run's sightings without any clock slack.
        const upsertResults = await deduplicationService.upsertBatch(
          normalizedJobs,
          { seenAt: configRunStartedAt },
        );

        const inserted = upsertResults.filter(
          (r) => r.action === "insert",
        ).length;
        const updated = upsertResults.filter(
          (r) => r.action === "update",
        ).length;
        const skipped = upsertResults.filter((r) => r.action === "skip").length;

        totalInserted += inserted;
        totalUpdated += updated;
        totalSkipped += skipped;

        // Close whatever this provider stopped listing. Disarmed unless the
        // fetch actually produced jobs — see the guard in staleness.ts.
        const sweep = await closeUnseenJobs({
          sourcePlatform: config.providerName,
          companyIds: normalizedJobs.map((j) => j.companyId),
          runStartedAt: configRunStartedAt,
          fetchedCount: rawJobs.length,
          persistedCount: upsertResults.length,
          companySlug: config.companySlug,
        });
        totalClosed += sweep.closed;

        result = {
          companySlug: config.companySlug,
          providerName: config.providerName,
          jobs: rawJobs,
          rawCount: rawJobs.length,
          durationMs: Date.now() - fetchStart,
          jobsClosed: sweep.closed,
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
          {
            companySlug: config.companySlug,
            provider: config.providerName,
            inserted,
            updated,
            skipped,
            closed: sweep.closed,
            sweepSkipped: sweep.skipped,
          },
          "Provider run complete",
        );
      } catch (err: unknown) {
        errors++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        metrics.recordFailure(
          config.providerName,
          config.companySlug,
          errorMsg,
        );

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
          {
            err,
            companySlug: config.companySlug,
            provider: config.providerName,
          },
          "Provider run failed",
        );
      }

      fetchResults.push(result);

      // Polite pause between providers (300ms)
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // ── Global sweeps ────────────────────────────────────────────────────────
    // Unlike the per-config sweep these are not conditional on any fetch: they
    // read only our own columns (postedDate, deadline), so an upstream outage
    // cannot make them close the wrong thing. A failure here must not fail the
    // ingestion run that already succeeded, so each is caught separately.
    try {
      const aggregatorSweep = await closeStaleAggregatorJobs({
        maxAgeDays: getMaxAgeDays(),
      });
      totalClosed += aggregatorSweep.closed;
    } catch (err) {
      logger.error(
        { err },
        "Aggregator age sweep failed — ingestion results are unaffected",
      );
    }

    try {
      const deadlineSweep = await closeExpiredDeadlineJobs();
      totalClosed += deadlineSweep.closed;
    } catch (err) {
      logger.error(
        { err },
        "Expired-deadline sweep failed — ingestion results are unaffected",
      );
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
      totalClosed,
      errors,
    };

    logger.info(
      {
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        totalFetched: summary.totalFetched,
        totalInserted,
        totalUpdated,
        totalSkipped,
        totalClosed,
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
    const runStartedAt = new Date(start);
    const rawJobs = await provider.fetchJobs(config);

    const normalizedJobs: NonNullable<
      Awaited<ReturnType<typeof jobNormalizer.normalize>>
    >[] = [];
    for (const j of rawJobs) {
      const normalized = await jobNormalizer.normalize(j);
      if (normalized !== null) normalizedJobs.push(normalized);
    }

    const upsertResults = await deduplicationService.upsertBatch(
      normalizedJobs,
      { seenAt: runStartedAt },
    );

    const inserted = upsertResults.filter((r) => r.action === "insert").length;
    const updated = upsertResults.filter((r) => r.action === "update").length;
    const skipped = upsertResults.filter((r) => r.action === "skip").length;

    // Same guarded sweep as runAll. The manual trigger routes hit this path, so
    // leaving it out would mean a hand-run sync silently stopped closing jobs.
    const sweep = await closeUnseenJobs({
      sourcePlatform: providerName,
      companyIds: normalizedJobs.map((j) => j.companyId),
      runStartedAt,
      fetchedCount: rawJobs.length,
      persistedCount: upsertResults.length,
      companySlug,
    });

    metrics.recordSuccess(
      providerName,
      companySlug,
      rawJobs.length,
      inserted,
      updated,
      skipped,
    );

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
      jobsClosed: sweep.closed,
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
      totalClosed: 0,
      errors: 0,
    };
  }
}

/** Singleton — start this at server boot in index.ts. */
export const schedulerService = new SchedulerService();
