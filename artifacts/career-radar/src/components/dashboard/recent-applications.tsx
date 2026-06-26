import { useListApplications } from "@workspace/api-client-react";
import type { Application } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Building2 } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

const STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  saved: { label: "Saved", className: "bg-secondary text-muted-foreground border-border" },
  applied: { label: "Applied", className: "bg-primary/10 text-primary border-primary/20" },
  oa_pending: { label: "OA Pending", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
  oa_completed: { label: "OA Done", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" },
  interview_pending: { label: "Interview", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  interview_completed: { label: "Interviewed", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  offered: { label: "Offered", className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive border-destructive/20" },
  withdrawn: { label: "Withdrawn", className: "bg-secondary text-muted-foreground border-border" },
};

function ApplicationRow({ application }: { application: Application }) {
  const job = application.job;
  const company = job?.company;
  const statusMeta = STATUS_META[application.status] ?? { label: application.status, className: "" };
  const timeAgo = formatDistanceToNow(parseISO(application.createdAt), {
    addSuffix: true,
  });

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      {company?.logoUrl ? (
        <img
          src={company.logoUrl}
          alt={company.name}
          className="h-8 w-8 rounded-md object-contain shrink-0 bg-white p-0.5 border border-border"
        />
      ) : (
        <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight truncate">
          {job?.title ?? "Unknown Role"}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {company?.name ?? "Unknown Company"}
          {job?.location ? ` · ${job.location}` : ""}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${statusMeta.className}`}
        >
          {statusMeta.label}
        </span>
        <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
      </div>
    </div>
  );
}

export function RecentApplications() {
  const { data, isLoading } = useListApplications({ limit: 8 });
  const applications = data?.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Recent Applications</CardTitle>
          {data?.meta && data.meta.total > 0 && (
            <span className="text-xs text-muted-foreground">
              {data.meta.total} total
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Your latest application activity</p>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                <Skeleton className="h-8 w-8 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <div className="space-y-1 items-end flex flex-col">
                  <Skeleton className="h-4 w-16 rounded" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        ) : applications.length === 0 ? (
          <div className="h-32 flex items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-sm text-muted-foreground text-center">
              No applications tracked yet.
              <br />
              <span className="text-xs">Start by saving jobs you're interested in.</span>
            </p>
          </div>
        ) : (
          <div>
            {applications.map((app) => (
              <ApplicationRow key={app.id} application={app} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
