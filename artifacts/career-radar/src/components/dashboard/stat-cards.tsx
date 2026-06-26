import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardSummary } from "@workspace/api-client-react";

interface StatCardsProps {
  summary: DashboardSummary | undefined;
  isLoading: boolean;
}

interface StatCard {
  label: string;
  value: number | undefined;
  highlight?: boolean;
  sub?: string;
}

function StatCard({ label, value, highlight, sub }: StatCard) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          {label}
        </p>
        <p
          className={`text-3xl font-bold tabular-nums ${
            highlight ? "text-primary" : ""
          }`}
        >
          {value ?? 0}
        </p>
        {sub && (
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function StatCards({ summary, isLoading }: StatCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const byStatus = summary?.byStatus ?? {};

  const interviews =
    (byStatus["interview_pending"] ?? 0) +
    (byStatus["interview_completed"] ?? 0);

  const stats: StatCard[] = [
    {
      label: "Jobs Found",
      value: summary?.activeJobsCount,
      sub: "Active listings",
    },
    {
      label: "Saved",
      value: byStatus["saved"] ?? 0,
      sub: "In your list",
    },
    {
      label: "Applied",
      value: summary?.appliedCount,
      sub: "Submitted",
    },
    {
      label: "Interviews",
      value: interviews,
      highlight: interviews > 0,
      sub: "Scheduled",
    },
    {
      label: "Offers",
      value: byStatus["offered"] ?? 0,
      highlight: (byStatus["offered"] ?? 0) > 0,
      sub: "Received",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {stats.map((s) => (
        <StatCard key={s.label} {...s} />
      ))}
    </div>
  );
}
