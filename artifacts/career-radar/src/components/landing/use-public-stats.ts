import { useEffect, useState } from "react";
import { getPublicStats } from "@workspace/api-client-react";

/**
 * The committed figures, shown until (or instead of) the live ones.
 * Read from the production GET /api/public/stats on 2026-11-03: 6,034
 * active postings, 3,119 open to freshers. The page never prints that date.
 */
export const COMMITTED_STATS = { activePostings: 6034, openToFreshers: 3119 };

/** A daily queue is ten roles (DEFAULT_DAILY_TARGET in api-server). */
export const QUEUE_SIZE = 10;

export type LandingStats = {
  activePostings: number;
  openToFreshers: number;
  /** True only when the figures came from GET /api/public/stats. */
  live: boolean;
};

const FALLBACK: LandingStats = { ...COMMITTED_STATS, live: false };

/** Live figures are used only when they are plausible; zero is an outage, not news. */
export function acceptStats(body: unknown): LandingStats | null {
  if (!body || typeof body !== "object") return null;
  const { activePostings, openToFreshers } = body as Record<string, unknown>;
  if (
    typeof activePostings !== "number" ||
    typeof openToFreshers !== "number" ||
    !Number.isInteger(activePostings) ||
    !Number.isInteger(openToFreshers) ||
    openToFreshers < QUEUE_SIZE ||
    activePostings < openToFreshers
  ) {
    return null;
  }
  return { activePostings, openToFreshers, live: true };
}

// One request per page load, shared by every component that shows a count.
let pending: Promise<LandingStats> | null = null;

function load(): Promise<LandingStats> {
  pending ??= getPublicStats({ signal: AbortSignal.timeout(8000) })
    .then((body) => acceptStats(body) ?? FALLBACK)
    .catch(() => FALLBACK);
  return pending;
}

/** Test hook: forget the shared request. */
export function resetPublicStats() {
  pending = null;
}

/**
 * Committed figures at once, live ones when the API answers. A failed or slow
 * request (8s) keeps the committed figures and never shows "Live".
 */
export function usePublicStats(): LandingStats {
  const [stats, setStats] = useState<LandingStats>(FALLBACK);
  useEffect(() => {
    let cancelled = false;
    void load().then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return stats;
}
