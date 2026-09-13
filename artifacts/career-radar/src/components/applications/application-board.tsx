import { useState } from "react";
import { Clock, GripVertical } from "lucide-react";
import type { Application } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import {
  STATUS_ORDER,
  STATUS_LABELS,
  DEADLINE_CLASSES,
  deadlineUrgency,
  formatDate,
  type BoardStatus,
} from "./status";

interface ApplicationBoardProps {
  applications: Application[];
  onStatusChange: (id: string, status: BoardStatus) => void;
  onOpen: (application: Application) => void;
}

export function groupByStatus(
  applications: Application[],
): Record<BoardStatus, Application[]> {
  const groups = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, [] as Application[]]),
  ) as Record<BoardStatus, Application[]>;

  for (const app of applications) {
    const bucket = groups[app.status as BoardStatus];
    // An unknown status (e.g. a value added to the enum before this build
    // shipped) must not silently vanish from the board — park it in "saved".
    if (bucket) bucket.push(app);
    else groups.saved.push(app);
  }
  return groups;
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function BoardCard({
  application,
  onOpen,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  application: Application;
  onOpen: (application: Application) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const job = application.job;
  const company = job?.company;
  const urgency = deadlineUrgency(job?.deadline);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(application)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(application);
        }
      }}
      role="button"
      tabIndex={0}
      data-testid="board-card"
      data-application-id={application.id}
      aria-label={`${job?.title ?? "Application"} at ${company?.name ?? "unknown company"}`}
      className={`group cursor-pointer rounded-lg border border-border bg-card p-2.5 text-left transition-all hover:border-primary/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        {company?.logoUrl ? (
          <img
            src={company.logoUrl}
            alt=""
            className="h-6 w-6 shrink-0 rounded border border-border bg-background object-contain"
          />
        ) : (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-primary/10">
            <span className="text-[9px] font-bold text-primary">
              {initials(company?.name ?? job?.title ?? "?")}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-muted-foreground">
            {company?.name ?? "—"}
          </p>
          <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
            {job?.title ?? "Untitled role"}
          </p>
        </div>
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/60" />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {application.appliedDate
            ? formatDate(application.appliedDate)
            : "Not applied"}
        </span>
        {urgency !== "none" && (
          <span
            className={`flex items-center gap-0.5 text-[10px] ${DEADLINE_CLASSES[urgency]}`}
          >
            <Clock className="h-2.5 w-2.5" />
            {formatDate(job?.deadline)}
          </span>
        )}
      </div>
    </div>
  );
}

export function ApplicationBoard({
  applications,
  onStatusChange,
  onOpen,
}: ApplicationBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<BoardStatus | null>(
    null,
  );

  const groups = groupByStatus(applications);

  const handleDrop = (status: BoardStatus) => {
    setDragOverStatus(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;

    const current = applications.find((a) => a.id === id);
    // Dropping a card back in its own column is a no-op, not a PUT.
    if (!current || current.status === status) return;
    onStatusChange(id, status);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {STATUS_ORDER.map((status) => {
        const items = groups[status];
        const isTarget = dragOverStatus === status;
        return (
          <div
            key={status}
            data-testid={`board-column-${status}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverStatus(status);
            }}
            onDragLeave={(e) => {
              // Ignore bubbling leaves from child cards.
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setDragOverStatus((s) => (s === status ? null : s));
            }}
            onDrop={() => handleDrop(status)}
            className={`flex w-60 shrink-0 flex-col rounded-lg border bg-muted/20 transition-colors ${
              isTarget ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold text-foreground">
                {STATUS_LABELS[status]}
              </span>
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[10px] font-medium"
              >
                {items.length}
              </Badge>
            </div>

            <div className="flex min-h-24 flex-col gap-2 p-2">
              {items.map((app) => (
                <BoardCard
                  key={app.id}
                  application={app}
                  onOpen={onOpen}
                  isDragging={draggingId === app.id}
                  onDragStart={() => setDraggingId(app.id)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverStatus(null);
                  }}
                />
              ))}
              {items.length === 0 && (
                <p className="px-1 py-4 text-center text-[11px] text-muted-foreground/60">
                  Drop here
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
