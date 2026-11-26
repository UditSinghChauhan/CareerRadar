import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardSummary } from "@workspace/api-client-react";

interface ApplicationChartProps {
  summary: DashboardSummary | undefined;
  isLoading: boolean;
}

// One ink, deepening stage by stage, and green only for the offer: the
// stages are an order, not five categories, so they share a hue (amber
// and two greens read as warnings and successes that were not there).
const ink = (pct: number) =>
  `color-mix(in oklab, var(--foreground) ${pct}%, transparent)`;
const STATUS_STAGES = [
  { key: "saved", label: "Saved", color: ink(22) },
  { key: "applied", label: "Applied", color: ink(40) },
  {
    key: "assessment",
    label: "Assessment",
    color: ink(58),
    keys: ["oa_pending", "oa_completed"],
  },
  {
    key: "interview",
    label: "Interview",
    color: ink(78),
    keys: ["interview_pending", "interview_completed"],
  },
  { key: "offered", label: "Offered", color: "var(--primary)" },
] as const;

export function ApplicationChart({
  summary,
  isLoading,
}: ApplicationChartProps) {
  if (isLoading) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="flex-1">
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const byStatus = summary?.byStatus ?? {};
  const totalApplications = summary?.totalApplications ?? 0;

  const data = STATUS_STAGES.map((stage) => {
    let count: number;
    if ("keys" in stage) {
      count = stage.keys.reduce((acc, k) => acc + (byStatus[k] ?? 0), 0);
    } else {
      count = byStatus[stage.key as string] ?? 0;
    }
    return { label: stage.label, count, color: stage.color };
  });

  const isEmpty = totalApplications === 0;
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">
          Application funnel
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {totalApplications} total tracked
        </p>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        {isEmpty ? (
          <div className="h-48 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center">
              No applications yet.
              <br />
              Start tracking to see your funnel.
            </p>
          </div>
        ) : (
          // Plain bars, not a chart library: five numbers read better as a
          // labelled list with the count always shown than as a hover
          // tooltip, and the dashboard no longer loads 102 KB (gzip) of
          // charting code for them.
          <ol className="space-y-2.5" aria-label="Applications by stage">
            {data.map((stage) => (
              <li
                key={stage.label}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-xs"
              >
                <span className="text-muted-foreground">{stage.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-secondary">
                  <span
                    className="block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{
                      width: `${(stage.count / max) * 100}%`,
                      minWidth: stage.count > 0 ? "0.5rem" : 0,
                      background: stage.color,
                    }}
                  />
                </span>
                <span className="text-right font-medium tabular-nums text-foreground">
                  {stage.count}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
