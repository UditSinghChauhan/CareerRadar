/**
 * The deadline reminder buckets (Phase 6.2).
 *
 * UPGRADE.md §6.2 asks for a reminder "at 72h and 24h before a deadline". The
 * sync that drives generation runs every six hours, so "at 72h" cannot mean an
 * instant — nothing is running at that instant. It means the first pass that
 * sees the deadline inside that window, which is why each bucket is a range
 * `(now, now + hours]` and why every generated row carries a dedupe key: the
 * next four passes see the same job in the same window and must not announce
 * it again.
 *
 * ORDER MATTERS: narrowest first. A job 20 hours out is inside both windows,
 * and the 24h wording ("tomorrow") is the more useful of the two, so it wins.
 * It will normally already have had its 72h reminder from an earlier pass;
 * if it was saved late and never did, the 24h one is the right single alert.
 */
export interface DeadlineBucket {
  /** Suffix of the dedupe key, e.g. `deadline:<jobId>:24h`. */
  readonly id: "24h" | "72h";
  readonly hours: number;
  readonly label: string;
}

export const DEADLINE_BUCKETS = [
  { id: "24h", hours: 24, label: "closes within 24 hours" },
  { id: "72h", hours: 72, label: "closes within 3 days" },
] as const satisfies readonly DeadlineBucket[];

/**
 * The narrowest bucket a deadline falls into, or null.
 *
 * A deadline already past returns null: the job is over, and an alert about it
 * is noise at the exact moment the user can do nothing. The staleness sweep
 * closes those rows anyway.
 */
export function bucketFor(
  deadline: Date | null | undefined,
  now: Date,
): DeadlineBucket | null {
  if (!deadline) return null;
  const ms = deadline.getTime() - now.getTime();
  if (Number.isNaN(ms) || ms <= 0) return null;
  const hours = ms / (1000 * 60 * 60);
  for (const bucket of DEADLINE_BUCKETS) {
    if (hours <= bucket.hours) return bucket;
  }
  return null;
}

export function deadlineDedupeKey(jobId: string, bucketId: string): string {
  return `deadline:${jobId}:${bucketId}`;
}

export function newJobDedupeKey(savedSearchId: string, jobId: string): string {
  return `new_job:${savedSearchId}:${jobId}`;
}
