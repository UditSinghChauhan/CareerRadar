import { useState } from "react";
import { ExternalLink, Bookmark, BookmarkCheck, MapPin, Building2, Calendar, Zap, BadgeCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Job } from "@workspace/api-client-react";

interface JobCardProps {
  job: Job;
  isBookmarked: boolean;
  onBookmarkToggle: (jobId: string, isCurrentlyBookmarked: boolean) => void;
  isBookmarkPending?: boolean;
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

function isNew(createdAt: string): boolean {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs < 48 * 60 * 60 * 1000;
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

export function JobCard({ job, isBookmarked, onBookmarkToggle, isBookmarkPending }: JobCardProps) {
  const [imgError, setImgError] = useState(false);
  const company = job.company;
  const logoUrl = company?.logoUrl;
  const showLogo = logoUrl && !imgError;

  const compensation = formatCompensation(job);
  const deadline = parseDeadline(job.deadline);
  const jobIsNew = isNew(job.createdAt);
  const isVerified = Boolean(job.sourceUrl);
  const platform = job.sourcePlatform ?? null;
  const platformLabel = platform ? (sourcePlatformLabels[platform] ?? platform) : null;

  const batches = job.eligibleBatch ?? [];
  const branches = job.eligibleBranches ?? [];
  const skills = job.requiredSkills ?? [];

  return (
    <article className="group relative flex flex-col bg-card border border-border rounded-xl overflow-hidden transition-all duration-150 hover:border-border/80 hover:shadow-sm">
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
              {job.department && job.location && <span className="opacity-40">·</span>}
              {job.location && (
                <span className="flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {job.location}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Top-right actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {jobIsNew && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0 font-semibold">
              New
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
        <Badge variant="secondary" className="text-xs font-medium">
          {job.jobType === "internship" ? "Internship" : "Full Time"}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {workModeLabels[job.workMode] ?? job.workMode}
        </Badge>
        {batches.map((yr) => (
          <Badge key={yr} variant="outline" className="text-xs text-muted-foreground">
            {yr}
          </Badge>
        ))}
        {branches.slice(0, 3).map((br) => (
          <Badge key={br} variant="outline" className="text-xs text-muted-foreground">
            {br}
          </Badge>
        ))}
        {branches.length > 3 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs text-muted-foreground cursor-default">
                +{branches.length - 3} more
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-xs max-w-xs">
              {branches.slice(3).join(", ")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Compensation + Deadline */}
      <div className="px-4 pb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-sm">
          {compensation ? (
            <span className="font-medium text-foreground">{compensation}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Compensation not listed</span>
          )}
        </div>
        {deadline.urgency !== "none" && (
          <div className={`flex items-center gap-1 text-xs font-medium ${deadlineColors[deadline.urgency]}`}>
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
      <div className="mt-auto border-t border-border/60 px-4 py-3 flex items-center justify-between gap-2 bg-muted/20">
        <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          {job.postedDate && (
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Posted {formatDate(job.postedDate)}
            </span>
          )}
          {job.updatedAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 opacity-60" />
              Updated {formatDate(job.updatedAt)}
            </span>
          )}
          {platformLabel && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3 opacity-60" />
              via {platformLabel}
            </span>
          )}
        </div>

        {job.applyUrl && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 gap-1 flex-shrink-0"
            asChild
          >
            <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
              Official Apply
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}
