/**
 * Provider Engine Routes
 * ───────────────────────
 * Admin/internal endpoints for monitoring and triggering the provider engine.
 * The GET endpoints are read-only status/metrics and remain public. The POST
 * endpoints trigger scheduler runs and require an authenticated session.
 *
 * GET  /api/providers            — list all registered providers
 * GET  /api/providers/metrics    — provider + scheduler metrics
 * GET  /api/providers/configs    — all company/provider configs (incl. disabled)
 * POST /api/providers/run        — trigger a full scheduler run (async) — requires auth
 * POST /api/providers/:name/run  — trigger a single provider run for one company — requires auth
 */

import { Router } from "express";
import { providerRegistry } from "../providers/registry";
import { schedulerService } from "../providers/scheduler";
import { metrics } from "../providers/metrics";
import { getAllConfigs } from "../providers/config";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

/** List all registered providers. */
router.get("/providers", (_req, res) => {
  res.json({
    providers: providerRegistry.list(),
  });
});

/** Current metrics for all providers + scheduler. */
router.get("/providers/metrics", (_req, res) => {
  res.json(metrics.getSummary());
});

/** All company/provider configurations (including disabled ones). */
router.get("/providers/configs", (_req, res) => {
  res.json({ configs: getAllConfigs() });
});

/** Trigger a full scheduler run in the background. Returns immediately. */
router.post("/providers/run", requireAuth, (req, res) => {
  res.json({ message: "Scheduler run started", startedAt: new Date() });
  // Fire and forget — response already sent
  void schedulerService.runAll().catch((err: unknown) => {
    req.log.error({ err }, "Manual full scheduler run failed");
  });
});

/** Trigger a single provider+company run synchronously (waits for result). */
router.post("/providers/:name/run", requireAuth, async (req, res) => {
  const providerName = req.params["name"] as string;
  const companySlug = req.query["company"] as string | undefined;

  if (!companySlug) {
    res.status(400).json({ error: "?company=<slug> query param is required" });
    return;
  }

  if (!providerRegistry.has(providerName)) {
    res.status(404).json({ error: `Provider "${providerName}" not found` });
    return;
  }

  try {
    const result = await schedulerService.runOne(providerName, companySlug);
    res.json({
      providerName,
      companySlug,
      rawCount: result.rawCount,
      durationMs: result.durationMs,
      error: result.error,
    });
  } catch (err: unknown) {
    req.log.error({ err, providerName, companySlug }, "Manual provider run failed");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
