import { useState, useMemo, useCallback, useEffect } from "react";
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, ArrowUpDown, AlertCircle, RefreshCw } from "lucide-react";
import {
  useListJobs,
  useListBookmarks,
  useListCompanies,
  useCreateBookmark,
  useDeleteBookmark,
  useGetProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListBookmarksQueryKey, getListJobsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { JobCard } from "@/components/jobs/job-card";
import { JobFilters, DEFAULT_FILTERS, countActiveFilters } from "@/components/jobs/job-filters";
import type { JobFiltersState } from "@/components/jobs/job-filters";
import type { Job } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

type SortKey = "newest" | "deadline" | "salary" | "company";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "deadline", label: "Deadline" },
  { value: "salary", label: "Salary" },
  { value: "company", label: "Company" },
];

// ─── Sort helper ──────────────────────────────────────────────────────────────

function sortJobs(jobs: Job[], key: SortKey): Job[] {
  const sorted = [...jobs];
  switch (key) {
    case "newest":
      return sorted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    case "deadline":
      return sorted.sort((a, b) => {
        const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return da - db;
      });
    case "salary":
      return sorted.sort((a, b) => {
        const sa = a.salaryMax ?? a.salaryMin ?? a.stipend ?? 0;
        const sb = b.salaryMax ?? b.salaryMin ?? b.stipend ?? 0;
        return sb - sa;
      });
    case "company":
      return sorted.sort((a, b) =>
        (a.company?.name ?? "").localeCompare(b.company?.name ?? ""),
      );
    default:
      return sorted;
  }
}

// ─── Filter helper ────────────────────────────────────────────────────────────

function applyClientFilters(jobs: Job[], filters: JobFiltersState): Job[] {
  return jobs.filter((job) => {
    // Work mode (multi-select)
    if (filters.workModes.length > 0 && !filters.workModes.includes(job.workMode as "remote" | "hybrid" | "onsite")) {
      return false;
    }
    // Batch year (multi-select)
    if (filters.batches.length > 0) {
      const jobBatches = job.eligibleBatch ?? [];
      if (jobBatches.length > 0 && !filters.batches.some((b) => jobBatches.includes(b))) {
        return false;
      }
    }
    // Branch (multi-select)
    if (filters.branches.length > 0) {
      const jobBranches = job.eligibleBranches ?? [];
      if (jobBranches.length > 0 && !filters.branches.some((b) => jobBranches.includes(b))) {
        return false;
      }
    }
    // Skills (multi-select)
    if (filters.skills.length > 0) {
      const jobSkills = job.requiredSkills ?? [];
      if (!filters.skills.some((s) => jobSkills.includes(s))) {
        return false;
      }
    }
    // Source platform
    if (filters.sourcePlatform && job.sourcePlatform !== filters.sourcePlatform) {
      return false;
    }
    // Deadline before
    if (filters.deadlineBefore && job.deadline) {
      if (new Date(job.deadline) > new Date(filters.deadlineBefore)) {
        return false;
      }
    } else if (filters.deadlineBefore && !job.deadline) {
      return false;
    }
    return true;
  });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function JobCardSkeleton() {
  return (
    <div className="flex flex-col bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <div className="px-4 pb-3 flex gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="px-4 pb-3 flex justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="border-t border-border/60 px-4 py-3 flex justify-between items-center">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-28 rounded-md" />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Search className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">No jobs found</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-xs">
        {hasFilters
          ? "Try adjusting your filters or search query."
          : "No active job listings right now. Check back soon."}
      </p>
      {hasFilters && (
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function JobsPage() {
  const queryClient = useQueryClient();

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Filters & sort ────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<JobFiltersState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  // Reset page when filters/search change
  useEffect(() => { setPage(1); }, [debouncedSearch, filters, sort]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const {
    data: jobsData,
    isLoading: jobsLoading,
    isError: jobsError,
    refetch: refetchJobs,
  } = useListJobs({
    status: "active",
    search: debouncedSearch || undefined,
    companyId: filters.companyId || undefined,
    jobType: filters.jobType !== "all"
      ? (filters.jobType as "internship" | "full_time")
      : undefined,
    limit: 200,
  });

  const { data: bookmarksData } = useListBookmarks();
  const { data: companiesData } = useListCompanies({ limit: 100 });
  const { data: profileData } = useGetProfile();

  // ── Mutations ─────────────────────────────────────────────────────────────
  const { mutate: createBookmark, isPending: creatingBookmark } = useCreateBookmark({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListBookmarksQueryKey() });
      },
    },
  });

  const { mutate: deleteBookmark, isPending: deletingBookmark } = useDeleteBookmark({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListBookmarksQueryKey() });
      },
    },
  });

  const handleBookmarkToggle = useCallback(
    (jobId: string, isCurrentlyBookmarked: boolean) => {
      if (isCurrentlyBookmarked) {
        deleteBookmark({ jobId });
      } else {
        createBookmark({ data: { jobId } });
      }
    },
    [createBookmark, deleteBookmark],
  );

  // ── Derived state ─────────────────────────────────────────────────────────
  const bookmarkedJobIds = useMemo(
    () => new Set((bookmarksData ?? []).map((b) => b.jobId)),
    [bookmarksData],
  );

  const allJobs = jobsData?.data ?? [];

  const filteredJobs = useMemo(
    () => applyClientFilters(allJobs, filters),
    [allJobs, filters],
  );

  const sortedJobs = useMemo(
    () => sortJobs(filteredJobs, sort),
    [filteredJobs, sort],
  );

  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedJobs = sortedJobs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const activeFilterCount = countActiveFilters(filters) + (debouncedSearch ? 1 : 0);
  const companies = companiesData?.data ?? [];
  const profileBatch = profileData?.graduationYear ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Page header */}
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-xl font-bold tracking-tight">Jobs Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Browse and filter active opportunities. All data is sourced from official provider APIs.
        </p>
      </div>

      <div className="flex gap-6 min-h-0 flex-1">
        {/* Desktop filter sidebar */}
        <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col">
          <div className="sticky top-0 overflow-y-auto max-h-[calc(100vh-10rem)] pr-1">
            <JobFilters
              filters={filters}
              onChange={setFilters}
              companies={companies}
            />
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search roles, companies, skills..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>

            {/* Sort */}
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 w-36 text-sm gap-1">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value} className="text-sm">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Mobile filter button */}
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden h-9 gap-1.5"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge className="h-4 px-1.5 text-[10px] bg-primary/10 text-primary border-0">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </div>

          {/* Results meta */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {jobsLoading ? (
                "Loading..."
              ) : (
                <>
                  <span className="font-medium text-foreground">{sortedJobs.length}</span>{" "}
                  {sortedJobs.length === 1 ? "job" : "jobs"}
                  {activeFilterCount > 0 ? " matching filters" : ""}
                </>
              )}
            </p>
            {profileBatch && (
              <p className="text-xs text-muted-foreground">
                Your batch:{" "}
                <span className="font-medium text-foreground">{profileBatch}</span>
              </p>
            )}
          </div>

          {/* Jobs grid */}
          {jobsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <JobCardSkeleton key={i} />
              ))}
            </div>
          ) : jobsError ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">
                Failed to load jobs
              </h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-xs">
                Could not connect to the server. Check your connection and try again.
              </p>
              <button
                onClick={() => void refetchJobs()}
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : pagedJobs.length === 0 ? (
            <EmptyState
              hasFilters={activeFilterCount > 0}
              onClear={() => {
                setFilters(DEFAULT_FILTERS);
                setSearchInput("");
              }}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
              {pagedJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  isBookmarked={bookmarkedJobIds.has(job.id)}
                  onBookmarkToggle={handleBookmarkToggle}
                  isBookmarkPending={creatingBookmark || deletingBookmark}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!jobsLoading && totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 pb-4">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page{" "}
                <span className="font-medium text-foreground">{safePage}</span>
                {" "}of{" "}
                <span className="font-medium text-foreground">{totalPages}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="w-80 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-sm">Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <JobFilters
              filters={filters}
              onChange={(next) => {
                setFilters(next);
              }}
              companies={companies}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
