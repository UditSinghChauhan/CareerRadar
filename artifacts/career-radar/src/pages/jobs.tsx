import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  AlertCircle,
  RefreshCw,
  X,
  Plus,
} from "lucide-react";
import {
  useListJobs,
  useListBookmarks,
  useListCompanies,
  useCreateBookmark,
  useDeleteBookmark,
  useGetProfile,
  useGetApplicationStatusMap,
  useCreateApplication,
  useListApplications,
} from "@workspace/api-client-react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import {
  getListBookmarksQueryKey,
  getListJobsQueryKey,
  getGetApplicationStatusMapQueryKey,
  getListApplicationsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetHeader,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { JobCard } from "@/components/jobs/job-card";
import {
  VirtualJobGrid,
  VIRTUALIZE_ABOVE,
} from "@/components/jobs/virtual-job-grid";
import { CaptureDialog } from "@/components/jobs/capture-dialog";
import {
  JobFilters,
  DEFAULT_FILTERS,
  countActiveFilters,
  showEverything,
} from "@/components/jobs/job-filters";
import type { JobFiltersState } from "@/components/jobs/job-filters";
import type {
  ApplicationStatusMap,
  Job,
  ListJobsParams,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Phase 7 moved paging to the server.
 * ───────────────────────────────────
 * Before this, the page asked for `limit: 200`, `paginate()` silently clamped
 * that to 100, and the explorer then sliced those 100 rows into pages of 20 in
 * the browser. With 4,074 active postings that produced "Page 1 of 5" and made
 * the remaining 3,974 unreachable — no filter, no sort and no amount of
 * clicking Next would show them.
 *
 * Now the server does the filtering, the sorting AND the paging, and the page
 * renders exactly the window it was given. Everything the toolbar and the
 * sidebar offer is a query parameter; nothing is narrowed in the browser. That
 * is not a tidiness preference — a browser-side filter over one page of twenty
 * rows would be filtering the page rather than the result set, which is the
 * bug this phase exists to remove.
 */
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;

const DEFAULT_PAGE_SIZE = 20;

type SortKey = "relevance" | "newest" | "deadline" | "salary" | "company";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "deadline", label: "Deadline" },
  { value: "salary", label: "Salary" },
  { value: "company", label: "Company" },
];

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

function EmptyState({
  hasFilters,
  locationFiltered,
  relevanceFiltered,
  onClear,
  onAllLocations,
  onShowEverything,
}: {
  hasFilters: boolean;
  /** The location buckets are narrowing the list — including the defaults. */
  locationFiltered: boolean;
  /** The fresher-eligible / track / score filters are narrowing the list — including the default. */
  relevanceFiltered: boolean;
  onClear: () => void;
  onAllLocations: () => void;
  onShowEverything: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Search className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">
        No jobs found
      </h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-xs">
        {hasFilters
          ? "Try adjusting your filters or search query."
          : relevanceFiltered
            ? "Nothing fresher-eligible in your default view. If the relevance backfill hasn't run yet, every job is still unclassified — Show everything sees past the classifier."
            : locationFiltered
              ? "Nothing in your default locations. If the location backfill hasn't run yet, every job is still in the Unknown bucket."
              : "No active job listings right now. Check back soon."}
      </p>
      <div className="flex gap-2 flex-wrap justify-center">
        {hasFilters && (
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        )}
        {locationFiltered && !relevanceFiltered && (
          <Button variant="outline" size="sm" onClick={onAllLocations}>
            Show all locations
          </Button>
        )}
        {(relevanceFiltered || locationFiltered) && (
          <Button
            variant="outline"
            size="sm"
            data-testid="empty-show-everything"
            onClick={onShowEverything}
          >
            Show everything
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

/**
 * The bookmarklet (see /tools/capture) navigates to
 * `/jobs?capture=1&url=...&text=...`. Read once, then scrub the query string so
 * a refresh does not re-open the dialog with a stale selection.
 */
function readCaptureParams(): { open: boolean; url: string; text: string } {
  if (typeof window === "undefined") return { open: false, url: "", text: "" };
  const params = new URLSearchParams(window.location.search);
  if (params.get("capture") !== "1") return { open: false, url: "", text: "" };

  const url = params.get("url") ?? "";
  const text = params.get("text") ?? "";
  window.history.replaceState({}, "", window.location.pathname);
  return { open: true, url, text };
}

export function JobsPage() {
  const queryClient = useQueryClient();

  // ── Quick capture (Phase 4) ───────────────────────────────────────────────
  const [captureParams] = useState(readCaptureParams);
  const [captureOpen, setCaptureOpen] = useState(captureParams.open);

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Keyboard shortcut: "/" focuses search, Escape clears + blurs
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (
        e.key === "/" &&
        tag !== "INPUT" &&
        tag !== "TEXTAREA" &&
        tag !== "SELECT"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Filters & sort ────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<JobFiltersState>(DEFAULT_FILTERS);
  // Relevance by default (UPGRADE.md §2.3). The server sorts the window the
  // same way, so page 1 is the real top of the feed, not the newest 200.
  const [sort, setSort] = useState<SortKey>("relevance");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  // Reset page whenever the result set or its ordering changes — page 7 of the
  // old query is meaningless against the new one, and with server-side paging
  // it would fetch a window that may not exist.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters, sort, pageSize]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: bookmarksData } = useListBookmarks();
  const { data: companiesData } = useListCompanies({ limit: 100 });
  const { data: profileData } = useGetProfile();
  const profileBatch = profileData?.graduationYear ?? null;

  // Hoisted so the query key below is built from exactly the parameters the
  // request carries — two hand-kept copies would drift, and a stale key is
  // how a page silently serves another page's rows from cache.
  const jobsParams = useMemo(
    (): ListJobsParams => ({
      status: "active",
      search: debouncedSearch || undefined,
      companyId: filters.companyId || undefined,
      jobType:
        filters.jobType !== "all"
          ? (filters.jobType as "internship" | "full_time")
          : undefined,
      // Every narrowing below is a WHERE clause. Phase 7 paginates server-side,
      // so a browser-side pass would filter one page of twenty rows instead of
      // the result set — see the PAGE_SIZE_OPTIONS note at the top of the file.
      locations: filters.locations.length > 0 ? filters.locations : undefined,
      isIndia: filters.indiaOnly ? true : undefined,
      // Relevance (Phase 2.1) — same rule. Absent params = the pre-2.1 list.
      isFresherEligible: filters.fresherOnly ? true : undefined,
      relevanceTrack: filters.tracks.length > 0 ? filters.tracks : undefined,
      minRelevanceScore: filters.minScore > 0 ? filters.minScore : undefined,
      // Phase 3.2 — dismissed rows are hidden server-side unless asked for.
      // Absent means "hide them", so this is only ever sent to widen the list.
      showDismissed: filters.showDismissed ? true : undefined,
      // §2.3: for a profile with a graduation year, the default feed is also
      // scoped to that batch (rows naming no batch still match). Only while
      // the fresher view is on, so "Show everything" really is everything.
      eligibleBatch:
        filters.fresherOnly && profileBatch ? profileBatch : undefined,
      // ── Phase 7: the seven that used to run in the browser ──
      workModes: filters.workModes.length > 0 ? filters.workModes : undefined,
      batches: filters.batches.length > 0 ? filters.batches : undefined,
      branches: filters.branches.length > 0 ? filters.branches : undefined,
      skills: filters.skills.length > 0 ? filters.skills : undefined,
      sourcePlatform: filters.sourcePlatform || undefined,
      deadlineBefore: filters.deadlineBefore || undefined,
      hideApplied: filters.hideApplied ? true : undefined,
      // Every sort key is a server sort now, including deadline, salary and
      // company — which previously ordered only the fetched window.
      sort,
      page,
      limit: pageSize,
    }),
    [debouncedSearch, filters, profileBatch, sort, page, pageSize],
  );

  const {
    data: jobsData,
    isLoading: jobsLoading,
    isError: jobsError,
    refetch: refetchJobs,
  } = useListJobs(jobsParams, {
    query: {
      queryKey: getListJobsQueryKey(jobsParams),
      /**
       * Keep the current page on screen while the next one loads.
       *
       * Without this, `jobsData` is undefined for the duration of every
       * page change, which does more than flash skeletons: `totalPages`
       * falls back to 1 and the clamp below then drags `page` back to 1 —
       * clicking Next fetched page 2 and immediately bounced to page 1.
       * That was invisible in the unit tests and obvious the moment a
       * browser was pointed at 4,100 rows.
       */
      placeholderData: keepPreviousData,
    },
  });

  // Long staleTime: this only changes when the user applies or saves, and both
  // of those paths invalidate it explicitly below.
  const { data: statusMapData } = useGetApplicationStatusMap({
    query: {
      queryKey: getGetApplicationStatusMapQueryKey(),
      staleTime: 5 * 60 * 1000,
    },
  });
  const statusMap = useMemo<ApplicationStatusMap>(
    () => statusMapData ?? {},
    [statusMapData],
  );

  // The status map is status-only by design. The applied-on date for the badge
  // comes from the applications list, which uses the same limit as the
  // Applications page so both share one React Query cache entry.
  const { data: applicationsData } = useListApplications(
    { limit: 200 },
    {
      query: {
        queryKey: getListApplicationsQueryKey({ limit: 200 }),
        staleTime: 5 * 60 * 1000,
      },
    },
  );
  const appliedDates = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const app of applicationsData?.data ?? []) {
      if (app.appliedDate) map[app.jobId] = app.appliedDate;
    }
    return map;
  }, [applicationsData]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const { mutate: createBookmark, isPending: creatingBookmark } =
    useCreateBookmark({
      mutation: {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getListBookmarksQueryKey(),
          });
        },
      },
    });

  const { mutate: deleteBookmark, isPending: deletingBookmark } =
    useDeleteBookmark({
      mutation: {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getListBookmarksQueryKey(),
          });
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

  const statusMapQueryKey = useMemo(
    () => getGetApplicationStatusMapQueryKey(),
    [],
  );

  const { mutateAsync: createApplication } = useCreateApplication();

  // Per-job, not the mutation's global isPending: one in-flight apply must not
  // disable the Apply button on every other card in the list.
  const [pendingJobIds, setPendingJobIds] = useState<Set<string>>(new Set());

  const clearPending = useCallback((jobId: string) => {
    setPendingJobIds((prev) => {
      const next = new Set(prev);
      next.delete(jobId);
      return next;
    });
  }, []);

  // Read off `filters` so `trackApplication` depends on the one boolean rather
  // than on the whole filter object, which changes on every sidebar tick.
  const hideApplied = filters.hideApplied;

  // Optimistically flip the card, then reconcile with the server. Note the tab
  // has already been opened by the click handler in job-card.tsx — a failure
  // here must not try to undo that.
  const trackApplication = useCallback(
    async (jobId: string, status: "applied" | "saved") => {
      const appliedDate = new Date().toISOString();
      setPendingJobIds((prev) => new Set(prev).add(jobId));
      await queryClient.cancelQueries({ queryKey: statusMapQueryKey });
      const previous =
        queryClient.getQueryData<ApplicationStatusMap>(statusMapQueryKey);

      queryClient.setQueryData<ApplicationStatusMap>(
        statusMapQueryKey,
        (current) => ({ ...(current ?? {}), [jobId]: status }),
      );

      try {
        await createApplication({
          data: {
            jobId,
            status,
            ...(status === "applied" ? { appliedDate } : {}),
          },
        });
      } catch {
        if (previous) queryClient.setQueryData(statusMapQueryKey, previous);
        else queryClient.removeQueries({ queryKey: statusMapQueryKey });

        clearPending(jobId);

        toast.error(
          status === "applied"
            ? "Opened the posting, but could not log the application"
            : "Could not save that job",
          {
            action: {
              label: "Retry",
              onClick: () => void trackApplication(jobId, status),
            },
          },
        );
        return;
      }

      clearPending(jobId);
      void queryClient.invalidateQueries({ queryKey: statusMapQueryKey });
      void queryClient.invalidateQueries({
        queryKey: getListApplicationsQueryKey(),
      });
      // "Hide jobs I've applied to" is a WHERE clause as of Phase 7, so the
      // card only leaves the list when the list itself is refetched. While the
      // filter is off there is nothing to remove and the refetch is skipped —
      // it would reorder the page under the user for no reason.
      if (hideApplied) {
        void queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      }
    },
    [
      queryClient,
      statusMapQueryKey,
      createApplication,
      clearPending,
      hideApplied,
    ],
  );

  const handleApply = useCallback(
    (jobId: string) => void trackApplication(jobId, "applied"),
    [trackApplication],
  );

  const handleSave = useCallback(
    (jobId: string) => void trackApplication(jobId, "saved"),
    [trackApplication],
  );

  // A captured job is a new row, so the list has to be refetched before the
  // card can be shown; "Save & mark applied" then logs the application through
  // the same path the Apply button uses, retry toast included.
  const handleCaptureSaved = useCallback(
    (jobId: string, markApplied: boolean) => {
      void queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      if (markApplied) void trackApplication(jobId, "applied");
    },
    [queryClient, trackApplication],
  );

  // ── Derived state ─────────────────────────────────────────────────────────
  const bookmarkedJobIds = useMemo(
    () => new Set((bookmarksData ?? []).map((b) => b.jobId)),
    [bookmarksData],
  );

  // The server returns exactly the page asked for, already filtered and
  // sorted. `pagedJobs` is that window verbatim — there is deliberately no
  // browser-side pass between here and the render.
  const pagedJobs = jobsData?.data ?? [];
  /** Size of the WHOLE filtered result set, not of this page. */
  const serverTotal = jobsData?.meta?.total ?? pagedJobs.length;
  const totalPages = Math.max(1, jobsData?.meta?.totalPages ?? 1);
  const safePage = Math.min(page, totalPages);

  // If something narrowed the set while the user was on a late page, walk back
  // rather than leaving them staring at an empty grid with a Previous button.
  // Only ever acts on a real response: `totalPages` falls back to 1 when there
  // is no data, and clamping against that fallback would reset the page on
  // every load rather than only when the set actually shrank.
  useEffect(() => {
    const serverTotalPages = jobsData?.meta?.totalPages;
    if (serverTotalPages && page > serverTotalPages) setPage(serverTotalPages);
  }, [page, jobsData]);

  const activeFilterCount =
    countActiveFilters(filters) + (debouncedSearch ? 1 : 0);
  const companies = companiesData?.data ?? [];
  const relevanceFiltered =
    filters.fresherOnly || filters.tracks.length > 0 || filters.minScore > 0;

  // One card, rendered identically by the plain grid and the virtualised one,
  // so switching between them at 100 rows cannot change what a card looks like.
  const renderCard = useCallback(
    (job: Job) => (
      <JobCard
        key={job.id}
        job={job}
        isBookmarked={bookmarkedJobIds.has(job.id)}
        onBookmarkToggle={handleBookmarkToggle}
        isBookmarkPending={creatingBookmark || deletingBookmark}
        applicationStatus={statusMap[job.id] ?? null}
        appliedDate={appliedDates[job.id] ?? null}
        onApply={handleApply}
        onSave={handleSave}
        isApplyPending={pendingJobIds.has(job.id)}
      />
    ),
    [
      bookmarkedJobIds,
      handleBookmarkToggle,
      creatingBookmark,
      deletingBookmark,
      statusMap,
      appliedDates,
      handleApply,
      handleSave,
      pendingJobIds,
    ],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Page header */}
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-xl font-bold tracking-tight">Jobs Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Browse and filter active opportunities. All data is sourced from
          official provider APIs.
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
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search roles, companies, skills..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearchInput("");
                      searchInputRef.current?.blur();
                    }
                  }}
                  className="pl-8 pr-8 h-9 text-sm"
                />
                {searchInput ? (
                  <button
                    onClick={() => {
                      setSearchInput("");
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:flex h-5 items-center rounded border border-border bg-muted px-1 text-[10px] font-mono text-muted-foreground select-none pointer-events-none">
                    /
                  </kbd>
                )}
              </div>

              {/* Sort */}
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-9 w-32 text-sm gap-1">
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

              {/* Phase 4: quick capture for the boards with no API */}
              <Button
                size="sm"
                className="h-9 gap-1.5"
                data-testid="add-job"
                onClick={() => setCaptureOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add job
              </Button>
            </div>

            {/* Quick type chips — one-click filter for the most common case */}
            <div className="flex items-center gap-1.5">
              {(
                [
                  { value: "all", label: "All" },
                  { value: "internship", label: "Internship" },
                  { value: "full_time", label: "Full-Time" },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFilters((f) => ({ ...f, jobType: value }))}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                    filters.jobType === value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Results meta */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {jobsLoading ? (
                "Loading..."
              ) : (
                <>
                  {/* The whole filtered result set. Before Phase 7 this said
                      how big the fetched WINDOW was, with the real total only
                      appearing as "N of M" — now the server counts the set and
                      the page is just a window into it. */}
                  <span
                    className="font-medium text-foreground"
                    data-testid="job-total"
                  >
                    {serverTotal.toLocaleString("en-IN")}
                  </span>{" "}
                  {serverTotal === 1 ? "job" : "jobs"}
                  {activeFilterCount > 0 ? " matching filters" : ""}
                </>
              )}
            </p>
            <p
              className="text-xs text-muted-foreground"
              data-testid="view-mode"
            >
              {filters.fresherOnly ? (
                <>
                  Fresher-eligible
                  {profileBatch ? (
                    <>
                      {" · "}batch{" "}
                      <span className="font-medium text-foreground">
                        {profileBatch}
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                "All jobs"
              )}
            </p>
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
                Could not connect to the server. Check your connection and try
                again.
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
              locationFiltered={filters.locations.length > 0}
              relevanceFiltered={relevanceFiltered}
              onClear={() => {
                setFilters(DEFAULT_FILTERS);
                setSearchInput("");
              }}
              onAllLocations={() =>
                setFilters((f) => ({ ...f, locations: [], indiaOnly: false }))
              }
              onShowEverything={() => setFilters((f) => showEverything(f))}
            />
          ) : pagedJobs.length > VIRTUALIZE_ABOVE ? (
            // Only past 100 rows, i.e. the 200-per-page setting. See
            // virtual-job-grid.tsx for what windowing costs.
            <VirtualJobGrid
              items={pagedJobs}
              columns={2}
              getKey={(job) => job.id}
            >
              {(job) => renderCard(job)}
            </VirtualJobGrid>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
              {pagedJobs.map((job) => renderCard(job))}
            </div>
          )}

          {/* Pagination. `totalPages` is the server's count over the whole
              filtered set, so "Page 3 of 204" means there really are 204. */}
          {!jobsLoading && !jobsError && pagedJobs.length > 0 && (
            <div
              className="flex items-center justify-between gap-2 pt-2 pb-4"
              data-testid="pagination"
            >
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>

              <div className="flex items-center gap-3">
                <span
                  className="text-xs text-muted-foreground"
                  data-testid="page-indicator"
                >
                  Page{" "}
                  <span className="font-medium text-foreground">
                    {safePage}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-foreground">
                    {totalPages.toLocaleString("en-IN")}
                  </span>
                </span>
                {/* Paging 4,000 rows twenty at a time is 200 clicks. The
                    larger sizes are what make the full set navigable; past
                    100 the grid virtualises. */}
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    // Both in one handler so React batches them into a single
                    // render: setting the size alone would fetch the current
                    // page at the new size, and the reset effect would then
                    // immediately fetch page 1 as well.
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    className="h-8 w-[104px] text-xs"
                    data-testid="page-size"
                    aria-label="Jobs per page"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem
                        key={size}
                        value={String(size)}
                        className="text-xs"
                      >
                        {size} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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

      {/* Quick capture dialog */}
      <CaptureDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        initialUrl={captureParams.url}
        initialText={captureParams.text}
        autoParse={captureParams.open}
        onSaved={handleCaptureSaved}
      />

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
