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
 * WHAT A ROW SAYS
 * A student reads up to three short reasons per row ("Posted yesterday",
 * "Strong match for new grads"), built by api-server/src/queue/priority.ts.
 * The score is a whole number; hovering it shows its four parts. How the
 * score is made, including that most sources publish no closing date, is
 * one plain-language note behind "How is this ranked?" in the header,
 * rather than engine text repeated on every row.
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Check,
  ExternalLink,
  Flame,
  Info,
  Layers,
  MapPin,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

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

/** The four parts of a score, in the weight order §3.1 lists them. */
const COMPONENT_ORDER = [
  { key: "relevanceScore", label: "Fit" },
  { key: "deadlineUrgency", label: "Closing soon" },
  { key: "freshness", label: "Freshness" },
  { key: "dreamCompanyBoost", label: "Dream company" },
] as const;

/** Scores read as whole numbers everywhere: in the app and on the landing. */
export const formatScore = (n: number) => String(Math.round(n));

/** The ranking in plain words, behind "How is this ranked?". */
function RankingNote() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-7 gap-1 px-2 text-xs text-muted-foreground"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          How is this ranked?
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 space-y-2 text-sm leading-relaxed"
        data-testid="queue-ranking-note"
      >
        <p className="font-medium">How is this ranked?</p>
        <p className="text-muted-foreground">
          Every morning each role you can apply to gets a score out of 100, from
          four things: how well the role fits a fresher (40%), how soon it
          closes (30%), how recently it was posted (20%) and whether it is at
          one of the companies you starred (10%). The ten highest come first.
        </p>
        <p className="text-muted-foreground">
          Most sources do not publish a closing date, so that part is often the
          same for every role. Roles with the same score take turns from day to
          day, so new ones get a chance.
        </p>
      </PopoverContent>
    </Popover>
  );
}

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
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary">
        <span className="text-xs font-bold text-foreground">
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
        {/* The landing's rank tag: ink on pale lime, full lime on rank 1. */}
        <span
          className={`inline-grid h-[18px] min-w-[18px] place-items-center rounded-[5px] px-[5px] font-mono text-[11px] font-medium tabular-nums ${
            rank === 1
              ? "bg-signal text-signal-ink"
              : "bg-signal-tint text-foreground"
          }`}
          aria-label={`Rank ${rank}`}
        >
          {rank}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="cursor-default text-xs font-semibold tabular-nums text-muted-foreground"
              data-testid="queue-priority"
            >
              {formatScore(item.priority)}
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className="text-xs"
            data-testid="priority-breakdown"
          >
            <p className="mb-1 font-semibold">
              Score {formatScore(item.priority)} of 100
            </p>
            <ul className="space-y-0.5">
              {COMPONENT_ORDER.map(({ key, label }) => (
                <li
                  key={key}
                  data-component={key}
                  className="flex justify-between gap-4 tabular-nums"
                >
                  <span>{label}</span>
                  <span>+{formatScore(contributions[key])}</span>
                </li>
              ))}
            </ul>
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
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {trackLabels[job.relevanceTrack] ?? job.relevanceTrack}
            </Badge>
          )}
          <Badge variant="outline" className="h-5 px-1.5 text-xs">
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
                  className="h-5 cursor-default gap-1 px-1.5 text-xs text-muted-foreground"
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

        {/* §3.3: "Each row displays a plain-language reason for its rank."
            Up to three short reasons from the server, on the row itself. */}
        {item.reasons.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Why it is here">
            {item.reasons.map((reason) => (
              <li
                key={reason}
                data-testid="queue-reason"
                className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              >
                {reason}
              </li>
            ))}
          </ul>
        )}
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
  const { data, isLoading, isError, refetch, isFetching } = useGetDailyQueue();
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
    <Card data-testid="todays-queue">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-0.5">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              Today&apos;s ten
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {data
                ? `Ranked from ${data.eligibleCount.toLocaleString("en-IN")} roles open to you today`
                : "Ten roles, ranked for you each morning"}
            </p>
            <RankingNote />
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
              <span className="text-xs text-muted-foreground">
                applications today
              </span>
            </div>
            <Progress value={percent} className="h-1.5" />
            <div className="flex items-center justify-between gap-2">
              <span
                className="flex items-center gap-1 text-xs text-muted-foreground"
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
                <Badge className="h-4 gap-0.5 px-1.5 text-xs">
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
          <div
            className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-4 text-center"
            data-testid="queue-error"
          >
            <p className="text-sm text-muted-foreground">
              Could not load today’s ten. The server did not answer.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Retrying…" : "Retry"}
            </Button>
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
            className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-4 text-center"
            data-testid="queue-empty"
          >
            <p className="text-sm font-medium">Queue clear</p>
            <p className="text-sm text-muted-foreground">
              You have acted on every role for today. Tomorrow’s ten arrive in
              the morning.
            </p>
            <Button asChild size="sm" className="mt-2">
              <Link href="/jobs">Browse all jobs</Link>
            </Button>
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
