import type { ApplicationStatus } from "@workspace/api-client-react";

// Column order on the board, and the order used by the "status" table sort.
// Matches applicationStatusEnum in lib/db/src/schema/enums.ts exactly.
export const STATUS_ORDER = [
  "saved",
  "applied",
  "oa_pending",
  "oa_completed",
  "interview_pending",
  "interview_completed",
  "offered",
  "rejected",
  "withdrawn",
] as const satisfies readonly ApplicationStatus[];

export type BoardStatus = (typeof STATUS_ORDER)[number];

/**
 * The board's columns: six stages, each holding one or two statuses, so the
 * whole pipeline fits on one screen (nine columns of 240px scrolled off the
 * edge at 1280px). A card dropped on a column takes the column's `drop`
 * status; a card already in that stage keeps its finer status.
 */
export const BOARD_STAGES = [
  { key: "saved", label: "Saved", statuses: ["saved"], drop: "saved" },
  { key: "applied", label: "Applied", statuses: ["applied"], drop: "applied" },
  {
    key: "assessment",
    label: "Assessment",
    statuses: ["oa_pending", "oa_completed"],
    drop: "oa_pending",
  },
  {
    key: "interview",
    label: "Interview",
    statuses: ["interview_pending", "interview_completed"],
    drop: "interview_pending",
  },
  { key: "offer", label: "Offer", statuses: ["offered"], drop: "offered" },
  {
    key: "closed",
    label: "Closed",
    statuses: ["rejected", "withdrawn"],
    drop: "rejected",
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  statuses: readonly BoardStatus[];
  drop: BoardStatus;
}>;

export type BoardStage = (typeof BOARD_STAGES)[number];

/** The stage a status belongs to; an unknown status parks in Saved. */
export function stageOf(status: string): BoardStage {
  return (
    BOARD_STAGES.find((s) =>
      (s.statuses as readonly string[]).includes(status),
    ) ?? BOARD_STAGES[0]
  );
}

export const STATUS_LABELS: Record<BoardStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  oa_pending: "OA pending",
  oa_completed: "OA done",
  interview_pending: "Interview",
  interview_completed: "Interviewed",
  offered: "Offered",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

// One status, one look, everywhere (board, table, drawer, the dashboard's
// recent applications). Neutral while a search is in motion; colour only for
// the two outcomes: green for an offer, red for a rejection.
export const STATUS_BADGE_CLASSES: Record<BoardStatus, string> = {
  saved: "bg-secondary text-muted-foreground border-border",
  applied: "bg-secondary text-foreground border-border",
  oa_pending: "bg-transparent text-foreground border-foreground/25",
  oa_completed: "bg-transparent text-foreground border-foreground/25",
  interview_pending:
    "bg-foreground/[0.07] text-foreground border-foreground/25",
  interview_completed:
    "bg-foreground/[0.07] text-foreground border-foreground/25",
  offered: "bg-primary/10 text-primary border-primary/25",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  withdrawn: "bg-secondary text-muted-foreground border-border",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as BoardStatus] ?? status;
}

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASSES[status as BoardStatus] ?? "";
}

export function statusRank(status: string): number {
  const i = STATUS_ORDER.indexOf(status as BoardStatus);
  return i === -1 ? STATUS_ORDER.length : i;
}

// ─── Deadline urgency ─────────────────────────────────────────────────────────

export type DeadlineUrgency =
  | "none"
  | "expired"
  | "critical"
  | "soon"
  | "normal";

/**
 * Phase 1 asks for deadlines "red under 72h". Anything inside three days —
 * including already-expired — reads as critical so it cannot be skimmed past.
 */
export function deadlineUrgency(
  deadline: string | null | undefined,
  now: number = Date.now(),
): DeadlineUrgency {
  if (!deadline) return "none";
  const ms = new Date(deadline).getTime() - now;
  if (Number.isNaN(ms)) return "none";
  if (ms < 0) return "expired";
  const hours = ms / (1000 * 60 * 60);
  if (hours <= 72) return "critical";
  if (hours <= 24 * 7) return "soon";
  return "normal";
}

export const DEADLINE_CLASSES: Record<DeadlineUrgency, string> = {
  none: "text-muted-foreground",
  expired: "text-muted-foreground line-through",
  critical: "text-destructive font-medium",
  soon: "text-amber-500 dark:text-amber-400",
  normal: "text-muted-foreground",
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** `YYYY-MM-DD` for <input type="date">, which rejects a full ISO string. */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Inverse of toDateInputValue.
 *
 * An emptied input returns `null`, NOT `undefined`, and the difference is the
 * whole point: the API reads `undefined` as "the caller did not mention this
 * field" and skips the column, so the old value survives. Until Phase 6.1 this
 * returned `undefined` and its docstring claimed it cleared the field — it
 * never did, and a follow-up date could be set but never unset. Phase 6.1's
 * "Awaiting follow-up" filter turned that from a curiosity into a row stuck in
 * the view forever.
 *
 * An unparsable value is also `null`: `<input type="date">` only ever hands
 * back `""` or a valid `YYYY-MM-DD`, so the only way to get here with garbage
 * is a value the user cannot have meant.
 */
export function fromDateInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function timestamp(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  return new Date(iso).getTime();
}
