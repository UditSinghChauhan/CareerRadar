import { useGetJobsClosingSoon } from "@workspace/api-client-react";
import type { Job } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, differenceInDays } from "date-fns";
import { Building2, ExternalLink } from "lucide-react";

function urgencyColor(days: number): string {
  if (days <= 1) return "bg-destructive";
  if (days <= 3) return "bg-destructive/70";
  if (days <= 7) return "bg-yellow-500";
  return "bg-primary/50";
}

function urgencyTextColor(days: number): string {
  if (days <= 3) return "text-destructive";
  if (days <= 7) return "text-yellow-600 dark:text-yellow-400";
  return "text-muted-foreground";
}

function TimelineItem({ job }: { job: Job }) {
  if (!job.deadline) return null;
  const deadlineDate = parseISO(job.deadline);
  const days = differenceInDays(deadlineDate, new Date());
  const company = job.company;

  return (
    <div className="flex gap-4 group">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center">
        <div className={`h-2.5 w-2.5 rounded-full mt-1 shrink-0 ${urgencyColor(days)}`} />
        <div className="flex-1 w-px bg-border mt-1" />
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {company?.logoUrl ? (
              <img
                src={company.logoUrl}
                alt={company.name}
                className="h-5 w-5 rounded object-contain bg-white border border-border shrink-0 p-0.5"
              />
            ) : (
              <div className="h-5 w-5 rounded bg-secondary flex items-center justify-center shrink-0">
                <Building2 className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug truncate">{job.title}</p>
              <p className="text-xs text-muted-foreground truncate">{company?.name}</p>
            </div>
          </div>
          {job.applyUrl && (
            <a
              href={job.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {format(deadlineDate, "d MMM yyyy")}
          </span>
          <span className={`text-xs font-semibold ${urgencyTextColor(days)}`}>
            {days <= 0 ? "Due today" : `${days}d to go`}
          </span>
        </div>
      </div>
    </div>
  );
}

export function DeadlineTimeline() {
  const { data: jobs, isLoading } = useGetJobsClosingSoon({ days: 21 });

  const sorted = [...(jobs ?? [])].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Upcoming Deadlines</CardTitle>
        <p className="text-xs text-muted-foreground">Next 21 days</p>
      </CardHeader>
      <CardContent className="pb-2 overflow-y-auto max-h-72">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center gap-1">
                  <Skeleton className="h-2.5 w-2.5 rounded-full" />
                  <Skeleton className="w-px flex-1 h-8" />
                </div>
                <div className="flex-1 pb-4 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="h-32 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center">
              No deadlines in the next 21 days.
            </p>
          </div>
        ) : (
          <div>
            {sorted.map((job) => (
              <TimelineItem key={job.id} job={job} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
