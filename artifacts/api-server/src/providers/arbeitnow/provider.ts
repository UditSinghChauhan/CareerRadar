/**
 * ArbeitnowProvider
 * ─────────────────
 * Fetches from Arbeitnow's free public job-board API.
 *
 *   GET https://www.arbeitnow.com/api/job-board-api
 *
 * No API key, no auth, published for public consumption.
 *
 * SHIPPED BUT DISABLED — AND WHY (measured 2026-09-14)
 * ─────────────────────────────────────────────────────
 * The endpoint is healthy: HTTP 200, 250 postings on page one, pagination via
 * `links.next`. The problem is the content. Of those 250 postings:
 *
 *   - 0 matched any Indian city or the word "India".
 *   - 9 were flagged `remote: true`, and all nine were German-language roles
 *     at German employers ("Homeoffice", "(m/w/d)"), i.e. remote *within
 *     Germany* — several of them senior or architect level.
 *
 * Arbeitnow is a German job board. For this app's one user — a 2027-batch
 * B.Tech student in Delhi NCR — enabling it would add hundreds of postings that
 * are not applicable and push the genuinely relevant ones down the queue. The
 * Phase 5.5 spec predicted "low India yield"; the measurement says the yield is
 * zero, and zero-yield noise is worse than no source.
 *
 * The provider is kept, working and registered, so that re-enabling it is a
 * one-line config change if Arbeitnow's coverage ever widens — and so that a
 * future session does not spend another hour rediscovering the endpoint. Its
 * config entry in config.ts carries the same numbers.
 *
 * AGGREGATOR SEMANTICS
 * ─────────────────────
 * Search-shaped multi-company feed: absence from a response never means closed.
 * "arbeitnow" is listed in AGGREGATOR_PLATFORMS (staleness.ts) so the last-seen
 * sweep can never run against it. staleness.test.ts asserts this.
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { withRetry, httpGet } from "../retry";
import { budgetFromEnv } from "../request-budget";
import { slugify } from "../../lib/slugify";
import { logger } from "../../lib/logger";
import type { ArbeitnowJob, ArbeitnowResponse } from "./types";

const BASE_URL = "https://www.arbeitnow.com/api/job-board-api";

/** Pages to walk. 250 postings per page, so this is already a lot of rows. */
const DEFAULT_MAX_REQUESTS = 4;

export class ArbeitnowProvider extends AbstractProvider {
  readonly name = "arbeitnow";
  readonly displayName = "Arbeitnow";
  readonly hasPublicApi = true;

  protected async doFetch(
    config: CompanyProviderConfig,
  ): Promise<ProviderJob[]> {
    const budget = budgetFromEnv(
      "ARBEITNOW_MAX_REQUESTS",
      DEFAULT_MAX_REQUESTS,
      `arbeitnow:${config.companySlug}`,
    );

    // Optional narrowing so the entry is useful if it is ever enabled: when
    // `extra.remoteOnly` is set, postings the board did not flag remote are
    // dropped. Without it the feed is overwhelmingly onsite-in-Germany.
    const remoteOnly = config.extra?.["remoteOnly"] === true;

    const bySlug = new Map<string, ArbeitnowJob>();
    let url: string | null = `${BASE_URL}?page=1`;

    while (url !== null && budget.tryConsume()) {
      const nextUrl: string = url;
      const data: ArbeitnowResponse = await withRetry(
        () => httpGet<ArbeitnowResponse>(nextUrl),
        { label: `arbeitnow:${config.companySlug}`, maxAttempts: 3 },
      );

      for (const job of data.data ?? []) {
        if (remoteOnly && !job.remote) continue;
        if (!bySlug.has(job.slug)) bySlug.set(job.slug, job);
      }

      url = data.links?.next ?? null;

      if (url !== null)
        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    logger.info(
      { ...budget.state(), remoteOnly, uniqueJobs: bySlug.size },
      "[arbeitnow] Run complete",
    );

    return Array.from(bySlug.values()).map((job) => this.normalize(job));
  }

  private normalize(job: ArbeitnowJob): ProviderJob {
    const companyName = job.company_name || "Unknown Company";
    const locationStr = job.location || "";
    const description = job.description
      ? this.stripHtml(job.description)
      : undefined;

    return {
      externalId: job.slug,
      sourceProvider: this.name,
      companySlug: slugify(companyName),
      companyName,
      title: job.title,
      location: locationStr || undefined,
      // Do not guess. inferCountry only recognises Indian locations, and this
      // board is German — an unrecognised location stays undefined rather than
      // being labelled with a country we did not read off the posting.
      country: this.inferCountry(locationStr),
      workMode: job.remote ? "remote" : this.inferWorkMode(locationStr),
      jobType: this.inferJobType(
        `${job.title} ${(job.job_types ?? []).join(" ")}`,
      ),
      description,
      sourceUrl: job.url,
      applyUrl: job.url,
      // created_at is Unix seconds.
      postedDate: job.created_at ? new Date(job.created_at * 1000) : undefined,
      requiredSkills: job.tags?.length ? job.tags : undefined,
      rawText: description,
    };
  }
}

export default new ArbeitnowProvider();
