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

/** The first request's limit: an awake API answers well inside it. */
export const FIRST_WAIT_MS = 8000;
/**
 * The second request's limit. The API's host puts it to sleep when idle and
 * takes up to about a minute to wake it (docs/DEPLOY.md); the static site's
 * proxy waits up to 120s. The committed figures stay on screen meanwhile.
 */
export const WAKE_WAIT_MS = 90000;

const attempt = (ms: number) =>
  getPublicStats({ signal: AbortSignal.timeout(ms) })
    .then((body) => acceptStats(body))
    .catch(() => null);

// At most two requests per page load, shared by every component that shows
// a count: if the first meets a sleeping API (a timeout, an error, or the
// host's wake-up page instead of JSON), one more waits for it to wake.
let pending: Promise<LandingStats> | null = null;

function load(): Promise<LandingStats> {
  pending ??= attempt(FIRST_WAIT_MS)
    .then((first) => first ?? attempt(WAKE_WAIT_MS))
    .then((stats) => stats ?? FALLBACK);
  return pending;
}

/** Test hook: forget the shared request. */
export function resetPublicStats() {
  pending = null;
}

/**
 * Committed figures at once, live ones when the API answers, even if it was
 * asleep and takes a minute to wake. Nothing waits on it: the page renders
 * in full with the committed figures, and the live ones swap in quietly
 * (same digits, tabular figures, "Live" in the label's own line). If both
 * requests fail, the committed figures stay and "Live" never shows.
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
