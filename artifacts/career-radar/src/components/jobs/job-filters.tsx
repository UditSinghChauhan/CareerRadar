import { X, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Company } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JobFiltersState {
  jobType: "all" | "internship" | "full_time";
  workModes: Array<"remote" | "hybrid" | "onsite">;
  batches: number[];
  branches: string[];
  skills: string[];
  sourcePlatform: string;
  companyId: string;
  deadlineBefore: string;
}

export const DEFAULT_FILTERS: JobFiltersState = {
  jobType: "all",
  workModes: [],
  batches: [],
  branches: [],
  skills: [],
  sourcePlatform: "",
  companyId: "",
  deadlineBefore: "",
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const BATCH_YEARS = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3];

const BRANCHES = [
  "CSE", "IT", "ECE", "EEE", "ME", "CE", "Chem E",
  "Mathematics", "Physics", "BCA", "MCA", "MBA",
];

const WORK_MODES: Array<{ value: "remote" | "hybrid" | "onsite"; label: string }> = [
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
  return n;
}

// ─── Filter section ──────────────────────────────────────────────────────────

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
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
  const set = <K extends keyof JobFiltersState>(key: K, value: JobFiltersState[K]) =>
    onChange({ ...filters, [key]: value });

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
              onClick={() => set("jobType", value as JobFiltersState["jobType"])}
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

      {/* Work Mode */}
      <FilterSection title="Work Mode">
        <div className="flex flex-col gap-2">
          {WORK_MODES.map(({ value, label }) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`wm-${value}`}
                checked={filters.workModes.includes(value)}
                onCheckedChange={() => toggleArray("workModes", value, filters.workModes)}
                className="h-4 w-4"
              />
              <Label htmlFor={`wm-${value}`} className="text-sm font-normal cursor-pointer">
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
          {([
            { label: "7 days", days: 7 },
            { label: "30 days", days: 30 },
          ] as const).map(({ label, days }) => {
            const dateStr = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
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
