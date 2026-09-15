/**
 * Quick capture (Phase 4)
 * ────────────────────────
 * LinkedIn, Naukri, Internshala, Unstop and Wellfound hold most of the relevant
 * postings and none of them can legally be scraped — `providers/internshala`,
 * `providers/unstop` and `providers/wellfound` are deliberate no-op stubs for
 * exactly that reason. The legitimate bridge is the user's own clipboard: they
 * paste, the server parses what it was handed, and manual entry drops from two
 * minutes to about five seconds.
 *
 * THE SERVER NEVER REQUESTS THOSE SITES. `parse()` takes a URL string and some
 * text and does string work on both. The one outbound call this directory can
 * make is `gemini-extract.ts` handing the PASTED TEXT to Google's API, and only
 * when GEMINI_API_KEY is set — nothing here ever opens the posting's own URL.
 * `blocked-domains.test.ts` enforces that statically, by scanning the shipping
 * source for those five domains, and dynamically, by driving the pipeline with
 * all five boards' URLs while `fetch` is a spy that throws.
 *
 * Two steps, never one:
 *   parse()    → a DRAFT. Nothing is written.
 *   confirm()  → the user's edited draft becomes a row, with the §2.0 location
 *                normaliser and the §2.1 classifier applied (both live inside
 *                `jobsService.create`) and `sourcePlatform: "manual"`.
 */

import { eq } from "drizzle-orm";
import { db, jobsTable } from "@workspace/db";
import { slugify } from "../lib/slugify";
import { logger } from "../lib/logger";
import { companiesRepository } from "../repositories/companies.repository";
import { jobsRepository } from "../repositories/jobs.repository";
import { jobsService } from "../services/jobs.service";
import { extractWithGemini, isAIAvailable } from "./gemini-extract";
import { parseCaptureText } from "./parse-text";
import { parseCaptureUrl } from "./parse-url";
import { emptyDraft, type CaptureDraft, type CaptureResponse } from "./types";

/**
 * Every job this feature creates carries this platform, which is what keeps it
 * out of the Phase 1.5 sweeps: `closeUnseenJobs` filters to one provider's own
 * platform and `closeStaleAggregatorJobs` to AGGREGATOR_PLATFORMS, and "manual"
 * is in neither. A hand-captured job is only ever closed by its own deadline or
 * by the user.
 */
export const MANUAL_SOURCE_PLATFORM = "manual";

/** Ignore a Gemini field only when it produced nothing; an empty array counts as nothing. */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Later sources fill gaps in earlier ones; they never overwrite a value that is
 * already there. Callers pass them most-trusted first.
 */
function mergeDrafts(
  ...sources: Array<Partial<CaptureDraft> | null>
): CaptureDraft {
  const merged = emptyDraft();
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (isEmpty(value)) continue;
      const field = key as keyof CaptureDraft;
      if (!isEmpty(merged[field])) continue;
      (merged as unknown as Record<string, unknown>)[field] = value;
    }
  }
  return merged;
}

export interface ParseCaptureInput {
  url?: string | null;
  rawText?: string | null;
}

export const captureService = {
  /**
   * Build a draft from a URL and/or pasted text. Never writes.
   *
   * Precedence is Gemini → pasted text → URL slug. The URL is the floor: with
   * no key and no text, a LinkedIn link alone still yields a title and an
   * employer, because the board encodes both in the path.
   */
  async parse(input: ParseCaptureInput): Promise<CaptureResponse> {
    const url = input.url?.trim() || null;
    const rawText = input.rawText?.trim() || null;
    const warnings: string[] = [];

    const fromUrl = parseCaptureUrl(url);
    const platform = fromUrl.platform;

    const urlDraft: Partial<CaptureDraft> = {
      title: fromUrl.title ?? null,
      companyName: fromUrl.companyName ?? null,
      location: fromUrl.location ?? null,
      applyUrl: url,
      sourceUrl: url,
      jobType: fromUrl.title
        ? /\bintern(ship)?\b/i.test(fromUrl.title)
          ? "internship"
          : null
        : null,
    };

    const textDraft = rawText ? parseCaptureText(rawText) : null;

    let geminiDraft: Partial<CaptureDraft> | null = null;
    if (rawText && isAIAvailable()) {
      geminiDraft = await extractWithGemini(rawText, url);
      if (!geminiDraft) {
        warnings.push(
          "AI extraction did not return a usable result — these fields came from the pasted text instead.",
        );
      }
    } else if (rawText) {
      warnings.push(
        "AI extraction is off (no GEMINI_API_KEY) — these fields were read from the pasted text. Check them before saving.",
      );
    } else if (url) {
      warnings.push(
        "Nothing was pasted, so only the link was read. Paste the job description for a fuller draft.",
      );
    }

    const draft = mergeDrafts(geminiDraft, textDraft, urlDraft);

    // The description is the one field where the full paste beats a summary:
    // the classifier reads it, and so does AI matching later.
    if (
      rawText &&
      (!draft.description || draft.description.length < rawText.length)
    ) {
      draft.description = rawText.slice(0, 8000);
    }

    if (!draft.title)
      warnings.push("Could not work out the role title — please type it in.");
    if (!draft.companyName)
      warnings.push("Could not work out the company — please type it in.");

    return {
      draft,
      source: geminiDraft ? "gemini" : "heuristic",
      aiAvailable: isAIAvailable(),
      platform: platform?.label ?? null,
      warnings,
    };
  },

  /**
   * Turn a confirmed draft into a row.
   *
   * `sourcePlatform` is set here, not taken from the caller: a manual capture is
   * a manual capture, and letting a client claim it came from Greenhouse would
   * put the row inside the reach of `closeUnseenJobs`.
   */
  async confirm(input: {
    title: string;
    companyName: string;
    location?: string | null;
    workMode?: "remote" | "hybrid" | "onsite" | null;
    jobType?: "internship" | "full_time" | null;
    stipend?: number | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    currency?: string | null;
    deadline?: string | null;
    requiredSkills?: string[] | null;
    description?: string | null;
    requirements?: string | null;
    applyUrl?: string | null;
    sourceUrl?: string | null;
  }) {
    const sourceUrl = input.sourceUrl?.trim() || input.applyUrl?.trim() || null;

    // Re-capturing something already in the table is the common accident — the
    // user sees a job on a board, forgets a provider already ingested it, and
    // pastes it anyway. Hand back the existing row rather than a duplicate.
    //
    // A CLOSED match is REOPENED rather than returned as-is. The staleness
    // sweeps and the expired-deadline sweep both close rows on evidence that
    // can be stale or wrong, and a user pasting the posting today is fresher
    // evidence than either. Returning the closed row untouched would look like
    // the save silently failed: it is absent from every `status=active` list,
    // which is every list the app shows.
    if (sourceUrl) {
      const [existing] = await db
        .select({ id: jobsTable.id, status: jobsTable.status })
        .from(jobsTable)
        .where(eq(jobsTable.sourceUrl, sourceUrl))
        .limit(1);

      if (existing) {
        if (existing.status !== "active") {
          await db
            .update(jobsTable)
            .set({ status: "active", updatedAt: new Date() })
            .where(eq(jobsTable.id, existing.id));
        }
        const job = await jobsRepository.findById(existing.id);
        if (job) {
          logger.info(
            {
              jobId: job.id,
              sourceUrl,
              reopened: existing.status !== "active",
            },
            "Capture matched an existing job — not inserting a duplicate",
          );
          return { job, duplicate: true as const };
        }
      }
    }

    const companyName = input.companyName.trim();
    const slug = slugify(companyName);
    const company =
      (await companiesRepository.findBySlug(slug)) ??
      (await companiesRepository.create({ slug, name: companyName }));

    const job = await jobsService.create({
      companyId: company.id,
      title: input.title.trim(),
      location: input.location?.trim() || undefined,
      // `country` is deliberately not sent. It is the unreliable column
      // (schema default 'India'), and the §2.0 normaliser must derive the
      // location from the free text alone rather than from a caller's guess.
      workMode: input.workMode ?? "onsite",
      jobType: input.jobType ?? "internship",
      stipend: input.stipend ?? undefined,
      salaryMin: input.salaryMin ?? undefined,
      salaryMax: input.salaryMax ?? undefined,
      currency: input.currency?.trim() || "INR",
      deadline: input.deadline ?? undefined,
      requiredSkills: input.requiredSkills ?? [],
      description: input.description ?? undefined,
      requirements: input.requirements ?? undefined,
      applyUrl: input.applyUrl?.trim() || sourceUrl || undefined,
      sourceUrl: sourceUrl || undefined,
      sourcePlatform: MANUAL_SOURCE_PLATFORM,
      status: "active",
    });

    logger.info(
      { jobId: job.id, company: slug, relevanceTrack: job.relevanceTrack },
      "Captured job saved",
    );

    return { job, duplicate: false as const };
  },
};
