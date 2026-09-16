/**
 * Admin Routes
 * ─────────────
 * Operator-facing endpoints. Authenticated with a Clerk session like every
 * other non-machine route — this is a single-user tool, so "admin" means the
 * signed-in owner rather than a role.
 *
 * POST /api/admin/verify-providers — live health audit of every provider config
 * POST /api/admin/backfill-location — recompute the normalised location columns
 * POST /api/admin/backfill-relevance — recompute the relevance track and score
 * POST /api/admin/generate-notifications — run the Phase 6.2 generator now
 * POST /api/admin/score-jobs — run the Phase 8 batch match scorer now
 *
 * Not in `lib/api-spec/openapi.yaml`: no browser code calls these, matching the
 * convention already used for the sync routes.
 */

import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { renderReport, runVerification } from "../providers/verify";
import {
  backfillLocations,
  locationBucketCountsFromDb,
} from "../relevance/backfill-location";
import {
  backfillRelevance,
  relevanceTrackCountsFromDb,
} from "../relevance/backfill-relevance";
import { generateNotifications } from "../notifications/generator";
import { parseLimit, runBatchScoringForOwner } from "./ai";

const router = Router();

// ─── POST /api/admin/verify-providers ─────────────────────────────────────────
// Issues one live request per config entry, including disabled ones, and
// reports what actually came back.
//
// WARNING: makes ~60 real outbound requests to third-party ATS APIs. POST
// rather than GET precisely so it cannot be triggered by a link, a prefetch or
// a browser's address bar.
//
// Pass ?format=markdown to get the exact text written to docs/provider-health.md,
// which is how the committed report is regenerated without a shell on the box.

router.post("/admin/verify-providers", requireAuth, async (req, res) => {
  try {
    const { results, summary } = await runVerification();

    if (req.query["format"] === "markdown") {
      res.type("text/markdown").send(renderReport(results, summary));
      return;
    }

    res.json({ summary, results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "POST /admin/verify-providers — audit failed");
    res.status(500).json({ error: msg });
  }
});

// ─── POST /api/admin/backfill-location ────────────────────────────────────────
// Recomputes location_city/_region/_country/_metro, is_india and is_remote
// for EVERY job row from its free-text `location`, 500 rows at a time. This is
// the only way to run the backfill on the deployed database — there is no
// shell on the Render box, and the tsx script cannot live in the server bundle
// (esbuild CLI-guard rule).
//
// Recompute-all and idempotent: the normaliser is deterministic, so running
// it twice writes the same values twice. Safe to call after every rules
// change. Touches nothing but the six derived columns — not `updatedAt`.
//
// ?dryRun=true computes and reports without writing.
//
// The response is the full bucket distribution, not just totals: the number
// that decides whether the tables need another pass is the unknown share of
// active rows, and the operator reading this has no other way to see it.

router.post("/admin/backfill-location", requireAuth, async (req, res) => {
  const dryRun = req.query["dryRun"] === "true";
  try {
    const report = await backfillLocations({ dryRun });
    // What the filter will actually see now, straight from the columns —
    // equals report.activeBuckets after a real run, and shows the pre-run
    // state after a dry run.
    const stored = await locationBucketCountsFromDb();
    res.json({ dryRun, ...report, storedActiveBuckets: stored });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "POST /admin/backfill-location — backfill failed");
    res.status(500).json({ error: msg });
  }
});

// ─── POST /api/admin/backfill-relevance ───────────────────────────────────────
// Classifies EVERY job row — relevance_track, relevance_score,
// is_fresher_eligible, seniority_excluded, relevance_signals, classified_at —
// 500 rows at a time. Same shape and same reasons as backfill-location above:
// no shell on Render, tsx script cannot live in the bundle, recompute-all and
// idempotent, touches only the six derived columns.
//
// Re-running it is also how the time-based modifiers (posted within 7 days,
// over 45 days) stay current for rows the sync no longer rewrites.
//
// ?dryRun=true computes and reports without writing.
// ?top=N      ranks N titles instead of 20 (max 200).
//
// The response carries the track distribution (all rows and active rows) and
// the top-N active titles by score with their signals — the ranking the
// operator sanity-checks after a rules change.

router.post("/admin/backfill-relevance", requireAuth, async (req, res) => {
  const dryRun = req.query["dryRun"] === "true";
  const topRaw = Number(req.query["top"]);
  const topN =
    Number.isInteger(topRaw) && topRaw >= 1 && topRaw <= 200 ? topRaw : 20;
  try {
    const report = await backfillRelevance({ dryRun, topN });
    // Straight from the stored columns — equals report.activeTracks after a
    // real run, and shows the pre-run state after a dry run.
    const stored = await relevanceTrackCountsFromDb();
    res.json({ dryRun, ...report, storedActiveTracks: stored });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "POST /admin/backfill-relevance — backfill failed");
    res.status(500).json({ error: msg });
  }
});

// ─── POST /api/admin/generate-notifications ───────────────────────────────────
// Runs the Phase 6.2 generator immediately, instead of waiting up to six hours
// for the next POST /api/sync/cron. Same reason the backfills have a route:
// there is no shell on the Render box.
//
// SAFE TO CALL REPEATEDLY. Every generated row carries a dedupe key and is
// inserted with ON CONFLICT DO NOTHING, so a second call within the same
// deadline window writes nothing. It reads jobs, applications, bookmarks and
// saved searches and writes only to `notifications`.
//
// Unlike /admin/verify-providers this makes no outbound requests at all.

router.post("/admin/generate-notifications", requireAuth, async (req, res) => {
  const report = await generateNotifications();
  if (report.error) {
    // generateNotifications never throws — it returns the failure. Surfaced as
    // a 500 here because, unlike the cron path, a caller who asked for this
    // explicitly wants to know it did not happen.
    req.log.error(
      { error: report.error },
      "POST /admin/generate-notifications — generation failed",
    );
    res.status(500).json(report);
    return;
  }
  res.json(report);
});

// ─── POST /api/admin/score-jobs ───────────────────────────────────────────────
// Runs the Phase 8 nightly batch scorer immediately, instead of waiting for
// .github/workflows/ai-batch.yml. Same reason the backfills have a route: there
// is no shell on the Render box.
//
// UNLIKE THE BACKFILLS, THIS ONE COSTS MONEY-EQUIVALENT QUOTA. Every job it
// scores is one Gemini request against a free-tier allowance measured at 15
// requests/minute, so it is not safe to call in a loop the way
// /admin/backfill-relevance is. It clamps itself to what is left of
// AI_DAILY_BUDGET in the rolling 24 hours and reports the spend.
//
// ?limit=N      score at most N jobs (1–200); default 50.
// ?dryRun=true  report which jobs WOULD be scored and make no requests at all.

router.post("/admin/score-jobs", requireAuth, async (req, res) => {
  try {
    const report = await runBatchScoringForOwner({
      ...(parseLimit(req.query["limit"]) !== undefined && {
        limit: parseLimit(req.query["limit"]) as number,
      }),
      dryRun: req.query["dryRun"] === "true",
    });
    res.json(report);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "POST /admin/score-jobs — batch scoring failed");
    res.status(500).json({ error: msg });
  }
});

export default router;
