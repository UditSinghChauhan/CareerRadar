/**
 * Which graduation year the classifier scores against.
 * ───────────────────────────────────────────────────────
 * `classifyJob()` runs at ingest time, per job, not per viewer — so the batch
 * modifiers (+10 for a matching year, −40 for an explicitly excluding one)
 * need one year to compare against. This is a single-user tool: the year is
 * the profile's `graduationYear`, read once and cached for the length of a
 * sync run.
 *
 * `RELEVANCE_GRADUATION_YEAR` overrides it for the case where no profile has
 * been created yet (a fresh deployment classifying its first sync) or where
 * the operator wants to score for a different batch. Neither being set means
 * no batch modifier fires at all — the score is then user-agnostic, never
 * wrong.
 */

import { desc, isNotNull } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
import { logger } from "../lib/logger";

const CACHE_TTL_MS = 10 * 60 * 1000;

let cached: { value: number | null; at: number } | null = null;

function fromEnv(): number | null {
  const raw = process.env["RELEVANCE_GRADUATION_YEAR"];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
}

/**
 * The year to score against, or null when nothing is known. Never throws:
 * a database blip must not stop a sync from classifying — it just scores
 * without the batch modifiers for that run.
 */
export async function resolveGraduationYear(): Promise<number | null> {
  const env = fromEnv();
  if (env !== null) return env;

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  try {
    const [row] = await db
      .select({ graduationYear: profilesTable.graduationYear })
      .from(profilesTable)
      .where(isNotNull(profilesTable.graduationYear))
      // The most recently edited profile, for the (theoretical) multi-user case.
      .orderBy(desc(profilesTable.updatedAt), desc(profilesTable.createdAt))
      .limit(1);
    cached = { value: row?.graduationYear ?? null, at: Date.now() };
  } catch (err) {
    logger.warn(
      { err },
      "Could not read graduationYear from profiles — classifying without batch modifiers",
    );
    cached = { value: null, at: Date.now() };
  }
  return cached.value;
}

/** Tests and the backfill's fresh-start path. */
export function resetGraduationYearCache(): void {
  cached = null;
}
