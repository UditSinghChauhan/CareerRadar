/**
 * Shared shapes for quick capture (Phase 4).
 *
 * A draft is never written to the database on its own — the user confirms it in
 * a dialog first, and the confirm endpoint is what runs the §2.0 normaliser and
 * the §2.1 classifier. See `capture.service.ts`.
 */

export type CaptureWorkMode = "remote" | "hybrid" | "onsite";
export type CaptureJobType = "internship" | "full_time";

/** Every field the parsers can fill. All nullable — a draft is allowed to be empty. */
export interface CaptureDraft {
  title: string | null;
  companyName: string | null;
  location: string | null;
  workMode: CaptureWorkMode | null;
  jobType: CaptureJobType | null;
  /** Monthly, in `currency`. */
  stipend: number | null;
  /** Annual, in `currency`. */
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  /** ISO-8601, end of the stated day in UTC. */
  deadline: string | null;
  requiredSkills: string[];
  description: string | null;
  applyUrl: string | null;
  sourceUrl: string | null;
}

export function emptyDraft(): CaptureDraft {
  return {
    title: null,
    companyName: null,
    location: null,
    workMode: null,
    jobType: null,
    stipend: null,
    salaryMin: null,
    salaryMax: null,
    currency: "INR",
    deadline: null,
    requiredSkills: [],
    description: null,
    applyUrl: null,
    sourceUrl: null,
  };
}

/** Where a draft's values came from, so the dialog can be honest about it. */
export type CaptureSource = "gemini" | "heuristic";

export interface CaptureResponse {
  draft: CaptureDraft;
  /** "gemini" only when the model actually returned a usable object. */
  source: CaptureSource;
  /** Whether GEMINI_API_KEY is configured at all. */
  aiAvailable: boolean;
  /** Platform label derived from the URL's host, e.g. "LinkedIn". Null if no URL. */
  platform: string | null;
  /** Things the user should know before saving — shown above the form. */
  warnings: string[];
}
