import { useGetJobsClosingSoon } from "@workspace/api-client-react";
import type { Job } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CompanyMark } from "@/components/company-mark";
import { deadlineInfo, URGENCY_TEXT } from "@/lib/deadline";

function ClosingSoonCard({ job }: { job: Job }) {
  const company = job.company;
  const left = job.deadline ? deadlineInfo(job.deadline) : null;

  // The deadline sits on the company line, so a narrow card keeps the
  // whole title instead of clipping it beside a badge.
  return (
    <div className="group flex items-center gap-3 py-3 border-b border-border last:border-0">
      <CompanyMark
        name={company?.name ?? job.title}
        logoUrl={company?.logoUrl}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight truncate">
          {job.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {company?.name}
          {left && (
            <>
              <span className="mx-1.5 opacity-40">·</span>
              <span className={`font-medium ${URGENCY_TEXT[left.urgency]}`}>
                {left.label}
              </span>
            </>
          )}
        </p>
      </div>
      {job.applyUrl && (
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-primary transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          aria-label={`Apply for ${job.title}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export function ClosingSoon() {
  const { data: jobs, isLoading } = useGetJobsClosingSoon({ days: 7 });

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Closing soon</CardTitle>
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
