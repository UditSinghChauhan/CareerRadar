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
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              New opportunities
            </p>
            <p className="text-3xl font-medium tracking-tight text-foreground tabular-nums">
              {total}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Active listings right now
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
