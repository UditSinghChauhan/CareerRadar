/**
 * Sync Routes
 * ───────────
 * Every route here that causes outbound traffic requires an authenticated
 * session, matching the boundary already applied to routes/providers.ts: read
 * only status is public, anything that triggers work is not.
 *
 * POST /api/sync/all                                   — trigger a full scheduler run (non-blocking) — requires auth
 * POST /api/sync/provider/:provider                    — trigger all configs for one provider — requires auth
 * POST /api/sync/provider/:provider/company/:company   — trigger a single config — requires auth
 * GET  /api/sync/verify                                — live HTTP checks against every ATS API — requires auth
 * GET  /api/sync/status                                — latest sync logs + scheduler state (public, read only)
 */

import { Router } from "express";
import { desc, sql } from "drizzle-orm";
import { db, providerSyncLogsTable } from "@workspace/db";
import { providerRegistry } from "../providers/registry";
import { schedulerService } from "../providers/scheduler";
import { metrics } from "../providers/metrics";
import { getEnabledConfigs } from "../providers/config";
import { runVerification } from "../providers/verify";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// ─── GET /api/sync/status ─────────────────────────────────────────────────────
// Returns the last 50 sync log entries from DB + live in-memory scheduler state.

router.get("/sync/status", async (_req, res) => {
  const [recentLogs, perProviderLatest] = await Promise.all([
    db
      .select()
      .from(providerSyncLogsTable)
      .orderBy(desc(providerSyncLogsTable.startedAt))
      .limit(50),
    db
      .select({
        providerName: providerSyncLogsTable.providerName,
        companySlug: providerSyncLogsTable.companySlug,
        lastStatus: sql<string>`(array_agg(${providerSyncLogsTable.status} ORDER BY ${providerSyncLogsTable.startedAt} DESC))[1]`,
        lastRunAt: sql<string>`max(${providerSyncLogsTable.startedAt})`,
        totalRuns: sql<number>`count(*)::int`,
        totalInserted: sql<number>`sum(${providerSyncLogsTable.jobsInserted})::int`,
        totalUpdated: sql<number>`sum(${providerSyncLogsTable.jobsUpdated})::int`,
      })
      .from(providerSyncLogsTable)
      .groupBy(providerSyncLogsTable.providerName, providerSyncLogsTable.companySlug),
  ]);

  res.json({
    scheduler: metrics.getSchedulerMetrics(),
    recentLogs,
    summary: perProviderLatest,
  });
});

// ─── POST /api/sync/all ───────────────────────────────────────────────────────
// Fire and forget — triggers a full scheduler pass.

router.post("/sync/all", requireAuth, (req, res) => {
  const enabled = getEnabledConfigs();

  if (enabled.length === 0) {
    res.status(422).json({
      message: "No enabled provider configs. Enable at least one company in providers/config.ts.",
      hint: "Set `enabled: true` on a config entry and restart the server.",
    });
    return;
  }

  res.json({
    message: "Full sync started",
    configCount: enabled.length,
    startedAt: new Date(),
  });

  void schedulerService.runAll().catch((err: unknown) => {
    req.log.error({ err }, "POST /sync/all — full sync failed");
  });
});

// ─── POST /api/sync/provider/:provider ───────────────────────────────────────
// Trigger all enabled configs for a specific provider.

router.post("/sync/provider/:provider", requireAuth, async (req, res) => {
  const providerName = req.params["provider"] as string;

  if (!providerRegistry.has(providerName)) {
    res.status(404).json({ error: `Provider "${providerName}" is not registered` });
    return;
  }

  const configs = getEnabledConfigs().filter((c) => c.providerName === providerName);

  if (configs.length === 0) {
    res.status(422).json({
      error: `No enabled configs for provider "${providerName}"`,
      hint: "Add or enable a config entry in providers/config.ts",
    });
    return;
  }

  const results = [];

  for (const config of configs) {
    try {
      const result = await schedulerService.runOne(providerName, config.companySlug);
      results.push({
        companySlug: config.companySlug,
        status: "success",
        jobsFetched: result.rawCount,
        durationMs: result.durationMs,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      req.log.error({ err, providerName, companySlug: config.companySlug }, "Provider sync failed");
      results.push({
        companySlug: config.companySlug,
        status: "failure",
        error: msg,
      });
    }
  }

  res.json({ providerName, results });
});

// ─── POST /api/sync/provider/:provider/company/:company ──────────────────────
// Trigger a single provider+company combination.

router.post("/sync/provider/:provider/company/:company", requireAuth, async (req, res) => {
  const providerName = req.params["provider"] as string;
  const companySlug = req.params["company"] as string;

  if (!providerRegistry.has(providerName)) {
    res.status(404).json({ error: `Provider "${providerName}" not registered` });
    return;
  }

  try {
    const result = await schedulerService.runOne(providerName, companySlug);
    res.json({
      providerName,
      companySlug,
      status: "success",
      jobsFetched: result.rawCount,
      durationMs: result.durationMs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err, providerName, companySlug }, "Single provider sync failed");
    res.status(500).json({ error: msg });
  }
});

// ─── GET /api/sync/verify ─────────────────────────────────────────────────────
// Runs live HTTP checks against all configured endpoints and returns a report.
// WARNING: makes real outbound requests to ATS APIs. Do not call in a tight loop.

router.get("/sync/verify", requireAuth, async (_req, res) => {
  try {
    const { results, summary } = await runVerification();
    res.json({
      runAt: new Date(),
      totals: {
        configured: results.length,
        working: summary.working.length,
        empty: summary.empty.length,
        broken: summary.broken.length,
        authRequired: summary.authRequired.length,
        noPublicApi: summary.noPublicApi.length,
        totalJobsDiscoverable: summary.working.reduce(
          (s, r) => s + (r.jobCount ?? 0),
          0,
        ),
      },
      working: summary.working,
      empty: summary.empty,
      broken: summary.broken,
      authRequired: summary.authRequired,
      noPublicApi: summary.noPublicApi,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
