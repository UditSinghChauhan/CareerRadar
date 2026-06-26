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

const STATUS_STAGES = [
  { key: "saved", label: "Saved", color: "hsl(var(--muted-foreground))" },
  { key: "applied", label: "Applied", color: "hsl(250 89% 65%)" },
  {
    key: "assessment",
    label: "Assessment",
    color: "hsl(38 92% 50%)",
    keys: ["oa_pending", "oa_completed"],
  },
  {
    key: "interview",
    label: "Interview",
    color: "hsl(142 72% 42%)",
    keys: ["interview_pending", "interview_completed"],
  },
  { key: "offered", label: "Offered", color: "hsl(142 70% 32%)" },
] as const;

export function ApplicationChart({ summary, isLoading }: ApplicationChartProps) {
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
        <CardTitle className="text-sm font-semibold">Application Funnel</CardTitle>
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
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
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
