/**
 * Health routes
 * ─────────────
 * Two paths, one meaning:
 *
 *   GET /api/health   — the operator's route: the sync workflow's wake step,
 *                       CAREERRADAR_PHASE0_SETUP.md §D. Mounted in app.ts
 *                       BEFORE Clerk so a deploy health check needs no session.
 *   GET /api/healthz  — the spec'd route (openapi.yaml, Playwright webServer).
 *
 * Both consult the schema drift check (lib/schema-check.ts). A missing column
 * is a 503 with the exact columns and the file that adds them: a deploy whose
 * migration did not land turns red instead of serving 500s from /api/jobs
 * with a green health check, which is what happened in Phase 1.5 and 2.0.
 *
 * A database that cannot be reached is NOT a 503 here. That case is reported
 * as `schema: "unchecked"` with a 200 — Render's deploy health check must not
 * flap on a Neon blip, and a cold-started service must be able to answer
 * before its first pooled connection is up.
 *
 * DETAIL (Phase 9): `?detail=1` adds a `sync` object — last successful sync,
 * and per-provider ingestion state read from `provider_sync_logs`. It is a
 * query parameter rather than the default body for two reasons. The default
 * body is a published contract that two automated callers already parse, and
 * both of those callers hit a COLD instance where two extra aggregate queries
 * are latency spent for nothing. See providers/sync-status.ts.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { currentSchemaStatus } from "../lib/schema-check";
import { getSyncStatus } from "../providers/sync-status";

const router: IRouter = Router();

/**
 * `?detail=1`, `?detail=true`, or a bare `?detail`. Anything else — including
 * `?detail=0` and `?detail=false` — is off, so a caller that passes a flag
 * through from a config file cannot turn detail on by accident.
 */
export function wantsDetail(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "") return true; // bare ?detail
  return value === "1" || value === "true";
}

async function respond(
  req: Request,
  res: Response,
  shape: (schemaStatus: string) => Record<string, unknown>,
): Promise<void> {
  const schema = await currentSchemaStatus();
  // Read the sync log only when asked, and only when the schema is not
  // drifted: querying provider_sync_logs against a schema the code disagrees
  // with can only produce a second, less useful error on top of the first.
  const detail =
    wantsDetail(req.query["detail"]) && schema.status !== "drift"
      ? { sync: await getSyncStatus() }
      : {};

  if (schema.status === "drift") {
    res.status(503).json({
      ...shape("drift"),
      ok: false,
      status: "schema_drift",
      drift: schema.drift,
      hint: schema.hint,
      checkedAt: schema.checkedAt,
    });
    return;
  }
  res.json({ ...shape(schema.status), ...detail });
}

/** GET /api/health — kept byte-compatible with the pre-existing body, plus `schema`. */
export async function healthHandler(req: Request, res: Response) {
  await respond(req, res, (schemaStatus) => ({
    ok: true,
    status: "running",
    schema: schemaStatus,
  }));
}

router.get("/healthz", async (req, res) => {
  await respond(req, res, (schemaStatus) =>
    HealthCheckResponse.parse({ status: "ok", schema: schemaStatus }),
  );
});

export default router;
