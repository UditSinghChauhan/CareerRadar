import { useListJobs, useGetProfile } from "@workspace/api-client-react";
import type { Job } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, MapPin, Clock, ExternalLink } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

function JobCard({ job }: { job: Job }) {
  const company = job.company;
  const daysLeft = job.deadline
    ? Math.ceil(
        (new Date(job.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      )
    : null;

  const salary =
    job.jobType === "internship" && job.stipend
      ? `₹${(job.stipend / 1000).toFixed(0)}k/mo`
      : job.salaryMin
        ? `₹${(job.salaryMin / 100000).toFixed(1)}L`
        : null;

  return (
    <div className="group flex flex-col gap-2.5 p-4 rounded-lg border border-border bg-card hover:bg-secondary/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              alt={company.name}
              className="h-7 w-7 rounded-md object-contain shrink-0 bg-white p-0.5 border border-border"
            />
          ) : (
            <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{job.title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {company?.name ?? "Unknown"}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge
            variant={job.jobType === "internship" ? "secondary" : "outline"}
            className="text-[10px] px-1.5 py-0 h-4"
          >
            {job.jobType === "internship" ? "Intern" : "FTE"}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {job.location}
          </span>
        )}
        <span>
          {(({ remote: "Remote", hybrid: "Hybrid", onsite: "On-site" } as Record<string, string>)[job.workMode]) ?? job.workMode}
        </span>
        {salary && <span className="font-medium text-foreground">{salary}</span>}
      </div>

      <div className="flex items-center justify-between mt-0.5">
        {daysLeft !== null ? (
          <span
            className={`text-xs font-medium ${
              daysLeft <= 3
                ? "text-destructive"
                : daysLeft <= 7
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-muted-foreground"
            }`}
          >
            <Clock className="inline h-3 w-3 mr-0.5" />
            {daysLeft <= 0 ? "Closing today" : `${daysLeft}d left`}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No deadline</span>
        )}
        {job.applyUrl && (
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary flex items-center gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100"
          >
            Apply
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function JobCardSkeleton() {
  return (
    <div className="p-4 rounded-lg border border-border space-y-2.5">
      <div className="flex gap-2.5">
        <Skeleton className="h-7 w-7 rounded-md" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function RecommendedJobs() {
  const { data: profile } = useGetProfile();

  const params = {
    status: "active" as const,
    limit: 6,
    ...(profile?.graduationYear ? { eligibleBatch: profile.graduationYear } : {}),
  };

  const { data, isLoading } = useListJobs(params);
  const jobs = data?.data ?? [];

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Recommended for You</CardTitle>
          {data?.meta && (
            <span className="text-xs text-muted-foreground">
              {data.meta.total} matching
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {profile?.graduationYear
            ? `Filtered for ${profile.graduationYear} batch`
            : "All active opportunities"}
        </p>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <JobCardSkeleton key={i} />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="h-40 flex items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-sm text-muted-foreground text-center">
              No matching jobs yet.
              <br />
              <span className="text-xs">
                Complete your profile to improve recommendations.
              </span>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {jobs.slice(0, 6).map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
