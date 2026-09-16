/**
 * AI match insights in the apply drawer (Phase 8).
 * ─────────────────────────────────────────────────
 * UPGRADE.md §8: "In the apply drawer, show `missingSkills` — the genuinely
 * useful output for interview prep." That is what this component leads with.
 * The 0–100 score is a summary the job card already carries; the list of things
 * this posting wants that the profile does not show is the part you can act on
 * the evening before an interview, so it is the largest thing here and it is
 * first.
 *
 * IT DEGRADES TO NOTHING, AT EVERY STEP
 * ──────────────────────────────────────
 * With `GEMINI_API_KEY` unset, `GET /api/ai/status` answers
 * `{ available: false }` and this component renders `null` — and, just as
 * importantly, never issues the match request at all, because `useGetJobMatchScore`
 * is gated on `enabled`. The drawer around it is untouched: status, dates,
 * notes and the referral fields are all still there and still editable. The
 * same is true when the request 503s (daily budget spent, or Gemini refused)
 * and when the job has no id yet.
 *
 * Nothing in the drawer waits for this. It occupies no space until it has
 * something to say.
 */

import { Sparkles } from "lucide-react";
import {
  useGetAIStatus,
  useGetJobMatchScore,
  getGetAIStatusQueryKey,
  getGetJobMatchScoreQueryKey,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function scoreClass(score: number): string {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function MatchInsights({ jobId }: { jobId: string | null | undefined }) {
  const { data: status } = useGetAIStatus({
    query: {
      queryKey: getGetAIStatusQueryKey(),
      // The answer is a function of the deployment's environment, not of
      // anything the user does. One request per session is plenty.
      staleTime: 30 * 60 * 1000,
    },
  });
  const available = status?.available === true;

  const {
    data: match,
    isLoading,
    isError,
  } = useGetJobMatchScore(jobId ?? "", {
    query: {
      queryKey: getGetJobMatchScoreQueryKey(jobId ?? ""),
      // Two gates, both necessary: no key means no endpoint worth calling, and
      // no job id means there is nothing to score.
      enabled: available && Boolean(jobId),
      // Once computed, the server serves this from `job_match_scores` for free,
      // but there is no reason to ask twice in one session either.
      staleTime: 30 * 60 * 1000,
      // A 503 here is "no score available", not a transient fault. Retrying
      // would be three more requests for the same answer.
      retry: false,
    },
  });

  if (!available || !jobId) return null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" data-testid="match-insights-loading">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  // No score and none obtainable — the drawer simply does not show this
  // section. Never an error message: the user did not ask for this and cannot
  // do anything about it.
  if (isError || !match) return null;

  const missing = match.missingSkills ?? [];
  const matching = match.matchingSkills ?? [];
  const recommendations = match.recommendations ?? [];

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3"
      data-testid="match-insights"
      data-match-score={match.score}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Interview prep
        </span>
        <span
          className={`text-sm font-semibold tabular-nums ${scoreClass(match.score)}`}
          data-testid="match-insights-score"
        >
          {match.score}% match
        </span>
      </div>

      {/* The point of the section. First, and given the most room. */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Skills to prepare
        </p>
        {missing.length > 0 ? (
          <div className="flex flex-wrap gap-1" data-testid="missing-skills">
            {missing.map((skill) => (
              <Badge
                key={skill}
                variant="outline"
                data-missing-skill={skill}
                className="border-amber-500/30 bg-amber-500/10 text-[11px] font-medium text-amber-700 dark:text-amber-300"
              >
                {skill}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing this posting asks for is missing from your profile.
          </p>
        )}
      </div>

      {matching.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Already covered
          </p>
          <div className="flex flex-wrap gap-1" data-testid="matching-skills">
            {matching.map((skill) => (
              <Badge
                key={skill}
                variant="secondary"
                className="text-[11px] font-medium"
              >
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {match.summary && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {match.summary}
        </p>
      )}

      {recommendations.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {recommendations.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      )}

      {/* Phase 8: a stale score is shown rather than hidden, but it says so.
          It happens when the profile's skills changed and the daily AI budget
          was already spent, so the number describes the old skill set. */}
      {match.stale && (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="match-insights-stale"
        >
          Computed before your latest profile change — tonight&apos;s batch will
          refresh it.
        </p>
      )}
    </div>
  );
}
