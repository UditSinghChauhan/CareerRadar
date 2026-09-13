import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from "lucide-react";
import type { Application } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEADLINE_CLASSES,
  deadlineUrgency,
  formatDate,
  statusBadgeClass,
  statusLabel,
  statusRank,
  timestamp,
} from "./status";

export type TableSortKey =
  | "company"
  | "role"
  | "status"
  | "appliedDate"
  | "deadline"
  | "followUpDate";

export type SortDirection = "asc" | "desc";

const COLUMNS: Array<{ key: TableSortKey; label: string; className?: string }> =
  [
    { key: "company", label: "Company" },
    { key: "role", label: "Role" },
    { key: "status", label: "Status" },
    { key: "appliedDate", label: "Applied" },
    { key: "deadline", label: "Deadline" },
    { key: "followUpDate", label: "Next action" },
  ];

/**
 * Rows with no date always sort last, in BOTH directions — an application with
 * no deadline is neither the most urgent nor the least, and surfacing a block
 * of blanks at the top of a "latest first" sort is just noise.
 *
 * That is why direction is threaded into the comparator instead of the result
 * being negated or the array reversed: either of those would flip the
 * missing-last rule along with everything else.
 */
function compare(
  a: Application,
  b: Application,
  key: TableSortKey,
  direction: SortDirection,
): number {
  const flip = direction === "asc" ? 1 : -1;

  switch (key) {
    case "company":
      return (
        flip *
        (a.job?.company?.name ?? "").localeCompare(b.job?.company?.name ?? "")
      );
    case "role":
      return flip * (a.job?.title ?? "").localeCompare(b.job?.title ?? "");
    case "status":
      return flip * (statusRank(a.status) - statusRank(b.status));
    case "appliedDate":
      return compareDates(
        timestamp(a.appliedDate),
        timestamp(b.appliedDate),
        direction,
      );
    case "deadline":
      return compareDates(
        timestamp(a.job?.deadline),
        timestamp(b.job?.deadline),
        direction,
      );
    case "followUpDate":
      return compareDates(
        timestamp(a.followUpDate),
        timestamp(b.followUpDate),
        direction,
      );
  }
}

function compareDates(a: number, b: number, direction: SortDirection): number {
  const aMissing = Number.isNaN(a);
  const bMissing = Number.isNaN(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return direction === "asc" ? a - b : b - a;
}

export function sortApplications(
  applications: Application[],
  key: TableSortKey,
  direction: SortDirection,
): Application[] {
  return [...applications].sort((a, b) => compare(a, b, key, direction));
}

interface ApplicationTableProps {
  applications: Application[];
  sortKey: TableSortKey;
  sortDirection: SortDirection;
  onSortChange: (key: TableSortKey) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpen: (application: Application) => void;
}

export function ApplicationTable({
  applications,
  sortKey,
  sortDirection,
  onSortChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpen,
}: ApplicationTableProps) {
  const allSelected =
    applications.length > 0 && selectedIds.size === applications.length;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="w-8 px-2 py-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleSelectAll}
                aria-label="Select all applications"
              />
            </th>
            {COLUMNS.map((col) => {
              const active = sortKey === col.key;
              const Icon = !active
                ? ArrowUpDown
                : sortDirection === "asc"
                  ? ArrowUp
                  : ArrowDown;
              return (
                <th
                  key={col.key}
                  className="px-2 py-2 text-left font-semibold text-muted-foreground"
                >
                  <button
                    type="button"
                    onClick={() => onSortChange(col.key)}
                    aria-label={`Sort by ${col.label}`}
                    className={`flex items-center gap-1 transition-colors hover:text-foreground ${
                      active ? "text-foreground" : ""
                    }`}
                  >
                    {col.label}
                    <Icon className="h-3 w-3" />
                  </button>
                </th>
              );
            })}
            <th className="w-10 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => {
            const job = app.job;
            const urgency = deadlineUrgency(job?.deadline);
            const selected = selectedIds.has(app.id);
            return (
              <tr
                key={app.id}
                data-testid="application-row"
                data-applied-date={app.appliedDate ?? ""}
                onClick={() => onOpen(app)}
                className={`cursor-pointer border-t border-border transition-colors hover:bg-muted/30 ${
                  selected ? "bg-primary/5" : ""
                }`}
              >
                <td
                  className="px-2 py-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => onToggleSelect(app.id)}
                    aria-label={`Select ${job?.title ?? "application"}`}
                  />
                </td>
                <td className="max-w-40 truncate px-2 py-1.5 text-muted-foreground">
                  {job?.company?.name ?? "—"}
                </td>
                <td className="max-w-64 truncate px-2 py-1.5 font-medium text-foreground">
                  {job?.title ?? "Untitled role"}
                </td>
                <td className="px-2 py-1.5">
                  <Badge
                    variant="outline"
                    className={`h-4 px-1.5 text-[10px] font-medium ${statusBadgeClass(app.status)}`}
                  >
                    {statusLabel(app.status)}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                  {formatDate(app.appliedDate)}
                </td>
                <td
                  className={`whitespace-nowrap px-2 py-1.5 ${DEADLINE_CLASSES[urgency]}`}
                >
                  {formatDate(job?.deadline)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                  {formatDate(app.followUpDate)}
                </td>
                <td
                  className="px-2 py-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {job?.applyUrl && (
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open original posting"
                      className="text-muted-foreground transition-colors hover:text-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
