/**
 * GET /api/public/stats
 * ─────────────────────
 * The landing page's live figures: how many postings are active, how many of
 * those the fresher classifier marked eligible, and when a provider last
 * synced successfully. No session needed; nothing user-specific is read.
 *
 * Cached in process for ten minutes. The landing page is the busiest
 * unauthenticated route, and two COUNTs over `jobs` per visit would be work
 * spent on a number that only changes when a sync runs (every six hours).
 * A failed read is a 503, never a cached zero: the page falls back to its
 * committed figures instead of announcing that nothing is open.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db, jobsTable, providerSyncLogsTable } from "@workspace/db";

/** The wire shape of `PublicStats` in openapi.yaml; the date travels as ISO text. */
export interface PublicStatsBody {
  activePostings: number;
  openToFreshers: number;
  lastSyncedAt: string | null;
}

export const PUBLIC_STATS_TTL_MS = 10 * 60 * 1000;

let cache: { at: number; body: PublicStatsBody } | null = null;

/** Test hook: forget the cached figures. */
export function resetPublicStatsCache() {
  cache = null;
}

export async function readPublicStats(): Promise<PublicStatsBody> {
  const [counts] = await db
    .select({
      active: sql<number>`count(*)::int`,
      freshers: sql<number>`count(*) filter (where ${jobsTable.isFresherEligible})::int`,
    })
    .from(jobsTable)
    .where(eq(jobsTable.status, "active"));
  const [sync] = await db
    .select({
      at: sql<Date | string | null>`max(${providerSyncLogsTable.startedAt})`,
    })
    .from(providerSyncLogsTable)
    .where(eq(providerSyncLogsTable.status, "success"));
  const at = sync?.at ? new Date(sync.at) : null;
  return {
    activePostings: Number(counts?.active ?? 0),
    openToFreshers: Number(counts?.freshers ?? 0),
    lastSyncedAt: at ? at.toISOString() : null,
  };
}

export async function publicStatsHandler(req: Request, res: Response) {
  const now = Date.now();
  try {
    if (!cache || now - cache.at >= PUBLIC_STATS_TTL_MS) {
      cache = { at: now, body: await readPublicStats() };
    }
    const age = Math.floor((now - cache.at) / 1000);
    res.setHeader(
      "Cache-Control",
      `public, max-age=${Math.max(0, PUBLIC_STATS_TTL_MS / 1000 - age)}`,
    );
    res.json(cache.body);
  } catch (err) {
    req.log?.error({ err }, "Failed to read public stats");
    res.status(503).json({ error: "Stats are unavailable right now" });
  }
}

const router: IRouter = Router();
router.get("/public/stats", publicStatsHandler);
export default router;
