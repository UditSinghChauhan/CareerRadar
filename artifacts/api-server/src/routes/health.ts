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
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { currentSchemaStatus } from "../lib/schema-check";

const router: IRouter = Router();

async function respond(
  res: Response,
  shape: (schemaStatus: string) => Record<string, unknown>,
): Promise<void> {
  const schema = await currentSchemaStatus();
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
  res.json(shape(schema.status));
}

/** GET /api/health — kept byte-compatible with the pre-existing body, plus `schema`. */
export async function healthHandler(_req: Request, res: Response) {
  await respond(res, (schemaStatus) => ({
    ok: true,
    status: "running",
    schema: schemaStatus,
  }));
}

router.get("/healthz", async (_req, res) => {
  await respond(res, (schemaStatus) =>
    HealthCheckResponse.parse({ status: "ok", schema: schemaStatus }),
  );
});

export default router;
