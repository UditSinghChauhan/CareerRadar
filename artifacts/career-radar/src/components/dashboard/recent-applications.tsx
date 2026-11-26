import { useListApplications } from "@workspace/api-client-react";
import type { Application } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

import { formatDistanceToNow, parseISO } from "date-fns";
import { CompanyMark } from "@/components/company-mark";
import {
  statusBadgeClass,
  statusLabel,
} from "@/components/applications/status";

function ApplicationRow({ application }: { application: Application }) {
  const job = application.job;
  const company = job?.company;
  // The same label and colour as the board and the table (status.ts).
  const statusMeta = {
    label: statusLabel(application.status),
    className: statusBadgeClass(application.status),
  };
  const timeAgo = formatDistanceToNow(parseISO(application.createdAt), {
    addSuffix: true,
  });

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <CompanyMark
        name={company?.name ?? job?.title}
        logoUrl={company?.logoUrl}
        size="md"
      />

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
          <CardTitle className="text-sm font-semibold">
            Recent applications
          </CardTitle>
          {data?.meta && data.meta.total > 0 && (
            <span className="text-xs text-muted-foreground">
              {data.meta.total} total
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Your latest application activity
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 py-3 border-b border-border last:border-0"
              >
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
              <span className="text-xs">
                Start by saving jobs you're interested in.
              </span>
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
