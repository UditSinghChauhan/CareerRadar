/**
 * Admin Routes
 * ─────────────
 * Operator-facing endpoints. Authenticated with a Clerk session like every
 * other non-machine route — this is a single-user tool, so "admin" means the
 * signed-in owner rather than a role.
 *
 * POST /api/admin/verify-providers — live health audit of every provider config
 * POST /api/admin/backfill-location — recompute the normalised location columns
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

export default router;
