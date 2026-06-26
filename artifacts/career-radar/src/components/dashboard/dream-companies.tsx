import { useListBookmarks, useListJobs } from "@workspace/api-client-react";
import type { Company } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ExternalLink } from "lucide-react";

function CompanyCard({
  company,
  jobCount,
}: {
  company: Company;
  jobCount: number;
}) {
  return (
    <div className="group flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary/40 transition-colors">
      {company.logoUrl ? (
        <img
          src={company.logoUrl}
          alt={company.name}
          className="h-9 w-9 rounded-lg object-contain shrink-0 bg-white p-1 border border-border"
        />
      ) : (
        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <Building2 className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{company.name}</p>
        <p className="text-xs text-muted-foreground">{jobCount} open role{jobCount !== 1 ? "s" : ""}</p>
      </div>
      {company.website && (
        <a
          href={company.website}
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

export function DreamCompanies() {
  const { data: bookmarks, isLoading: bookmarksLoading } = useListBookmarks();
  const { data: allJobs, isLoading: jobsLoading } = useListJobs({
    status: "active",
    limit: 100,
  });

  const isLoading = bookmarksLoading || jobsLoading;

  // Build company→jobCount map from bookmarked jobs
  const bookmarkedCompanyMap = new Map<string, { company: Company; count: number }>();
  (bookmarks ?? []).forEach((bookmark) => {
    const company = bookmark.job?.company;
    if (!company) return;
    const existing = bookmarkedCompanyMap.get(company.id);
    if (existing) {
      existing.count += 1;
    } else {
      // Count total active jobs for this company
      const activeCount =
        allJobs?.data.filter((j) => j.companyId === company.id).length ?? 1;
      bookmarkedCompanyMap.set(company.id, { company, count: activeCount });
    }
  });

  const companies = Array.from(bookmarkedCompanyMap.values());

  // Fallback: if no bookmarks, derive top companies from active jobs
  const fallbackCompanies: { company: Company; jobCount: number }[] = [];
  if (companies.length === 0 && allJobs?.data) {
    const companyJobCount = new Map<string, { company: Company; count: number }>();
    allJobs.data.forEach((job) => {
      if (!job.company) return;
      const existing = companyJobCount.get(job.company.id);
      if (existing) existing.count += 1;
      else companyJobCount.set(job.company.id, { company: job.company, count: 1 });
    });
    fallbackCompanies.push(
      ...Array.from(companyJobCount.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
        .map(({ company, count }) => ({ company, jobCount: count })),
    );
  }

  const hasBookmarks = companies.length > 0;
  const displayItems = hasBookmarks
    ? companies.map(({ company, count }) => ({ company, jobCount: count }))
    : fallbackCompanies;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">
          {hasBookmarks ? "Dream Companies" : "Top Companies Hiring"}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {hasBookmarks
            ? "Companies with your bookmarked jobs"
            : "Bookmark jobs to track your dream companies"}
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="h-24 flex items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-sm text-muted-foreground">No companies to show yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {displayItems.map(({ company, jobCount }) => (
              <CompanyCard key={company.id} company={company} jobCount={jobCount} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
