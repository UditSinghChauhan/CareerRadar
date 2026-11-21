/**
 * Time left until a posting closes, counted one way everywhere in the app
 * and the same way as the server's queue reasons
 * (api-server/src/queue/priority.ts, explainPriority): whole days remaining,
 * rounded down. Before this, four places counted four ways (ceil, floor,
 * date-fns truncation, and the server's floor), so one posting read
 * "2d left", "1d to go" and "Closes tomorrow" on the same dashboard.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export type DeadlineUrgency = "closed" | "critical" | "soon" | "normal";

export interface DeadlineInfo {
  /** Whole days left, rounded down; negative once closed. */
  days: number;
  /** "Closes today", "Closes tomorrow", "4d left", or "Closed". */
  label: string;
  urgency: DeadlineUrgency;
}

export function deadlineInfo(
  deadline: string | Date,
  now: Date = new Date(),
): DeadlineInfo {
  const msLeft = new Date(deadline).getTime() - now.getTime();
  if (msLeft < 0) return { days: -1, label: "Closed", urgency: "closed" };
  const days = Math.floor(msLeft / DAY_MS);
  const label =
    days < 1 ? "Closes today" : days < 2 ? "Closes tomorrow" : `${days}d left`;
  const urgency: DeadlineUrgency =
    days <= 3 ? "critical" : days <= 7 ? "soon" : "normal";
  return { days, label, urgency };
}

/** Text colour for a deadline's urgency, in the app's tokens. */
export const URGENCY_TEXT: Record<DeadlineUrgency, string> = {
  closed: "text-muted-foreground",
  critical: "text-destructive",
  soon: "text-amber-700 dark:text-amber-400",
  normal: "text-muted-foreground",
};
