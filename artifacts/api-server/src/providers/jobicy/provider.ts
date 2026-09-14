/**
 * JobicyProvider
 * ──────────────
 * Fetches worldwide-remote developer roles from Jobicy's free public API.
 *
 *   GET https://jobicy.com/api/v2/remote-jobs?geo=…&industry=…&count=…
 *
 * No API key, no auth, documented for public use.
 *
 * WHAT THIS IS ACTUALLY WORTH (measured 2026-09-14)
 * ──────────────────────────────────────────────────
 * Jobicy has no India geography: `?geo=india` returns nothing at all. What it
 * does have is roles open to applicants *anywhere*, which an India-based
 * applicant can genuinely apply to. `?geo=anywhere&industry=dev` returned 46
 * postings, 12 of them entry-level or junior. That is a modest but real
 * addition, and small enough that it cannot swamp the daily queue.
 *
 * Configured for `geo=anywhere` deliberately rather than pulling the whole
 * board: the unfiltered feed is mostly US/EU-scoped roles that this app's user
 * cannot apply to, and the point of Phase 5.5 is coverage, not volume.
 *
 * AGGREGATOR SEMANTICS
 * ─────────────────────
 * This is a search-shaped, multi-company feed: a posting disappearing from the
 * results does NOT mean it closed. "jobicy" must therefore be listed in
 * AGGREGATOR_PLATFORMS (staleness.ts) so the last-seen sweep never runs against
 * it and the age fallback handles it instead. staleness.test.ts asserts this.
 *
 * Per Jobicy's terms the source must be credited with a link back; every
 * ingested row keeps the Jobicy posting URL as its sourceUrl and applyUrl.
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { withRetry, httpGet } from "../retry";
import { slugify } from "../../lib/slugify";
import type { JobicyJob, JobicyResponse } from "./types";

const BASE_URL = "https://jobicy.com/api/v2/remote-jobs";

/** Jobicy caps `count` at 50 per request. */
const COUNT = 50;

export class JobicyProvider extends AbstractProvider {
  readonly name = "jobicy";
  readonly displayName = "Jobicy (remote)";
  readonly hasPublicApi = true;

  protected async doFetch(
    config: CompanyProviderConfig,
  ): Promise<ProviderJob[]> {
    // providerId carries the geo, e.g. "anywhere". extra.industry narrows it.
    const geo = config.providerId || "anywhere";
    const industry =
      (config.extra?.["industry"] as string | undefined) ?? "dev";

    const params = new URLSearchParams({
      geo,
      industry,
      count: String(COUNT),
    });
    const url = `${BASE_URL}?${params.toString()}`;

    const data = await withRetry(() => httpGet<JobicyResponse>(url), {
      label: `jobicy:${config.companySlug}`,
      maxAttempts: 3,
    });

    return (data.jobs ?? []).map((job) => this.normalize(job));
  }

  private normalize(job: JobicyJob): ProviderJob {
    const companyName = job.companyName || "Unknown Company";
    const locationStr = job.jobGeo || "Anywhere";

    // jobDescription is HTML; jobExcerpt is already plain text and is a decent
    // fallback when a posting ships no full description.
    const description = job.jobDescription
      ? this.stripHtml(job.jobDescription)
      : job.jobExcerpt;

    const employmentType = (job.jobType ?? []).join(" ");

    return {
      externalId: String(job.id),
      sourceProvider: this.name,
      companySlug: slugify(companyName),
      companyName,
      title: job.jobTitle,
      department: job.jobIndustry?.[0],
      location: locationStr,
      // Only claim India when the posting actually says so. "Anywhere" is not
      // India, and labelling it as such would corrupt the location filters.
      country: this.inferCountry(locationStr),
      // Every posting on this board is remote by construction.
      workMode: "remote",
      jobType: this.inferJobType(
        `${job.jobTitle} ${employmentType} ${job.jobLevel ?? ""}`,
      ),
      description,
      sourceUrl: job.url,
      applyUrl: job.url,
      postedDate: job.pubDate ? this.parseDate(job.pubDate) : undefined,
      rawText: description,
    };
  }

  /** Jobicy sends "YYYY-MM-DD HH:MM:SS" (no timezone); treat it as UTC. */
  private parseDate(raw: string): Date | undefined {
    const parsed = new Date(raw.replace(" ", "T") + "Z");
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}

export default new JobicyProvider();
