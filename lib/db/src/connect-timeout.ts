/**
 * How long may a connection attempt hang?
 * ────────────────────────────────────────
 * node-postgres defaults `connectionTimeoutMillis` to 0, which means "wait
 * forever" — the attempt ends only when the kernel gives up on the TCP
 * handshake, roughly two minutes later, with a bare `ETIMEDOUT` and no
 * indication of what was being attempted. That is what the stale-jobs backfill
 * hit against Neon: it looked like a hang, not like a failure.
 *
 * libpq behaves differently, which is why `psql` on the identical URL feels
 * instant even when something is wrong: its `connect_timeout` bounds each
 * address attempt, and it walks every A/AAAA record in turn rather than
 * committing to one.
 *
 * A bounded deadline does not make a broken network work. It makes the failure
 * arrive while the operator is still watching, with a message, which is the
 * difference between a bug report and a shrug.
 *
 * THE DEFAULT IS DELIBERATELY GENEROUS. Neon suspends an idle compute and the
 * first connection after that has to wait for it to start, which can take
 * several seconds; Render's free tier wakes just as slowly. 30s is far above
 * both and far below the kernel's ~127s, so this bounds the pathological case
 * without touching the normal one.
 */

/** Neon cold starts are seconds; the kernel's own timeout is ~127s. */
export const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;

/**
 * `DATABASE_CONNECT_TIMEOUT_MS`, defaulting to 30s.
 *
 * `0` is honoured and restores node-postgres's wait-forever behaviour, as an
 * escape hatch for a pathologically slow environment. Anything unparseable or
 * negative falls back to the default rather than throwing — this runs at import
 * time in the server bundle, and a typo in an env var must not stop the process
 * from booting.
 */
export function getConnectTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env["DATABASE_CONNECT_TIMEOUT_MS"];
  if (raw === undefined || raw.trim() === "") return DEFAULT_CONNECT_TIMEOUT_MS;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_CONNECT_TIMEOUT_MS;
  return parsed;
}
