/**
 * Admin Routes
 * ─────────────
 * Operator-facing endpoints. Authenticated with a Clerk session like every
 * other non-machine route — this is a single-user tool, so "admin" means the
 * signed-in owner rather than a role.
 *
 * POST /api/admin/verify-providers — live health audit of every provider config
 *
 * Not in `lib/api-spec/openapi.yaml`: no browser code calls these, matching the
 * convention already used for the sync routes.
 */

import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { renderReport, runVerification } from "../providers/verify";

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

export default router;
