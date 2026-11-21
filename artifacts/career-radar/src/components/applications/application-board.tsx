import { useState } from "react";
import { Clock, GripVertical } from "lucide-react";
import type { Application } from "@workspace/api-client-react";
import { CompanyMark } from "@/components/company-mark";
import {
  BOARD_STAGES,
  STATUS_ORDER,
  STATUS_LABELS,
  stageOf,
  type BoardStage,
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
      {/* The company on top, the title across the card's full width below:
          beside the logo, titles clipped to a word at 150px columns. */}
      <div className="flex items-center gap-2">
        <CompanyMark
          name={company?.name ?? job?.title}
          logoUrl={company?.logoUrl}
          size="xs"
        />
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {company?.name ?? "—"}
        </p>
        <GripVertical
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/60"
        />
      </div>
      <p className="mt-1.5 line-clamp-3 text-[13px] font-medium leading-snug text-foreground">
        {job?.title ?? "Untitled role"}
      </p>

      {/* The finer status, where the column holds two (OA done in
          Assessment, Interviewed in Interview, Withdrawn in Closed). */}
      {application.status !== stageOf(application.status).drop && (
        <span className="mt-2 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
          {STATUS_LABELS[application.status as BoardStatus] ??
            application.status}
        </span>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-[11px] text-muted-foreground">
          {application.appliedDate
            ? formatDate(application.appliedDate)
            : "Not applied"}
        </span>
        {urgency !== "none" && (
          <span
            className={`flex items-center gap-0.5 text-[11px] ${DEADLINE_CLASSES[urgency]}`}
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
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const groups = groupByStatus(applications);

  const handleDrop = (stage: BoardStage) => {
    setDragOverStage(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;

    const current = applications.find((a) => a.id === id);
    // A card dropped back in its own stage keeps its status: no PUT.
    if (!current || stageOf(current.status).key === stage.key) return;
    onStatusChange(id, stage.drop);
  };

  return (
    // Six columns that share the width once there is room for them (1240px:
    // the sidebar, padding and six 140px columns). Narrower, they scroll
    // sideways and snap column by column; on a phone each column is most of
    // the screen, with the next one peeking in. The edge fades so a column
    // past it reads as "more", not as cut off.
    <div className="-mx-4 snap-x snap-mandatory overflow-x-auto px-4 pb-4 [mask-image:linear-gradient(90deg,black_calc(100%-24px),transparent)] md:mx-0 md:px-0 min-[1240px]:[mask-image:none]">
      <div className="grid grid-cols-[repeat(6,82%)] items-start gap-3 sm:min-w-[900px] sm:grid-cols-6">
        {BOARD_STAGES.map((stage) => {
          const items = stage.statuses.flatMap((s) => groups[s]);
          const isTarget = dragOverStage === stage.key;
          return (
            <section
              key={stage.key}
              aria-label={`${stage.label}, ${items.length}`}
              // Named by the status a drop sets, as before the stages.
              data-testid={`board-column-${stage.drop}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverStage(stage.key);
              }}
              onDragLeave={(e) => {
                // Ignore bubbling leaves from child cards.
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOverStage((s) => (s === stage.key ? null : s));
              }}
              onDrop={() => handleDrop(stage)}
              className={`flex min-w-0 snap-start flex-col rounded-[14px] border transition-colors ${
                isTarget
                  ? "border-foreground/40 bg-secondary"
                  : "border-border bg-secondary/40"
              }`}
            >
              <header className="flex items-center justify-between px-3 pb-1 pt-3">
                <h3 className="text-[13px] font-medium text-foreground">
                  {stage.label}
                </h3>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </header>

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
                      setDragOverStage(null);
                    }}
                  />
                ))}
                {items.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-2 py-5 text-center text-xs text-muted-foreground">
                    {draggingId ? "Drop here" : "Nothing here yet"}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
