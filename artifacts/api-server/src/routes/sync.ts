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
 * POST /api/sync/cron                                  — external scheduled trigger — x-cron-secret, NOT Clerk
 *                                                        (also reclassifies relevance and generates notifications
 *                                                         once the sync finishes — see below)
 * GET  /api/sync/verify                                — live HTTP checks against every ATS API — requires auth
 * GET  /api/sync/status                                — latest sync logs + scheduler state (public, read only)
 *
 * These routes are deliberately absent from `lib/api-spec/openapi.yaml`. The
 * generated client covers what the browser calls; sync is operator- and
 * machine-facing, and no frontend code consumes it.
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
import { verifyCronSecret } from "../lib/cron-auth";
import { currentSchemaStatus } from "../lib/schema-check";
import { backfillRelevance } from "../relevance/backfill-relevance";
import { generateNotifications } from "../notifications/generator";

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
      .groupBy(
        providerSyncLogsTable.providerName,
        providerSyncLogsTable.companySlug,
      ),
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
      message:
        "No enabled provider configs. Enable at least one company in providers/config.ts.",
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

// ─── POST /api/sync/cron ──────────────────────────────────────────────────────
// The external scheduled trigger. Called by .github/workflows/sync.yml every
// six hours, because Render's free tier has no cron and the in-process
// setInterval scheduler dies with every 15-minute spin-down.
//
// NO CLERK, DELIBERATELY. A CI runner has no browser session cookie. The gate
// is a shared secret in the `x-cron-secret` header, compared in constant time —
// see lib/cron-auth.ts. Unset secret ⇒ 401 for everyone, no exceptions.
//
// RETURNS 202 AND HANGS UP. A full pass over every enabled config takes minutes
// and far exceeds any sensible HTTP timeout; holding the request open would
// make a working sync look like a failed job. The response says "accepted",
// not "finished" — the outcome lands in provider_sync_logs and is readable at
// GET /api/sync/status.

router.post("/sync/cron", async (req, res) => {
  const auth = verifyCronSecret(req.headers["x-cron-secret"]);

  if (!auth.ok) {
    // The body never distinguishes "no secret configured on the server" from
    // "your secret was wrong" — that difference is useful to an attacker and
    // to nobody else. The reason is logged server-side, where the operator
    // debugging their workflow can actually read it.
    req.log.warn(
      { reason: auth.reason },
      "POST /sync/cron — rejected unauthenticated cron trigger",
    );
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // A sync against a drifted schema fails on the first INSERT that names a
  // missing column, one provider at a time, with the reason buried in the
  // provider logs. Refuse up front with the same message /api/health gives.
  const schema = await currentSchemaStatus();
  if (schema.status === "drift") {
    req.log.error(
      { drift: schema.drift },
      "POST /sync/cron — refused: schema drift",
    );
    res
      .status(503)
      .json({ error: "schema_drift", drift: schema.drift, hint: schema.hint });
    return;
  }

  const enabled = getEnabledConfigs();

  if (enabled.length === 0) {
    res.status(422).json({
      message:
        "No enabled provider configs. Enable at least one company in providers/config.ts.",
    });
    return;
  }

  res.status(202).json({
    message: "Sync accepted",
    configCount: enabled.length,
    acceptedAt: new Date(),
  });

  // Kicked off *after* the response so a slow first DB connection on a
  // cold-started instance cannot delay the 202.
  //
  // RELEVANCE IS RECLASSIFIED WHEN THE SYNC FINISHES (Phase 3).
  // Two of the classifier's modifiers are functions of the calendar — "posted
  // within 7 days +10" and "posted over 45 days ago −20" — and the daily
  // queue's freshness term reads `posted_date` directly. The sync only
  // rewrites rows a provider actually returned, so a row that stops being
  // returned keeps a +10 it earned weeks ago forever, and its stored
  // `relevance_score` drifts further from the truth every day. The queue then
  // ranks by a stale number. Recomputing after every cron pass is what keeps
  // the scores moving with the calendar; the backfill is deterministic and
  // recompute-all, so this is safe to run on every pass and writes only the
  // rows whose values actually changed.
  //
  // It runs AFTER the sync rather than beside it: the sync inserts rows that
  // need classifying, and two full table passes at once on 512 MB / 0.1 CPU
  // is how the instance gets OOM-killed. A backfill failure is logged and
  // does not mark the sync failed — the jobs are in, only their scores are
  // stale, which the next pass fixes.
  //
  // NOTIFICATIONS ARE GENERATED LAST (Phase 6.2).
  // Both inputs have to be settled first: the sync is what brings in the jobs
  // a saved search could match, and the backfill is what gives them the
  // relevance score the new-job threshold compares against. Generating before
  // either would announce yesterday's feed and score today's arrivals as NULL.
  //
  // generateNotifications() never rejects — it catches its own failures and
  // returns them on the report — so it cannot turn a completed sync into a
  // logged failure. A bell with nothing in it is not an outage.
  void schedulerService
    .runAll()
    .then(async () => {
      const report = await backfillRelevance();
      req.log.info(
        {
          scanned: report.scanned,
          updated: report.updated,
          durationMs: report.durationMs,
          activeFresherEligible: report.activeFresherEligible,
        },
        "POST /sync/cron — relevance reclassified after sync",
      );

      const notifications = await generateNotifications();
      req.log.info(
        notifications,
        "POST /sync/cron — notifications generated after sync",
      );
    })
    .catch((err: unknown) => {
      req.log.error(
        { err },
        "POST /sync/cron — background sync or relevance backfill failed",
      );
    });
});

// ─── POST /api/sync/provider/:provider ───────────────────────────────────────
// Trigger all enabled configs for a specific provider.

router.post("/sync/provider/:provider", requireAuth, async (req, res) => {
  const providerName = req.params["provider"] as string;

  if (!providerRegistry.has(providerName)) {
    res
      .status(404)
      .json({ error: `Provider "${providerName}" is not registered` });
    return;
  }

  const configs = getEnabledConfigs().filter(
    (c) => c.providerName === providerName,
  );

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
      const result = await schedulerService.runOne(
        providerName,
        config.companySlug,
      );
      results.push({
        companySlug: config.companySlug,
        status: "success",
        jobsFetched: result.rawCount,
        durationMs: result.durationMs,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      req.log.error(
        { err, providerName, companySlug: config.companySlug },
        "Provider sync failed",
      );
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

router.post(
  "/sync/provider/:provider/company/:company",
  requireAuth,
  async (req, res) => {
    const providerName = req.params["provider"] as string;
    const companySlug = req.params["company"] as string;

    if (!providerRegistry.has(providerName)) {
      res
        .status(404)
        .json({ error: `Provider "${providerName}" not registered` });
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
      req.log.error(
        { err, providerName, companySlug },
        "Single provider sync failed",
      );
      res.status(500).json({ error: msg });
    }
  },
);

// ─── GET /api/sync/verify ─────────────────────────────────────────────────────
// Runs live HTTP checks against all configured endpoints and returns a report.
// WARNING: makes real outbound requests to ATS APIs. Do not call in a tight loop.

// Kept as a stable alias for POST /api/admin/verify-providers (routes/admin.ts),
// which is the canonical Phase 5.3 entry point. Both return the same payload.
router.get("/sync/verify", requireAuth, async (_req, res) => {
  try {
    const { results, summary } = await runVerification();
    res.json({ summary, results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
