/**
 * Cron trigger authentication
 * ────────────────────────────
 * `POST /api/sync/cron` is the one route in this server that deliberately
 * bypasses Clerk. It is machine-to-machine: a GitHub Actions scheduled workflow
 * calls it every 6 hours because Render's free tier has no cron and the
 * in-process `setInterval` scheduler dies with each spin-down. A browser session
 * cookie is not available to a CI runner, so the route is gated on a shared
 * secret instead.
 *
 * WHY THIS IS NOT A `===` COMPARISON
 * ───────────────────────────────────
 * String equality in V8 returns as soon as two bytes differ, so the time it
 * takes to reject a guess leaks how many leading bytes were right. That turns
 * secret recovery into a per-character search rather than a search of the whole
 * keyspace. `crypto.timingSafeEqual` compares every byte regardless.
 *
 * WHY THE SHA-256 HASH FIRST
 * ───────────────────────────
 * `timingSafeEqual` throws a RangeError when the two buffers differ in length,
 * and catching that would reintroduce the exact leak we are removing — the
 * length of the real secret. Hashing both sides to a fixed 32 bytes makes every
 * comparison the same width, so an attacker learns nothing from a wrong-length
 * guess either.
 *
 * FAIL CLOSED
 * ────────────
 * An unset `SYNC_CRON_SECRET` rejects every request. The alternative — treating
 * "no secret configured" as "no authentication required" — would leave the
 * route wide open on any deployment where the env var was forgotten, and the
 * route starts a full sync across every provider config.
 */

import { createHash, timingSafeEqual } from "node:crypto";

export type CronAuthFailure =
  /** `SYNC_CRON_SECRET` is unset or empty in the server environment. */
  | "secret-not-configured"
  /** The request carried no `x-cron-secret` header, or it was empty. */
  | "header-missing"
  /** A secret was supplied and it did not match. */
  | "secret-mismatch";

export type CronAuthResult =
  | { ok: true }
  | { ok: false; reason: CronAuthFailure };

/** Fixed-width digest so every comparison costs the same regardless of input length. */
function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Check a caller-supplied `x-cron-secret` against `SYNC_CRON_SECRET`.
 *
 * @param provided  Raw header value. Express gives `string | string[] | undefined`;
 *                  an array (a repeated header) is never valid here and is rejected.
 * @param configured Defaults to `process.env.SYNC_CRON_SECRET`. Injectable for tests.
 */
export function verifyCronSecret(
  provided: string | string[] | undefined,
  configured: string | undefined = process.env["SYNC_CRON_SECRET"],
): CronAuthResult {
  if (!configured) {
    return { ok: false, reason: "secret-not-configured" };
  }

  // A repeated header arrives as an array. Rather than pick one, reject it:
  // an honest client sends exactly one.
  if (typeof provided !== "string" || provided.length === 0) {
    return { ok: false, reason: "header-missing" };
  }

  return timingSafeEqual(digest(provided), digest(configured))
    ? { ok: true }
    : { ok: false, reason: "secret-mismatch" };
}
