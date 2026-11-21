import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
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
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                width={72}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.375rem",
                  fontSize: "12px",
                }}
                formatter={(val: number) => [val, "applications"]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} minPointSize={2}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
