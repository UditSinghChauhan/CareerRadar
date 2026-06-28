import { useGetJobsClosingSoon } from "@workspace/api-client-react";
import type { Job } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function deadlineBadge(deadline: string) {
  const days = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 1)
    return { label: "Closing today", className: "bg-destructive/10 text-destructive border-destructive/20" };
  if (days <= 3)
    return { label: `${days}d left`, className: "bg-destructive/10 text-destructive border-destructive/20" };
  if (days <= 7)
    return { label: `${days}d left`, className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20" };
  return { label: `${days}d left`, className: "bg-secondary text-muted-foreground border-border" };
}

function ClosingSoonCard({ job }: { job: Job }) {
  const company = job.company;
  const badge = job.deadline ? deadlineBadge(job.deadline) : null;

  return (
    <div className="group flex items-center gap-3 py-3 border-b border-border last:border-0">
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
        <p className="text-sm font-medium leading-tight truncate">{job.title}</p>
        <p className="text-xs text-muted-foreground truncate">{company?.name}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${badge.className}`}
          >
            {badge.label}
          </span>
        )}
        {job.applyUrl && (
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary transition-opacity md:opacity-0 md:group-hover:opacity-100"
            aria-label={`Apply for ${job.title}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export function ClosingSoon() {
  const { data: jobs, isLoading } = useGetJobsClosingSoon({ days: 7 });

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Closing Soon</CardTitle>
          {jobs && jobs.length > 0 && (
            <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
              {jobs.length}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Deadlines within 7 days</p>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-1">
                <Skeleton className="h-8 w-8 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-5 w-12 rounded" />
              </div>
            ))}
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <div className="h-32 flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center">
              No urgent deadlines.
              <br />
              <span className="text-xs">You're up to date.</span>
            </p>
          </div>
        ) : (
          <div>
            {jobs.slice(0, 8).map((job) => (
              <ClosingSoonCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
