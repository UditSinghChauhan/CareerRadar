/**
 * Today's Queue (Phase 3.3)
 * ─────────────────────────
 * The top of the dashboard. It assigns work instead of reporting history:
 * ten ranked rows, each with one-click Apply and Dismiss, under a target
 * counter and a streak.
 *
 * THE RANKING IS THE SERVER'S, ENTIRELY.
 * UPGRADE.md §3.1: "Return the priority components alongside each job so the
 * UI can explain the ranking. Do not recompute them in the frontend." So this
 * file sorts nothing, scores nothing and re-derives nothing — it reads
 * `priority`, `contributions` and `reasons` off the response and lays them
 * out. The order rows arrive in is the order they are shown.
 *
 * WHY THE BREAKDOWN IS VISIBLE RATHER THAN ON HOVER ONLY
 * On the live data three of the four components are currently constant:
 * relevance saturates at 100, no posting carries a deadline, and the dream
 * boost is 0 until something is bookmarked. A single opaque "priority 63"
 * would read as a precise judgement when it is mostly a tie. Showing the four
 * weighted contributions inline — and the server's own sentence saying the
 * deadline term is not separating anything — is the difference between a
 * ranking the user can trust and one they have to take on faith.
 */

import { useCallback, useMemo, useState } from "react";
import {
  useGetDailyQueue,
  useCreateApplication,
  useDismissJob,
  getGetDailyQueueQueryKey,
  getGetApplicationStatusMapQueryKey,
  getListApplicationsQueryKey,
  getGetDashboardSummaryQueryKey,
  getListJobsQueryKey,
} from "@workspace/api-client-react";
import type { QueueItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Building2,
  Check,
  ExternalLink,
  Flame,
  Info,
  Layers,
  MapPin,
  Target,
  X,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const trackLabels: Record<string, string> = {
  internship: "Internship",
  new_grad: "New Grad",
  early_career: "Early Career",
  not_relevant: "Not for freshers",
};

const workModeLabels: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

/** The four components, in the weight order §3.1 lists them. */
const COMPONENT_ORDER = [
  { key: "relevanceScore", label: "Relevance", weight: "×0.40" },
  { key: "deadlineUrgency", label: "Deadline", weight: "×0.30" },
  { key: "freshness", label: "Freshness", weight: "×0.20" },
  { key: "dreamCompanyBoost", label: "Dream co.", weight: "×0.10" },
] as const;

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/**
 * The company logo, falling back to initials when the URL does not resolve.
 * Not defensive padding: several seeded `logo_url` values point at
 * cdn.simpleicons.org paths that have since been removed upstream and now
 * 404, so without the fallback the queue renders broken-image glyphs. Same
 * pattern as job-card.tsx.
 */
function CompanyLogo({
  logoUrl,
  name,
  fallbackName,
}: {
  logoUrl: string | null | undefined;
  name: string;
  fallbackName: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!logoUrl || failed) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-primary/10">
        <span className="text-[10px] font-bold text-primary">
          {initials(fallbackName)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={name}
      className="h-8 w-8 shrink-0 rounded-md border border-border bg-background object-contain p-0.5"
      onError={() => setFailed(true)}
    />
  );
}

// ─── One row ──────────────────────────────────────────────────────────────────

function QueueRow({
  item,
  rank,
  onApply,
  onDismiss,
  isPending,
}: {
  item: QueueItem;
  rank: number;
  onApply: (jobId: string, applyUrl: string) => void;
  onDismiss: (jobId: string) => void;
  isPending: boolean;
}) {
  const job = item.job;
  const company = job.company;
  const contributions = item.contributions;

  return (
    <li
      data-testid="queue-row"
      data-job-id={job.id}
      data-priority={item.priority}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-secondary/30 sm:flex-row sm:items-start sm:gap-4"
    >
      {/* Rank */}
      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:gap-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold tabular-nums text-primary">
          {rank}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="cursor-default text-[11px] font-semibold tabular-nums text-muted-foreground"
              data-testid="queue-priority"
            >
              {item.priority.toFixed(1)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            Priority {item.priority.toFixed(2)} / 100
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start gap-2.5">
          <CompanyLogo
            logoUrl={company?.logoUrl}
            name={company?.name ?? ""}
            fallbackName={company?.name ?? job.title}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">
              {job.title}
            </p>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span>{company?.name ?? "Unknown"}</span>
              {job.location && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" />
                    {job.location}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {job.relevanceTrack && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {trackLabels[job.relevanceTrack] ?? job.relevanceTrack}
            </Badge>
          )}
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            {workModeLabels[job.workMode] ?? job.workMode}
          </Badge>
          {/* §"Duplicates": say that rows were collapsed rather than silently
              hiding them. */}
          {item.duplicateCount > 1 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  data-testid="duplicate-badge"
                  className="h-5 cursor-default gap-1 px-1.5 text-[10px] text-muted-foreground"
                >
                  <Layers className="h-3 w-3" />
                  {item.duplicateCount} copies
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                This company posted {item.duplicateCount} identical listings
                with different URLs. Only the highest-priority one is shown.
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* The ranking, broken out — all four weighted contributions. */}
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1"
          data-testid="priority-breakdown"
        >
          {COMPONENT_ORDER.map(({ key, label, weight }) => {
            const raw = item.components[key];
            const contribution = contributions[key];
            const idle = contribution === 0;
            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <span
                    data-component={key}
                    data-contribution={contribution}
                    className={`cursor-default text-[11px] tabular-nums ${
                      idle
                        ? "text-muted-foreground/50"
                        : "text-muted-foreground"
                    }`}
                  >
                    {label}{" "}
                    <span className="font-semibold text-foreground">
                      {contribution.toFixed(1)}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {label} {Math.round(raw)}/100 {weight} ={" "}
                  {contribution.toFixed(2)}
                </TooltipContent>
              </Tooltip>
            );
          })}
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="start"
              className="max-w-sm text-xs"
              data-testid="queue-rank-reasons"
            >
              <p className="mb-1 font-semibold">
                Why this ranks {rank}
                {rank === 1
                  ? "st"
                  : rank === 2
                    ? "nd"
                    : rank === 3
                      ? "rd"
                      : "th"}
              </p>
              <ul className="list-disc space-y-0.5 pl-3">
                {item.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* §3.3: "Each row displays a plain-language reason for its rank."
            The leading reason is on the row itself, not only on hover — a
            reason you have to go looking for is not displayed. */}
        <p
          className="text-[11px] leading-snug text-muted-foreground"
          data-testid="queue-reason"
        >
          {item.reasons[0]}
          {item.reasons[1] ? ` · ${item.reasons[1]}` : ""}
        </p>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5 sm:flex-col sm:items-stretch">
        {job.applyUrl ? (
          <Button
            size="sm"
            data-testid="queue-apply"
            className="h-8 gap-1 px-3 text-xs"
            disabled={isPending}
            onClick={() => onApply(job.id, job.applyUrl as string)}
          >
            Apply
            <ExternalLink className="h-3 w-3" />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs"
            disabled
          >
            No link
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          data-testid="queue-dismiss"
          className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
          disabled={isPending}
          onClick={() => onDismiss(job.id)}
        >
          <X className="h-3.5 w-3.5" />
          Dismiss
        </Button>
      </div>
    </li>
  );
}

// ─── The card ─────────────────────────────────────────────────────────────────

export function TodaysQueue() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useGetDailyQueue();
  const { mutateAsync: createApplication } = useCreateApplication();
  const { mutateAsync: dismissJob } = useDismissJob();

  // Per-row, not the mutation's global isPending: one in-flight apply must
  // not disable every other row's buttons.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  /**
   * Rows removed optimistically. The queue query is refetched, but the round
   * trip on a cold free-tier instance is slow enough to see, and §3.3 asks
   * for the row to go "immediately".
   */
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const queueKey = useMemo(() => getGetDailyQueueQueryKey(), []);

  const markPending = useCallback((jobId: string, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  }, []);

  /** Everything that changes when a row leaves the queue. */
  const refreshAfterAction = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queueKey });
    void queryClient.invalidateQueries({
      queryKey: getGetApplicationStatusMapQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getListApplicationsQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getGetDashboardSummaryQueryKey(),
    });
    // The jobs list hides dismissed rows too.
    void queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
  }, [queryClient, queueKey]);

  const handleApply = useCallback(
    (jobId: string, applyUrl: string) => {
      // MUST be synchronous and first: a popup blocker swallows window.open
      // once it runs after an await. Same rule as job-card.tsx.
      window.open(applyUrl, "_blank", "noopener,noreferrer");

      void (async () => {
        markPending(jobId, true);
        setRemovedIds((prev) => new Set(prev).add(jobId));
        try {
          await createApplication({
            data: {
              jobId,
              status: "applied",
              appliedDate: new Date().toISOString(),
            },
          });
        } catch {
          // The tab is already open and must not be undone; put the row back
          // so the user can retry logging it.
          setRemovedIds((prev) => {
            const next = new Set(prev);
            next.delete(jobId);
            return next;
          });
          markPending(jobId, false);
          toast.error("Opened the posting, but could not log the application");
          return;
        }
        markPending(jobId, false);
        refreshAfterAction();
      })();
    },
    [createApplication, markPending, refreshAfterAction],
  );

  const handleDismiss = useCallback(
    (jobId: string) => {
      void (async () => {
        markPending(jobId, true);
        setRemovedIds((prev) => new Set(prev).add(jobId));
        try {
          await dismissJob({ id: jobId, data: {} });
        } catch {
          setRemovedIds((prev) => {
            const next = new Set(prev);
            next.delete(jobId);
            return next;
          });
          markPending(jobId, false);
          toast.error("Could not dismiss that job");
          return;
        }
        markPending(jobId, false);
        refreshAfterAction();
        toast.success("Dismissed", { description: "It won't come back." });
      })();
    },
    [dismissJob, markPending, refreshAfterAction],
  );

  const progress = data?.progress;
  const target = progress?.target ?? 10;
  const appliedToday = progress?.appliedToday ?? 0;
  const streak = progress?.streakDays ?? 0;
  const percent = Math.min(100, Math.round((appliedToday / target) * 100));

  const items = (data?.items ?? []).filter(
    (item) => !removedIds.has(item.job.id),
  );

  return (
    <Card data-testid="todays-queue" className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-0.5">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Target className="h-4 w-4 text-primary" />
              Today&apos;s Queue
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {data
                ? `${data.distinctCount} distinct roles to choose from, ranked. ` +
                  (data.eligibleCount > data.distinctCount
                    ? `${data.eligibleCount - data.distinctCount} duplicate listings collapsed.`
                    : "No duplicates today.")
                : "Ranked by relevance, deadline, freshness and your bookmarks."}
            </p>
          </div>

          {/* §3.3 target counter + streak */}
          <div className="shrink-0 space-y-1.5 sm:w-52">
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="text-sm font-semibold tabular-nums"
                data-testid="daily-target-counter"
              >
                {appliedToday} / {target}
              </span>
              <span className="text-[11px] text-muted-foreground">
                applications today
              </span>
            </div>
            <Progress value={percent} className="h-1.5" />
            <div className="flex items-center justify-between gap-2">
              <span
                className="flex items-center gap-1 text-[11px] text-muted-foreground"
                data-testid="streak-counter"
              >
                <Flame
                  className={`h-3 w-3 ${streak > 0 ? "text-orange-500" : "opacity-40"}`}
                />
                {streak === 0
                  ? "No streak yet"
                  : `${streak} day${streak === 1 ? "" : "s"} streak`}
              </span>
              {appliedToday >= target && (
                <Badge className="h-4 gap-0.5 px-1.5 text-[10px]">
                  <Check className="h-2.5 w-2.5" />
                  Done
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        {isError ? (
          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-sm text-muted-foreground">
              Could not load the queue.
            </p>
          </div>
        ) : isLoading ? (
          <ul className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="flex gap-4 rounded-lg border border-border p-3"
              >
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-8 w-20" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div
            className="flex h-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border"
            data-testid="queue-empty"
          >
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">Queue clear</p>
            <p className="text-xs text-muted-foreground">
              Nothing left to apply to right now. The next sync will refill it.
            </p>
          </div>
        ) : (
          <ul className="space-y-2" data-testid="queue-list">
            {items.map((item, i) => (
              <QueueRow
                key={item.job.id}
                item={item}
                rank={i + 1}
                onApply={handleApply}
                onDismiss={handleDismiss}
                isPending={pendingIds.has(item.job.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
