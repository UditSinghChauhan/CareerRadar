import { memo, useState } from "react";
import {
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  MapPin,
  Building2,
  BadgeCheck,
  Clock,
  Check,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  statusBadgeClass,
  statusLabel,
} from "@/components/applications/status";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow, parseISO } from "date-fns";
import type { Job } from "@workspace/api-client-react";

interface JobCardProps {
  job: Job;
  isBookmarked: boolean;
  onBookmarkToggle: (jobId: string, isCurrentlyBookmarked: boolean) => void;
  isBookmarkPending?: boolean;
  /** Current application status for this job, if the user already has one. */
  applicationStatus?: string | null;
  /** Applied date for the badge; only meaningful when status is "applied". */
  appliedDate?: string | null;
  /** Fired after the new tab has already been opened synchronously. */
  onApply?: (jobId: string) => void;
  onSave?: (jobId: string) => void;
  isApplyPending?: boolean;
  /**
   * Phase 8. The stored AI match score for this job, 0–100, or null/undefined
   * when none has been computed yet.
   *
   * It arrives from a SEPARATE query to `GET /api/ai/match-scores`, which is a
   * pure table read. The card never waits for it: it renders with the badge
   * absent and gains one when the query resolves, which is what §8's "never
   * block a card's render waiting for it" means in practice. A card whose score
   * has not been computed simply never shows the badge.
   */
  matchScore?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function isNewToday(createdAt: string): boolean {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs < 24 * 60 * 60 * 1000;
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function formatCompensation(job: Job): string | null {
  if (job.jobType === "internship") {
    if (job.stipend) {
      return `₹${job.stipend.toLocaleString("en-IN")}/mo`;
    }
    return null;
  }
  const min = job.salaryMin;
  const max = job.salaryMax;
  if (min && max) {
    return `₹${(min / 100000).toFixed(0)}L – ₹${(max / 100000).toFixed(0)}L PA`;
  }
  if (max) return `Up to ₹${(max / 100000).toFixed(0)}L PA`;
  if (min) return `₹${(min / 100000).toFixed(0)}L+ PA`;
  return null;
}

type DeadlineUrgency = "critical" | "soon" | "normal" | "expired";

function parseDeadline(deadline: string | null | undefined): {
  text: string;
  urgency: DeadlineUrgency | "none";
} {
  if (!deadline) return { text: "", urgency: "none" };
  const diffMs = new Date(deadline).getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { text: "Expired", urgency: "expired" };
  if (diffDays === 0) return { text: "Closes today", urgency: "critical" };
  if (diffDays === 1) return { text: "1d left", urgency: "critical" };
  if (diffDays <= 3) return { text: `${diffDays}d left`, urgency: "critical" };
  if (diffDays <= 7) return { text: `${diffDays}d left`, urgency: "soon" };
  return { text: `${diffDays}d left`, urgency: "normal" };
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const deadlineColors: Record<string, string> = {
  critical: "text-red-500 dark:text-red-400",
  soon: "text-amber-500 dark:text-amber-400",
  normal: "text-emerald-600 dark:text-emerald-400",
  expired: "text-muted-foreground line-through",
  none: "text-muted-foreground",
};

const workModeLabels: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

/**
 * Phase 2.1 track badge. not_relevant gets a muted badge too — it only shows
 * when the user has chosen "Show everything", and there the reason it was
 * ruled out is exactly what they want to see on hover.
 */
const trackBadge: Record<string, { label: string; className: string }> = {
  internship: {
    label: "Internship",
    className:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  new_grad: {
    label: "New Grad",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  early_career: {
    label: "Early Career",
    className:
      "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  },
  not_relevant: {
    label: "Not for freshers",
    className: "bg-muted text-muted-foreground border-border",
  },
};

/**
 * Phase 8. Three bands rather than a continuous gradient: the number comes from
 * a language model and is not precise to the point, so 71 and 74 should not
 * look like different things. Green is "apply", amber is "worth a look", muted
 * is "probably not".
 */
function matchScoreClass(score: number): string {
  if (score >= 75)
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (score >= 50)
    return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

const sourcePlatformLabels: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  linkedin: "LinkedIn",
  naukri: "Naukri",
  internshala: "Internshala",
  unstop: "Unstop",
  wellfound: "Wellfound",
  smartrecruiters: "SmartRecruiters",
};

// ─── Component ────────────────────────────────────────────────────────────────

function JobCardImpl({
  job,
  isBookmarked,
  onBookmarkToggle,
  isBookmarkPending,
  applicationStatus,
  appliedDate,
  onApply,
  onSave,
  isApplyPending,
  matchScore,
}: JobCardProps) {
  const [imgError, setImgError] = useState(false);
  const company = job.company;
  const logoUrl = company?.logoUrl;
  const showLogo = logoUrl && !imgError;

  const compensation = formatCompensation(job);
  const deadline = parseDeadline(job.deadline);
  const jobIsNewToday = isNewToday(job.createdAt);
  const isVerified = Boolean(job.sourceUrl);
  const platform = job.sourcePlatform ?? null;
  const platformLabel = platform
    ? (sourcePlatformLabels[platform] ?? platform)
    : null;

  const batches = job.eligibleBatch ?? [];
  const branches = job.eligibleBranches ?? [];
  const skills = job.requiredSkills ?? [];

  return (
    <article
      data-testid="job-card"
      data-job-id={job.id}
      className="group relative flex flex-col bg-card border border-border rounded-xl overflow-hidden transition-all duration-150 hover:border-border/80 hover:shadow-sm"
    >
      {/* Top strip */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        {/* Logo */}
        <div className="flex-shrink-0">
          {showLogo ? (
            <img
              src={logoUrl}
              alt={company?.name ?? ""}
              className="w-10 h-10 rounded-lg object-contain border border-border bg-background"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-border flex items-center justify-center">
              <span className="text-xs font-bold text-primary">
                {getInitials(company?.name ?? job.title)}
              </span>
            </div>
          )}
        </div>

        {/* Title block */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-sm font-medium text-muted-foreground truncate">
              {company?.name ?? "—"}
            </span>
            {isVerified && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <BadgeCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Verified official source
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {job.title}
          </h3>
          {(job.department || job.location) && (
            <p className="mt-0.5 text-xs text-muted-foreground truncate flex items-center gap-1">
              {job.department && <span>{job.department}</span>}
              {job.department && job.location && (
                <span className="opacity-40">·</span>
              )}
              {job.location && (
                <span className="flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {job.location}
                </span>
              )}
            </p>
          )}
          {/* Phase 2.0: what the normaliser made of the raw string above, so a
              wrong bucket is visible on the card rather than only in the DB. */}
          {(job.locationMetro ||
            job.isRemote ||
            job.isIndia === true ||
            job.isIndia === null) && (
            <div
              className="mt-1 flex items-center gap-1 flex-wrap"
              data-testid="location-badges"
            >
              {job.locationMetro && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-4 font-medium"
                  data-location-metro={job.locationMetro}
                >
                  {job.locationMetro === "NCR"
                    ? "Delhi NCR"
                    : job.locationMetro === "MMR"
                      ? "Mumbai"
                      : job.locationMetro}
                </Badge>
              )}
              {job.isIndia === true && !job.locationMetro && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-4 font-medium"
                  data-location-bucket-badge="india_unspecified"
                  title="The posting says India but names no city"
                >
                  India (city unstated)
                </Badge>
              )}
              {job.isRemote && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-4 font-medium"
                >
                  Remote
                </Badge>
              )}
              {job.isIndia === null && job.location && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-4 font-medium text-muted-foreground"
                  title="The location string couldn't be placed — review it"
                >
                  Unknown location
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Top-right actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {jobIsNewToday && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0 font-semibold">
              New Today
            </Badge>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                onClick={() => onBookmarkToggle(job.id, isBookmarked)}
                disabled={isBookmarkPending}
              >
                {isBookmarked ? (
                  <BookmarkCheck className="h-4 w-4 text-primary fill-primary/20" />
                ) : (
                  <Bookmark className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {isBookmarked ? "Remove bookmark" : "Bookmark job"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Badges row */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {/* Phase 2.1: the classifier's verdict, with its reasons on hover so a
            wrong track is debuggable from the card. Absent until the row has
            been classified. */}
        {job.relevanceTrack && trackBadge[job.relevanceTrack] && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={`text-xs font-medium cursor-default ${trackBadge[job.relevanceTrack]!.className}`}
                data-relevance-track={job.relevanceTrack}
                data-relevance-score={job.relevanceScore ?? ""}
              >
                {trackBadge[job.relevanceTrack]!.label}
                {job.relevanceScore != null && (
                  <span className="ml-1 opacity-70 tabular-nums">
                    {job.relevanceScore}
                  </span>
                )}
              </Badge>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="start"
              className="text-xs max-w-xs"
              data-testid="relevance-signals"
            >
              <p className="font-semibold mb-1">
                Score {job.relevanceScore ?? "—"} / 100
              </p>
              {(job.relevanceSignals ?? []).length > 0 ? (
                <ul className="list-disc pl-3 space-y-0.5">
                  {(job.relevanceSignals ?? []).map((signal) => (
                    <li key={signal}>{signal}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No signals recorded</p>
              )}
            </TooltipContent>
          </Tooltip>
        )}
        {/* Phase 8 — AI match score. Present only when one has been computed;
            its absence is the normal state for most of the table and is not an
            error, a spinner or a placeholder. */}
        {typeof matchScore === "number" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                data-testid="ai-match-badge"
                data-match-score={matchScore}
                className={`text-xs font-medium cursor-default ${matchScoreClass(matchScore)}`}
              >
                <Sparkles className="mr-1 h-3 w-3" />
                {matchScore}% match
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              How well your profile skills fit this posting, scored by AI. Open
              the application in the tracker for the missing-skills breakdown.
            </TooltipContent>
          </Tooltip>
        )}
        <Badge variant="secondary" className="text-xs font-medium">
          {job.jobType === "internship" ? "Internship" : "Full Time"}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {workModeLabels[job.workMode] ?? job.workMode}
        </Badge>
        {batches.map((yr) => (
          <Badge
            key={yr}
            variant="outline"
            className="text-xs text-muted-foreground"
          >
            {yr}
          </Badge>
        ))}
        {branches.slice(0, 3).map((br) => (
          <Badge
            key={br}
            variant="outline"
            className="text-xs text-muted-foreground"
          >
            {br}
          </Badge>
        ))}
        {branches.length > 3 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="text-xs text-muted-foreground cursor-default"
              >
                +{branches.length - 3} more
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-xs max-w-xs">
              {branches.slice(3).join(", ")}
            </TooltipContent>
          </Tooltip>
        )}
        {batches.length === 0 && branches.length === 0 && (
          <Badge
            variant="outline"
            className="text-xs text-muted-foreground/60 italic"
          >
            Open to all
          </Badge>
        )}
      </div>

      {/* Compensation + Deadline */}
      <div className="px-4 pb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-sm">
          {compensation ? (
            <span className="font-medium text-foreground">{compensation}</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Compensation not listed
            </span>
          )}
        </div>
        {deadline.urgency !== "none" && (
          <div
            className={`flex items-center gap-1 text-xs font-medium ${deadlineColors[deadline.urgency]}`}
          >
            <Clock className="h-3.5 w-3.5" />
            {deadline.text}
          </div>
        )}
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {skills.slice(0, 5).map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-secondary text-secondary-foreground"
            >
              {skill}
            </span>
          ))}
          {skills.length > 5 && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-secondary text-muted-foreground">
              +{skills.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto border-t border-border/60 px-4 py-2.5 flex items-center justify-between gap-2 bg-muted/20">
        <div className="text-[11px] text-muted-foreground">
          {platformLabel && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3 opacity-50" />
              via {platformLabel}
            </span>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          {applicationStatus ? (
            <>
              <Badge
                variant="outline"
                data-testid="application-status-badge"
                className={`h-6 gap-1 px-2 text-[11px] font-medium ${statusBadgeClass(applicationStatus)}`}
              >
                {applicationStatus === "applied" ? (
                  <>
                    <Check className="h-3 w-3" />
                    Applied
                    {appliedDate ? ` · ${formatDate(appliedDate)}` : ""}
                  </>
                ) : (
                  statusLabel(applicationStatus)
                )}
              </Badge>
              {job.applyUrl && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      asChild
                    >
                      <a
                        href={job.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open posting"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Open posting
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          ) : (
            <>
              {onSave && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-xs"
                  disabled={isApplyPending}
                  onClick={() => onSave(job.id)}
                >
                  Save
                </Button>
              )}
              {job.applyUrl && (
                <Button
                  size="sm"
                  data-testid="apply-button"
                  className="h-8 flex-shrink-0 gap-1 px-3 text-xs"
                  disabled={isApplyPending}
                  onClick={() => {
                    // MUST stay synchronous and first: a popup blocker will
                    // swallow window.open if it runs after an await.
                    window.open(
                      job.applyUrl as string,
                      "_blank",
                      "noopener,noreferrer",
                    );
                    onApply?.(job.id);
                  }}
                >
                  Apply
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Phase 7. A page is up to 200 cards, and the Jobs explorer re-renders the
 * whole list on every keystroke in the search box, every filter tick and every
 * optimistic apply. Without this, each of those re-runs 200 card bodies —
 * `formatDistanceToNow`, the deadline arithmetic and the badge logic included —
 * to produce identical output.
 *
 * The default shallow comparison is enough because every prop is either a
 * primitive or a stable reference: `job` is an object out of the React Query
 * cache, which only changes identity when the query refetches, and the four
 * callbacks are `useCallback`-wrapped in jobs.tsx. If a new prop is ever added
 * here, it has to hold to that or the memo silently stops helping. Phase 8's
 * `matchScore` is a number, which does — the score map is resolved to a
 * primitive in jobs.tsx rather than passed down as an object.
 */
export const JobCard = memo(JobCardImpl);
