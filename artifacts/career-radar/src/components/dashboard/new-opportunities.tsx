import { useListJobs } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";

export function NewOpportunities() {
  const { data, isLoading } = useListJobs({ status: "active", limit: 1 });
  const total = data?.meta?.total ?? 0;

  if (isLoading) {
    return <Skeleton className="h-24 rounded-xl" />;
  }

  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-primary/80 uppercase tracking-wide mb-1">
              New Opportunities
            </p>
            <p className="text-3xl font-bold text-primary tabular-nums">{total}</p>
            <p className="text-xs text-primary/70 mt-1">Active listings right now</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
