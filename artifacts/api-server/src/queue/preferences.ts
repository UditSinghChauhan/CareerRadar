/**
 * Onboarding preferences in Today's ten
 * ─────────────────────────────────────
 * A new account answers one question after sign-up: which roles (internship,
 * new grad, or both) and which cities. The queue then puts the roles that
 * match first.
 *
 * ORDER, NOT FILTER
 * ─────────────────
 * A preference never empties the queue. Matching roles rank first, by the
 * usual priority; if fewer than ten match, the best of the rest fill the
 * remaining rows, and each of those says why it is there anyway ("In Pune,
 * outside your cities"). A strict filter would hand a student who picked one
 * small city an empty list on their first morning, which is the opposite of
 * what onboarding is for. The priority score itself is unchanged, so the
 * scoring code and its tests are untouched: the preference is a tier above
 * it in the ORDER BY, and deterministic.
 */
import { sql, type SQL } from "drizzle-orm";
import { jobsTable, type Job } from "@workspace/db/schema";

export type RolePreference = "internship" | "new_grad" | "both";

export interface QueuePreferences {
  rolePreference: RolePreference | null;
  preferredLocations: string[];
}

/** The metros the onboarding step offers, as jobs.location_metro stores them. */
export const PREFERRED_METROS = [
  "Bengaluru",
  "Hyderabad",
  "Pune",
  "Chennai",
  "NCR",
  "MMR",
  "Kolkata",
  "Ahmedabad",
] as const;

/** How a metro reads in a sentence. */
const METRO_LABEL: Record<string, string> = { NCR: "Delhi NCR", MMR: "Mumbai" };

interface Wanted {
  jobType: "internship" | "full_time" | null;
  metros: string[];
  remote: boolean;
  /** False when the user named no cities, or chose "Anywhere in India". */
  hasLocation: boolean;
}

function wanted(prefs: QueuePreferences | null | undefined): Wanted | null {
  if (!prefs) return null;
  const jobType =
    prefs.rolePreference === "internship"
      ? "internship"
      : prefs.rolePreference === "new_grad"
        ? "full_time"
        : null;
  const locs = prefs.preferredLocations;
  const anywhere = locs.length === 0 || locs.includes("anywhere");
  const metros = anywhere
    ? []
    : locs.filter((l) => (PREFERRED_METROS as readonly string[]).includes(l));
  const remote = !anywhere && locs.includes("remote");
  const hasLocation = !anywhere && (metros.length > 0 || remote);
  if (!jobType && !hasLocation) return null;
  return { jobType, metros, remote, hasLocation };
}

/**
 * 1 when a row matches the user's preferences, 0 when it does not. Null when
 * the user has no preference, so the caller can leave the ORDER BY alone.
 */
export function preferenceMatchSql(
  prefs: QueuePreferences | null | undefined,
): SQL | null {
  const w = wanted(prefs);
  if (!w) return null;
  const parts: SQL[] = [];
  if (w.jobType) parts.push(sql`${jobsTable.jobType} = ${w.jobType}`);
  if (w.hasLocation) {
    const where: SQL[] = [];
    if (w.metros.length > 0) {
      where.push(
        sql`${jobsTable.locationMetro} in (${sql.join(
          w.metros.map((m) => sql`${m}`),
          sql`, `,
        )})`,
      );
    }
    if (w.remote) where.push(sql`${jobsTable.isRemote} = true`);
    parts.push(sql`(${sql.join(where, sql` or `)})`);
  }
  return sql`(case when ${sql.join(parts, sql` and `)} then 1 else 0 end)`;
}

/**
 * Why a row that does not match is in the queue anyway, in the voice of the
 * other reasons. Null when it matches, or when there is no preference.
 */
export function preferenceMiss(
  job: Pick<Job, "jobType" | "locationMetro" | "locationCity" | "isRemote">,
  prefs: QueuePreferences | null | undefined,
): string | null {
  const w = wanted(prefs);
  if (!w) return null;
  if (w.jobType && job.jobType !== w.jobType) {
    return w.jobType === "internship"
      ? "Full-time, not an internship"
      : "An internship, not a new grad role";
  }
  if (w.hasLocation) {
    const inCity =
      job.locationMetro != null && w.metros.includes(job.locationMetro);
    const remoteOk = w.remote && job.isRemote;
    if (!inCity && !remoteOk) {
      if (job.isRemote) return "Remote, outside your cities";
      const place =
        (job.locationMetro && METRO_LABEL[job.locationMetro]) ??
        job.locationCity ??
        job.locationMetro;
      return place ? `In ${place}, outside your cities` : "Outside your cities";
    }
  }
  return null;
}
