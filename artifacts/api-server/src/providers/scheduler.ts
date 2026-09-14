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

import { desc, eq } from "drizzle-orm";
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

/**
 * How recent a successful run has to be for the boot sync to be skipped.
 *
 * WHY THIS EXISTS
 * ────────────────
 * A Render free-tier instance spins down after 15 minutes idle and boots again
 * on the next request. With PROVIDER_RUN_ON_START=true that means every wake —
 * a page load, a health check, the cron workflow's own wake-up curl — starts a
 * full pass over every enabled config. Several wakes in an afternoon becomes
 * several full syncs, and Adzuna (250 req/day) and JSearch (200 req/month) are
 * metered tightly enough that this alone can exhaust the month.
 *
 * Two hours sits comfortably inside the 6-hour cron cadence, so the scheduled
 * run is never suppressed by the boot of the instance serving it, while a burst
 * of wakes collapses to at most one sync.
 */
export const BOOT_SYNC_MIN_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface BootSyncDecision {
  run: boolean;
  reason:
    | "no-successful-run-recorded"
    | "last-success-is-old"
    | "last-success-is-recent"
    | "lookup-failed";
  lastSuccessAt: Date | null;
  ageMs: number | null;
}

/**
 * Timestamp of the most recent `status = "success"` row in provider_sync_logs,
 * or null if there has never been one.
 *
 * `startedAt` rather than `finishedAt`: it is NOT NULL in the schema, whereas
 * `finishedAt` is nullable, and a run interrupted mid-write would otherwise sort
 * as if it had never happened.
 */
export async function lastSuccessfulSyncAt(): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: providerSyncLogsTable.startedAt })
    .from(providerSyncLogsTable)
    .where(eq(providerSyncLogsTable.status, "success"))
    .orderBy(desc(providerSyncLogsTable.startedAt))
    .limit(1);

  return row?.startedAt ?? null;
}

/**
 * Should the run-on-start sync actually run?
 *
 * FAILS OPEN. If the lookup itself throws, this returns `run: true`. The guard
 * is a quota optimisation, not a safety mechanism — and when the database is
 * unreachable `runAll()` aborts at `warmUp()` anyway, so an over-eager decision
 * here costs nothing while an over-cautious one could suppress ingestion
 * indefinitely on a flaky connection.
 */
export async function decideBootSync(
  now: Date = new Date(),
  minGapMs: number = BOOT_SYNC_MIN_GAP_MS,
): Promise<BootSyncDecision> {
  let lastSuccessAt: Date | null;

  try {
    lastSuccessAt = await lastSuccessfulSyncAt();
  } catch (err) {
    logger.warn(
      { err },
      "Boot-sync guard could not read provider_sync_logs — running the boot sync anyway",
    );
    return {
      run: true,
      reason: "lookup-failed",
      lastSuccessAt: null,
      ageMs: null,
    };
  }

  if (lastSuccessAt === null) {
    return {
      run: true,
      reason: "no-successful-run-recorded",
      lastSuccessAt: null,
      ageMs: null,
    };
  }

  const ageMs = now.getTime() - lastSuccessAt.getTime();

  // A negative age means the row is stamped in the future — clock skew between
  // the app instance and Postgres. Treat it as recent: the conservative read is
  // that a sync just happened.
  if (ageMs < minGapMs) {
    return {
      run: false,
      reason: "last-success-is-recent",
      lastSuccessAt,
      ageMs,
    };
  }

  return { run: true, reason: "last-success-is-old", lastSuccessAt, ageMs };
}

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
      // Small delay so the server finishes booting first.
      //
      // The guard is evaluated here rather than in start() so that start()
      // stays synchronous — index.ts calls it from inside app.listen and must
      // not have to await anything to finish booting.
      setTimeout(() => {
        void this.runBootSync();
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

  /**
   * The run-on-start sync, behind the two-hour guard.
   *
   * Separate from start() and exported on the instance so the guard can be
   * tested against real rows without booting a server or waiting 5 seconds.
   */
  async runBootSync(): Promise<BootSyncDecision> {
    const decision = await decideBootSync();

    if (!decision.run) {
      logger.info(
        {
          lastSuccessAt: decision.lastSuccessAt,
          ageMinutes:
            decision.ageMs === null
              ? null
              : Math.round(decision.ageMs / 60_000),
          minGapMinutes: Math.round(BOOT_SYNC_MIN_GAP_MS / 60_000),
          reason: decision.reason,
        },
        "Boot sync skipped — a successful sync finished less than 2 hours ago. " +
          "The interval timer is unaffected and the external cron trigger still works.",
      );
      return decision;
    }

    logger.info(
      { reason: decision.reason, lastSuccessAt: decision.lastSuccessAt },
      "Boot sync proceeding",
    );

    try {
      await this.runAll();
    } catch (err) {
      logger.error(
        { err },
        "Unhandled error in scheduler run — server remains up",
      );
    }

    return decision;
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
