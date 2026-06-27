/**
 * Source Management Routes
 * ─────────────────────────
 * GET /api/sources           — full source list (all configured providers, enabled & disabled)
 * GET /api/sources/health    — aggregated health report with buckets + job contribution stats
 * GET /api/sources/:id       — single source record by "{providerName}:{companySlug}"
 *
 * These routes are read-only. Sources are configured via providers/config.ts and
 * providers/catalog.ts — no DB writes happen here.
 */

import { Router } from "express";
import { getSources, getSourceById, getSourceHealth } from "../sources/registry";

const router = Router();

// ─── GET /api/sources ─────────────────────────────────────────────────────────

router.get("/sources", async (req, res) => {
  try {
    const { status, provider, enabled } = req.query as Record<string, string | undefined>;

    let sources = await getSources();

    if (status) {
      sources = sources.filter((s) => s.status === status);
    }
    if (provider) {
      sources = sources.filter((s) => s.providerName === provider);
    }
    if (enabled !== undefined) {
      const want = enabled === "true";
      sources = sources.filter((s) => s.enabled === want);
    }

    res.json({
      count: sources.length,
      sources,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "GET /sources failed");
    res.status(500).json({ error: msg });
  }
});

// ─── GET /api/sources/health ──────────────────────────────────────────────────

router.get("/sources/health", async (req, res) => {
  try {
    const health = await getSourceHealth();
    res.json(health);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "GET /sources/health failed");
    res.status(500).json({ error: msg });
  }
});

// ─── GET /api/sources/:id ─────────────────────────────────────────────────────

router.get("/sources/:id", async (req, res) => {
  try {
    const id = decodeURIComponent(req.params["id"] as string);
    const source = await getSourceById(id);

    if (!source) {
      res.status(404).json({
        error: `Source "${id}" not found`,
        hint: "Use GET /api/sources to list all configured source IDs.",
      });
      return;
    }

    res.json(source);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "GET /sources/:id failed");
    res.status(500).json({ error: msg });
  }
});

export default router;
