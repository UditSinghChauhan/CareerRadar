import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  Briefcase,
  Clock,
  LayoutGrid,
  RefreshCw,
  Table as TableIcon,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetApplicationStatusMapQueryKey,
  getListApplicationsQueryKey,
  useDeleteApplication,
  useListApplications,
  useUpdateApplication,
} from "@workspace/api-client-react";
import type {
  Application,
  ApplicationListResponse,
  ApplicationUpdateInput,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApplicationBoard } from "@/components/applications/application-board";
import {
  ApplicationTable,
  sortApplications,
  type SortDirection,
  type TableSortKey,
} from "@/components/applications/application-table";
import { ApplicationDrawer } from "@/components/applications/application-drawer";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  type BoardStatus,
} from "@/components/applications/status";

// ─── View persistence ─────────────────────────────────────────────────────────

export type ApplicationsView = "board" | "table";

const VIEW_STORAGE_KEY = "careerradar:applications:view";

/**
 * Phase 6.1's "Awaiting follow-up" filter.
 *
 * Server-side, not a pass over the fetched rows, for the same reason the Jobs
 * page filters server-side: the cutoff is `now()` compared against the
 * database's clock, and the terminal-status exclusion belongs next to it. A
 * browser-side version would also drift — a tab left open overnight would keep
 * using the timestamp it loaded with.
 */
export type ApplicationsScope = "all" | "awaiting-follow-up";

export function readStoredView(
  storage: Pick<Storage, "getItem"> | undefined = safeStorage(),
): ApplicationsView {
  try {
    const raw = storage?.getItem(VIEW_STORAGE_KEY);
    return raw === "table" || raw === "board" ? raw : "board";
  } catch {
    return "board";
  }
}

export function writeStoredView(
  view: ApplicationsView,
  storage: Pick<Storage, "setItem"> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Private-mode / disabled storage: the toggle still works for this session.
  }
}

function safeStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

// A page size large enough that the board shows a real pipeline rather than a
// paginated slice of it; the tracker is for one user, not a public feed.
const PAGE_LIMIT = 200;

// ─── Empty / error states ─────────────────────────────────────────────────────

function EmptyState({
  scope,
  onShowAll,
}: {
  scope: ApplicationsScope;
  onShowAll: () => void;
}) {
  // An empty "Awaiting follow-up" list is the good outcome, not a dead end —
  // saying "no applications yet" there would read as a bug to someone who can
  // see forty rows one click away.
  if (scope === "awaiting-follow-up") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Clock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">
          Nothing to chase
        </h3>
        <p className="mb-4 max-w-xs text-sm text-muted-foreground">
          Nothing has a follow-up date that has come due. Set one in an
          application&apos;s drawer and it will appear here on the day.
        </p>
        <Button size="sm" variant="outline" onClick={onShowAll}>
          Show all applications
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Briefcase className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-foreground">
        No applications yet
      </h3>
      <p className="mb-4 max-w-xs text-sm text-muted-foreground">
        Applying to a job from the Jobs Explorer adds it here automatically.
      </p>
      <Button asChild size="sm">
        <Link href="/jobs">Browse jobs</Link>
      </Button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-md" />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ApplicationsPage() {
  const queryClient = useQueryClient();

  const [view, setView] = useState<ApplicationsView>(() => readStoredView());
  const [sortKey, setSortKey] = useState<TableSortKey>("appliedDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [scope, setScope] = useState<ApplicationsScope>("all");

  const listParams = useMemo(
    () => ({
      limit: PAGE_LIMIT,
      // Omitted entirely when off, so the "all" query key and its cache entry
      // are byte-identical to the pre-6.1 one.
      ...(scope === "awaiting-follow-up"
        ? { awaitingFollowUp: true }
        : undefined),
    }),
    [scope],
  );

  const listQueryKey = useMemo(
    () => getListApplicationsQueryKey(listParams),
    [listParams],
  );

  const {
    data,
    isLoading,
    isError,
    refetch: refetchApplications,
  } = useListApplications(listParams);

  const applications = useMemo(() => data?.data ?? [], [data]);

  const invalidateAll = useCallback(() => {
    // Both scopes, not just the visible one. Setting a status to "offered" or
    // clearing a follow-up date changes which list a row belongs to, so the
    // other scope's cache is stale the moment this one is.
    // `.slice(0, 1)` keeps only the path segment of the generated key, so this
    // is a prefix match across every params combination rather than one exact
    // key.
    void queryClient.invalidateQueries({
      queryKey: getListApplicationsQueryKey().slice(0, 1),
    });
    void queryClient.invalidateQueries({
      queryKey: getGetApplicationStatusMapQueryKey(),
    });
  }, [queryClient]);

  // Optimistically patch one row in the cached list, returning the previous
  // snapshot so the caller can roll back if the request fails.
  const patchCache = useCallback(
    (id: string, patch: Partial<Application>) => {
      const previous =
        queryClient.getQueryData<ApplicationListResponse>(listQueryKey);
      queryClient.setQueryData<ApplicationListResponse>(
        listQueryKey,
        (current) =>
          current && {
            ...current,
            data: current.data.map((a) =>
              a.id === id ? { ...a, ...patch } : a,
            ),
          },
      );
      return previous;
    },
    [queryClient, listQueryKey],
  );

  const { mutateAsync: updateApplication, isPending: isUpdating } =
    useUpdateApplication();
  const { mutateAsync: deleteApplication } = useDeleteApplication();

  const applyUpdate = useCallback(
    async (id: string, patch: ApplicationUpdateInput) => {
      await queryClient.cancelQueries({ queryKey: listQueryKey });
      const previous = patchCache(id, patch as Partial<Application>);

      try {
        await updateApplication({ id, data: patch });
      } catch {
        // Roll back to exactly what was on screen before the drag/edit.
        if (previous) queryClient.setQueryData(listQueryKey, previous);
        toast.error("Could not save that change", {
          action: {
            label: "Retry",
            onClick: () => void applyUpdate(id, patch),
          },
        });
        return;
      }
      invalidateAll();
    },
    [queryClient, listQueryKey, patchCache, updateApplication, invalidateAll],
  );

  const handleStatusChange = useCallback(
    (id: string, status: BoardStatus) => {
      void applyUpdate(id, { status });
    },
    [applyUpdate],
  );

  const handleSortChange = useCallback(
    (key: TableSortKey) => {
      if (key === sortKey) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDirection("asc");
      }
    },
    [sortKey],
  );

  const handleScopeChange = useCallback((next: ApplicationsScope) => {
    setScope(next);
    // Same reason as the view toggle: a selection made against the other list
    // would let a bulk action fire on rows that are no longer on screen.
    setSelectedIds(new Set());
  }, []);

  const handleViewChange = useCallback((next: ApplicationsView) => {
    setView(next);
    writeStoredView(next);
    // Selection is a table-only concept; leaving it set would let a later
    // bulk action fire against rows the user can no longer see.
    setSelectedIds(new Set());
  }, []);

  const sorted = useMemo(
    () => sortApplications(applications, sortKey, sortDirection),
    [applications, sortKey, sortDirection],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === sorted.length
        ? new Set()
        : new Set(sorted.map((a) => a.id)),
    );
  }, [sorted]);

  const bulkStatusChange = useCallback(
    async (status: BoardStatus) => {
      const ids = [...selectedIds];
      const results = await Promise.allSettled(
        ids.map((id) => updateApplication({ id, data: { status } })),
      );
      const failed = results.filter((r) => r.status === "rejected").length;

      invalidateAll();
      setSelectedIds(new Set());

      if (failed > 0) {
        toast.error(
          `${failed} of ${ids.length} could not be moved to ${STATUS_LABELS[status]}`,
        );
      } else {
        toast.success(`Moved ${ids.length} to ${STATUS_LABELS[status]}`);
      }
    },
    [selectedIds, updateApplication, invalidateAll],
  );

  const bulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    const results = await Promise.allSettled(
      ids.map((id) => deleteApplication({ id })),
    );
    const failed = results.filter((r) => r.status === "rejected").length;

    invalidateAll();
    setSelectedIds(new Set());

    if (failed > 0) {
      toast.error(`${failed} of ${ids.length} could not be deleted`);
    } else {
      toast.success(
        `Deleted ${ids.length} application${ids.length === 1 ? "" : "s"}`,
      );
    }
  }, [selectedIds, deleteApplication, invalidateAll]);

  const drawerApplication = applications.find((a) => a.id === drawerId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight">Applications</h1>
          <p className="text-sm text-muted-foreground">
            Every role you have saved or applied to, from first click to offer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <Button
              size="sm"
              variant={scope === "all" ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => handleScopeChange("all")}
              aria-pressed={scope === "all"}
              data-testid="scope-all"
            >
              All
            </Button>
            <Button
              size="sm"
              variant={scope === "awaiting-follow-up" ? "secondary" : "ghost"}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => handleScopeChange("awaiting-follow-up")}
              aria-pressed={scope === "awaiting-follow-up"}
              data-testid="scope-awaiting-follow-up"
            >
              <Clock className="h-3.5 w-3.5" />
              Awaiting follow-up
            </Button>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <Button
              size="sm"
              variant={view === "board" ? "secondary" : "ghost"}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => handleViewChange("board")}
              aria-pressed={view === "board"}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Board
            </Button>
            <Button
              size="sm"
              variant={view === "table" ? "secondary" : "ghost"}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => handleViewChange("table")}
              aria-pressed={view === "table"}
            >
              <TableIcon className="h-3.5 w-3.5" />
              Table
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk action bar — table view only */}
      {view === "table" && selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-foreground">
            {selectedIds.size} selected
          </span>
          <Select
            value=""
            onValueChange={(v) => void bulkStatusChange(v as BoardStatus)}
          >
            <SelectTrigger className="h-7 w-40 text-xs">
              <SelectValue placeholder="Change status…" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => void bulkDelete()}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            Failed to load applications
          </h3>
          <button
            onClick={() => void refetchApplications()}
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : applications.length === 0 ? (
        <EmptyState scope={scope} onShowAll={() => handleScopeChange("all")} />
      ) : view === "board" ? (
        <ApplicationBoard
          applications={applications}
          onStatusChange={handleStatusChange}
          onOpen={(app) => setDrawerId(app.id)}
        />
      ) : (
        <ApplicationTable
          applications={sorted}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onOpen={(app) => setDrawerId(app.id)}
        />
      )}

      <ApplicationDrawer
        application={drawerApplication}
        open={drawerId !== null}
        onOpenChange={(open) => !open && setDrawerId(null)}
        onSave={applyUpdate}
        isSaving={isUpdating}
      />
    </div>
  );
}
