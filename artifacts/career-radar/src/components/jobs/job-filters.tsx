import { X, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Company } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

/** The three tracks the user can filter to. not_relevant is what fresherOnly hides. */
export type RelevanceTrackFilter = "internship" | "new_grad" | "early_career";

export interface JobFiltersState {
  jobType: "all" | "internship" | "full_time";
  workModes: Array<"remote" | "hybrid" | "onsite">;
  batches: number[];
  branches: string[];
  skills: string[];
  sourcePlatform: string;
  companyId: string;
  deadlineBefore: string;
  hideApplied: boolean;
  /**
   * Phase 2.0 location buckets, OR-ed together and applied SERVER-SIDE via
   * `?locations=`. The page fetches a bounded window of rows, so filtering
   * these in the browser would silently miss every match outside the window.
   * Empty = every location (the pre-2.0 behaviour).
   */
  locations: string[];
  /** Phase 2.0. `?isIndia=true`. Off by default so unplaced rows stay reviewable. */
  indiaOnly: boolean;
  /**
   * Phase 2.1. `?isFresherEligible=true` — only rows the classifier put on
   * the internship / new_grad / early_career track. ON by default: this is
   * the point of the classifier. Off = the pre-2.1 list, and the "Show
   * everything" escape hatch for when the classifier is wrong.
   */
  fresherOnly: boolean;
  /** Phase 2.1. `?relevanceTrack=` OR-ed. Empty = every fresher-eligible track. */
  tracks: RelevanceTrackFilter[];
  /** Phase 2.1. `?minRelevanceScore=`. 0 = no floor. */
  minScore: number;
  /**
   * Phase 3.2. `?showDismissed=true` — bring back rows the user dismissed
   * from Today's Queue. OFF by default, which is what §3.2 asks for: a
   * dismissal means "not this one" and should stick. Server-side, like every
   * other narrowing here.
   */
  showDismissed: boolean;
}

export const TRACK_OPTIONS: Array<{
  key: RelevanceTrackFilter;
  label: string;
}> = [
  { key: "internship", label: "Internship" },
  { key: "new_grad", label: "New Grad" },
  { key: "early_career", label: "Early Career" },
];

export const MIN_SCORE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Any score" },
  { value: 60, label: "60+" },
  { value: 80, label: "80+" },
  { value: 90, label: "90+" },
];

/**
 * The buckets the Jobs page offers. Keys are what the API accepts in
 * `?locations=`; metro keys must equal `locationMetro` values exactly.
 * Mirrors FEATURED_METROS in the API's relevance/location.ts.
 */
export const LOCATION_BUCKETS: Array<{ key: string; label: string }> = [
  { key: "NCR", label: "Delhi NCR" },
  { key: "Bengaluru", label: "Bengaluru" },
  { key: "Hyderabad", label: "Hyderabad" },
  { key: "Pune", label: "Pune" },
  { key: "MMR", label: "Mumbai" },
  { key: "Chennai", label: "Chennai" },
  { key: "Kolkata", label: "Kolkata" },
  { key: "other_india", label: "Other India" },
  // Bare 'India' with no city. Labelled so the user knows it is NOT
  // necessarily near them — it is unstated, not "elsewhere".
  { key: "india_unspecified", label: "India (city unstated)" },
  { key: "remote", label: "Remote" },
  { key: "unknown", label: "Unknown location" },
];

/** Where the user is, the big SDE hubs, and location-agnostic remote (UPGRADE.md §2.0). */
export const DEFAULT_LOCATIONS = [
  "NCR",
  "Bengaluru",
  "Hyderabad",
  "Pune",
  "remote",
  "india_unspecified",
];

export const DEFAULT_FILTERS: JobFiltersState = {
  jobType: "all",
  workModes: [],
  batches: [],
  branches: [],
  skills: [],
  sourcePlatform: "",
  companyId: "",
  deadlineBefore: "",
  // On by default: the jobs list should never re-offer something already done.
  hideApplied: true,
  locations: DEFAULT_LOCATIONS,
  indiaOnly: false,
  fresherOnly: true,
  tracks: [],
  minScore: 0,
  showDismissed: false,
};

/**
 * The escape hatch (UPGRADE.md §2.3). The classifier and the location
 * normaliser will both be wrong sometimes, and the user must be able to see
 * past them in one click: every server-side narrowing off, every batch chip
 * off. `hideApplied` is left alone — that is the tracker's own state, not a
 * guess about the job. Sort is left alone too; it changes order, not
 * membership.
 */
export function showEverything(filters: JobFiltersState): JobFiltersState {
  return {
    ...filters,
    jobType: "all",
    batches: [],
    locations: [],
    indiaOnly: false,
    fresherOnly: false,
    tracks: [],
    minScore: 0,
    // A dismissal is the user's own explicit decision about a specific job,
    // not a guess the classifier made, so "Show everything" reveals it too —
    // "everything" has to mean everything for the escape hatch to be worth
    // trusting.
    showDismissed: true,
  };
}

/** True when nothing server-side is narrowing the list — the pre-2.0/2.1 view. */
export function isShowingEverything(filters: JobFiltersState): boolean {
  return (
    filters.jobType === "all" &&
    filters.batches.length === 0 &&
    filters.locations.length === 0 &&
    !filters.indiaOnly &&
    !filters.fresherOnly &&
    filters.tracks.length === 0 &&
    filters.minScore === 0 &&
    filters.showDismissed
  );
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const BATCH_YEARS = [
  CURRENT_YEAR,
  CURRENT_YEAR + 1,
  CURRENT_YEAR + 2,
  CURRENT_YEAR + 3,
];

const BRANCHES = [
  "CSE",
  "IT",
  "ECE",
  "EEE",
  "ME",
  "CE",
  "Chem E",
  "Mathematics",
  "Physics",
  "BCA",
  "MCA",
  "MBA",
];

const WORK_MODES: Array<{
  value: "remote" | "hybrid" | "onsite";
  label: string;
}> = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

const SOURCE_PLATFORMS = [
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
];

// ─── Active filter count ──────────────────────────────────────────────────────

export function countActiveFilters(filters: JobFiltersState): number {
  let n = 0;
  if (filters.jobType !== "all") n++;
  if (filters.workModes.length > 0) n++;
  if (filters.batches.length > 0) n++;
  if (filters.branches.length > 0) n++;
  if (filters.skills.length > 0) n++;
  if (filters.sourcePlatform) n++;
  if (filters.companyId) n++;
  if (filters.deadlineBefore) n++;
  // Location counts only once it differs from the default set — same reason
  // as hideApplied below: an untouched page must not show a badge.
  if (!sameSet(filters.locations, DEFAULT_LOCATIONS)) n++;
  if (filters.indiaOnly) n++;
  if (filters.tracks.length > 0) n++;
  if (filters.minScore > 0) n++;
  // Counted when ON, unlike fresherOnly: showing dismissed rows is a
  // deliberate widening away from the default, so the badge is the reminder
  // that the list includes things already rejected.
  if (filters.showDismissed) n++;
  // hideApplied and fresherOnly are deliberately not counted. Both are on by
  // default, so counting them would show a permanent "1 active filter" badge
  // on an untouched page; and turning fresherOnly OFF is widening, not
  // filtering — the "Back to my feed" link covers the way back.
  return n;
}

// ─── Filter section ──────────────────────────────────────────────────────────

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface JobFiltersProps {
  filters: JobFiltersState;
  onChange: (next: JobFiltersState) => void;
  companies: Company[];
}

export function JobFilters({ filters, onChange, companies }: JobFiltersProps) {
  const set = <K extends keyof JobFiltersState>(
    key: K,
    value: JobFiltersState[K],
  ) => onChange({ ...filters, [key]: value });

  const toggleArray = <T extends string | number>(
    key: keyof JobFiltersState,
    value: T,
    current: T[],
  ) => {
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    set(key, next as JobFiltersState[typeof key]);
  };

  const activeCount = countActiveFilters(filters);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Filters</span>
          {activeCount > 0 && (
            <Badge className="h-4 px-1.5 text-[10px] bg-primary/10 text-primary border-0">
              {activeCount}
            </Badge>
          )}
        </div>
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange(DEFAULT_FILTERS)}
          >
            <X className="h-3 w-3 mr-1" />
            Clear all
          </Button>
        )}
      </div>

      <Separator />

      {/* My applications */}
      <FilterSection title="My Applications">
        <div className="flex items-center gap-2">
          <Checkbox
            id="filter-hide-applied"
            checked={filters.hideApplied}
            onCheckedChange={(checked) => set("hideApplied", checked === true)}
          />
          <Label
            htmlFor="filter-hide-applied"
            className="text-xs font-normal cursor-pointer"
          >
            Hide jobs I've applied to
          </Label>
        </div>
      </FilterSection>

      {/* Company */}
      {companies.length > 0 && (
        <FilterSection title="Company">
          <Select
            value={filters.companyId || "all"}
            onValueChange={(v) => set("companyId", v === "all" ? "" : v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Job Type */}
      <FilterSection title="Job Type">
        <div className="flex flex-col gap-2">
          {[
            { value: "all", label: "All" },
            { value: "internship", label: "Internship" },
            { value: "full_time", label: "Full Time" },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() =>
                set("jobType", value as JobFiltersState["jobType"])
              }
              className={`flex items-center gap-2 text-sm rounded px-2 py-1 transition-colors w-full text-left ${
                filters.jobType === value
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span
                className={`inline-block w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                  filters.jobType === value
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/40"
                }`}
              />
              {label}
            </button>
          ))}
        </div>
      </FilterSection>

      <Separator />

      {/* Relevance — Phase 2.1. The classifier's verdict, filtered on the
          server. fresherOnly is the default view; "Show everything" is the
          escape hatch for when the classifier is wrong. */}
      <FilterSection title="Relevance">
        <div className="flex items-center gap-2">
          <Checkbox
            id="filter-fresher-only"
            checked={filters.fresherOnly}
            onCheckedChange={(checked) => set("fresherOnly", checked === true)}
          />
          <Label
            htmlFor="filter-fresher-only"
            className="text-xs font-normal cursor-pointer"
          >
            Fresher-eligible only
            <span className="block text-[10px] text-muted-foreground/70">
              Hides senior, level II+, and 2+ years roles
            </span>
          </Label>
        </div>
        {/* Phase 3.2 — the way back from a dismissal. */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="filter-show-dismissed"
            data-testid="show-dismissed-checkbox"
            checked={filters.showDismissed}
            onCheckedChange={(checked) =>
              set("showDismissed", checked === true)
            }
          />
          <Label
            htmlFor="filter-show-dismissed"
            className="text-xs font-normal cursor-pointer"
          >
            Show dismissed
            <span className="block text-[10px] text-muted-foreground/70">
              Jobs you dismissed from Today&apos;s Queue
            </span>
          </Label>
        </div>
        <div className="flex flex-wrap gap-1.5" data-testid="track-chips">
          {TRACK_OPTIONS.map(({ key, label }) => {
            const active = filters.tracks.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                data-track-chip={key}
                onClick={() => toggleArray("tracks", key, filters.tracks)}
                className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <Select
          value={String(filters.minScore)}
          onValueChange={(v) => set("minScore", Number(v))}
        >
          <SelectTrigger
            className="h-8 text-xs"
            aria-label="Minimum relevance score"
          >
            <SelectValue placeholder="Any score" />
          </SelectTrigger>
          <SelectContent>
            {MIN_SCORE_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={String(value)} className="text-xs">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isShowingEverything(filters) ? (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Back to my feed
          </button>
        ) : (
          <button
            type="button"
            data-testid="show-everything"
            onClick={() => onChange(showEverything(filters))}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            title="Every active job, no relevance or location filtering — for when the classifier is wrong"
          >
            Show everything
          </button>
        )}
      </FilterSection>

      <Separator />

      {/* Location — Phase 2.0. Buckets are OR-ed and filtered on the server. */}
      <FilterSection title="Location">
        <div className="flex flex-wrap gap-1.5" data-testid="location-buckets">
          {LOCATION_BUCKETS.map(({ key, label }) => {
            const active = filters.locations.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                data-location-bucket={key}
                onClick={() => toggleArray("locations", key, filters.locations)}
                className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => set("locations", [])}
            disabled={filters.locations.length === 0}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-default underline-offset-2 hover:underline"
          >
            All locations
          </button>
          <span className="text-muted-foreground/40 text-xs">·</span>
          <button
            type="button"
            onClick={() => set("locations", DEFAULT_LOCATIONS)}
            disabled={sameSet(filters.locations, DEFAULT_LOCATIONS)}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-default underline-offset-2 hover:underline"
          >
            Reset to my defaults
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="filter-india-only"
            checked={filters.indiaOnly}
            onCheckedChange={(checked) => set("indiaOnly", checked === true)}
          />
          <Label
            htmlFor="filter-india-only"
            className="text-xs font-normal cursor-pointer"
          >
            India only
            <span className="block text-[10px] text-muted-foreground/70">
              Hides jobs whose location couldn't be placed
            </span>
          </Label>
        </div>
      </FilterSection>

      <Separator />

      {/* Work Mode */}
      <FilterSection title="Work Mode">
        <div className="flex flex-col gap-2">
          {WORK_MODES.map(({ value, label }) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`wm-${value}`}
                checked={filters.workModes.includes(value)}
                onCheckedChange={() =>
                  toggleArray("workModes", value, filters.workModes)
                }
                className="h-4 w-4"
              />
              <Label
                htmlFor={`wm-${value}`}
                className="text-sm font-normal cursor-pointer"
              >
                {label}
              </Label>
            </div>
          ))}
        </div>
      </FilterSection>

      <Separator />

      {/* Batch Year */}
      <FilterSection title="Batch Year">
        <div className="flex flex-wrap gap-2">
          {BATCH_YEARS.map((yr) => (
            <button
              key={yr}
              onClick={() => toggleArray("batches", yr, filters.batches)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                filters.batches.includes(yr)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      </FilterSection>

      <Separator />

      {/* Branch */}
      <FilterSection title="Branch">
        <div className="flex flex-wrap gap-1.5">
          {BRANCHES.map((branch) => (
            <button
              key={branch}
              onClick={() => toggleArray("branches", branch, filters.branches)}
              className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                filters.branches.includes(branch)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {branch}
            </button>
          ))}
        </div>
      </FilterSection>

      <Separator />

      {/* Deadline */}
      <FilterSection title="Deadline">
        <div className="flex gap-1.5 mb-2">
          {(
            [
              { label: "7 days", days: 7 },
              { label: "30 days", days: 30 },
            ] as const
          ).map(({ label, days }) => {
            const dateStr = new Date(Date.now() + days * 86400000)
              .toISOString()
              .slice(0, 10);
            const active = filters.deadlineBefore === dateStr;
            return (
              <button
                key={days}
                onClick={() => set("deadlineBefore", active ? "" : dateStr)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={filters.deadlineBefore}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => set("deadlineBefore", e.target.value)}
            className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {filters.deadlineBefore && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => set("deadlineBefore", "")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </FilterSection>

      <Separator />

      {/* Source Platform */}
      <FilterSection title="Source">
        <Select
          value={filters.sourcePlatform || "all"}
          onValueChange={(v) => set("sourcePlatform", v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {SOURCE_PLATFORMS.map(({ value, label }) => (
              <SelectItem key={value} value={value} className="text-xs">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterSection>
    </div>
  );
}
