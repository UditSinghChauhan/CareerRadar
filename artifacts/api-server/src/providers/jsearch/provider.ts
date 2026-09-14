/**
 * JSearchProvider
 * ───────────────
 * Fetches India internship/entry-level software jobs from JSearch
 * (RapidAPI), which indexes Google Jobs — in turn aggregating Internshala,
 * LinkedIn, Naukri, Unstop, and company career sites.
 *
 * Auth: headers x-rapidapi-key (env JSEARCH_API_KEY) + x-rapidapi-host.
 *
 * THE BINDING CONSTRAINT IS THE MONTH, NOT THE PAGE (measured 2026-09-14)
 * ────────────────────────────────────────────────────────────────────────
 * Depth pays here. Paging five deep on three queries returned a full page of
 * 10 every time, with 7-10 of each page unseen, and the intern-focused queries
 * stayed 10/10 fresher-titled all the way to page 5 — no saturation anywhere in
 * range. Cross-query overlap is ~1.2%, so extra queries are nearly free in
 * duplication terms. Measured yield: ~8.7 unique postings per request.
 *
 * None of which can be acted on directly, because the free tier is 200 requests
 * per MONTH and the cron fires every 6 hours:
 *
 *   8 queries x 2 pages = 16 req/run x 122 runs/month = 1,946 req/month
 *                                                     = 9.7x the allowance,
 *                                                       exhausted in 3.1 days
 *
 * Raising the page cap makes that strictly worse (5 pages = 24x). The only
 * lever that works is frequency: 200 / 30.4 days = 6.6 requests per day.
 *
 * So this provider gates itself to one run per JSEARCH_MIN_INTERVAL_HOURS
 * (default 24) and spends JSEARCH_MAX_REQUESTS (default 6) when it does run:
 *
 *   6 req/run x ~30 runs/month = ~180 req/month, inside the 200 allowance
 *   at ~8.7 unique/request that is ~52 new postings per day
 *
 * Because 6 requests cannot cover 8 queries, runs ROTATE through the query list
 * by calendar day, covering the whole set every ~3 days. With date_posted=month
 * on every query, a posting missed today is still there in three days.
 *
 * Skipping on the interval is a SUCCESS with zero jobs, not a failure — see the
 * note in metered-interval.ts about why a failure would be actively harmful.
 *
 * A short or skipped run cannot cause the Phase 1.5 last-seen sweep to close
 * anything: "jsearch" is in AGGREGATOR_PLATFORMS and closeUnseenJobs disarms on
 * platform identity before reading any count.
 *
 * Multi-company aggregator — a single config entry ("__jsearch__") runs
 * all queries per sync and deduplicates by job_id.
 *
 * If the API key is missing, logs a warning and returns [] — does NOT
 * throw, so a missing key never crashes the scheduler run.
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { withRetry, httpGet } from "../retry";
import { budgetFromEnv } from "../request-budget";
import {
  decideMeteredRun,
  intervalHoursFromEnv,
  rotateBy,
} from "../metered-interval";
import { slugify } from "../../lib/slugify";
import { logger } from "../../lib/logger";
import type { JSearchResponse, JSearchJob } from "./types";

const API_URL = "https://jsearch.p.rapidapi.com/search-v2";
const RAPIDAPI_HOST = "jsearch.p.rapidapi.com";

/**
 * Phase 5.5 query set. Each is one API request per page. Ordered by expected
 * yield for this app's user (a 2027-batch B.Tech IT student in Delhi NCR), so
 * that a budget cut-off truncates the least valuable queries rather than the
 * most valuable ones.
 */
const QUERIES: string[] = [
  "software engineer intern India",
  "SDE intern 2027",
  "software developer fresher India",
  "graduate engineer trainee software",
  "entry level software engineer India",
  "backend developer intern India",
  "full stack intern India",
  "SDE 1 India",
];

/**
 * Pages per query when this provider does run. Depth is genuinely productive
 * (see the header), so the budget is spent on pages rather than spread one page
 * across many queries — and rotation covers the breadth over successive days.
 */
const PAGES_PER_QUERY = 2;

/**
 * Queries attempted per run. 3 x 2 pages = 6 requests, which is the daily
 * allowance. Rotation moves the window each day, so all 8 queries are covered
 * roughly every 3 days.
 */
const QUERIES_PER_RUN = 3;

/** Default cap on requests per run. 6/day x 30.4 days = 182, inside 200/month. */
const DEFAULT_MAX_REQUESTS = 6;

/** Default minimum gap between runs. 24h is what makes the monthly budget fit. */
const DEFAULT_MIN_INTERVAL_HOURS = 24;

export class JSearchProvider extends AbstractProvider {
  readonly name = "jsearch";
  readonly displayName = "JSearch (Google Jobs)";
  readonly hasPublicApi = true;

  protected async doFetch(
    _config: CompanyProviderConfig,
  ): Promise<ProviderJob[]> {
    const apiKey = process.env["JSEARCH_API_KEY"];

    if (!apiKey) {
      logger.warn(
        "[jsearch:google-jobs-india] JSEARCH_API_KEY not set — skipping JSearch sync.",
      );
      return [];
    }

    // Frequency gate first — before any request is issued.
    const minIntervalHours = intervalHoursFromEnv(
      "JSEARCH_MIN_INTERVAL_HOURS",
      DEFAULT_MIN_INTERVAL_HOURS,
    );
    const interval = await decideMeteredRun(this.name, minIntervalHours);

    if (!interval.run) {
      logger.info(
        {
          provider: this.name,
          lastRunAt: interval.lastRunAt,
          hoursSince: interval.hoursSince?.toFixed(1),
          minIntervalHours,
        },
        "[jsearch:google-jobs-india] Skipped — ran less than " +
          `${minIntervalHours}h ago. The free tier is 200 requests/month and the ` +
          "cron fires 4x/day; running every time would exhaust the month in 3 days. " +
          "This is a normal skip, not a failure.",
      );
      return [];
    }

    const budget = budgetFromEnv(
      "JSEARCH_MAX_REQUESTS",
      DEFAULT_MAX_REQUESTS,
      "jsearch:google-jobs-india",
    );

    // Rotate which queries this run covers; see metered-interval.ts.
    const todaysQueries = rotateBy(QUERIES, QUERIES_PER_RUN);

    const byId = new Map<string, JSearchJob>();
    let queriesAttempted = 0;

    outer: for (const query of todaysQueries) {
      for (let page = 1; page <= PAGES_PER_QUERY; page++) {
        // Claim the request BEFORE issuing it, so the cap is never overshot.
        if (!budget.tryConsume()) break outer;

        const params = new URLSearchParams({
          query,
          country: "IN",
          date_posted: "month",
          page: String(page),
          num_pages: "1",
        });
        const url = `${API_URL}?${params.toString()}`;

        try {
          const data = await withRetry(
            () =>
              httpGet<JSearchResponse>(url, {
                headers: {
                  "x-rapidapi-key": apiKey,
                  "x-rapidapi-host": RAPIDAPI_HOST,
                },
              }),
            {
              label: `jsearch:google-jobs-india:${query}:p${page}`,
              maxAttempts: 2,
            },
          );

          const jobs = data.data?.jobs ?? [];
          for (const job of jobs) {
            if (!byId.has(job.job_id)) byId.set(job.job_id, job);
          }

          if (page === 1) queriesAttempted++;

          // Short page means the result set is exhausted — paging further
          // would spend budget on empty responses.
          if (jobs.length === 0) break;
        } catch (err) {
          // One bad query shouldn't sink the run, and retrying it further
          // would spend budget that the remaining queries need more.
          logger.warn(
            { err, query, page },
            "[jsearch:google-jobs-india] Query failed — continuing with remaining queries",
          );
          break;
        }

        // Polite pause between requests.
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    logger.info(
      {
        ...budget.state(),
        queriesAttempted,
        queriesThisRun: todaysQueries,
        totalQueries: QUERIES.length,
        uniqueJobs: byId.size,
        minIntervalHours,
      },
      budget.exhausted
        ? "[jsearch:google-jobs-india] Run truncated by the request budget — partial result kept, this is not a failure"
        : "[jsearch:google-jobs-india] Run completed within budget",
    );

    return Array.from(byId.values()).map((job) => this.normalize(job));
  }

  private normalize(job: JSearchJob): ProviderJob {
    const companyName = job.employer_name || "Unknown Company";
    const locationParts = [job.job_city, job.job_state].filter(Boolean);
    const locationStr = locationParts.join(", ") || job.job_country || "India";
    const description = job.job_description
      ? this.stripHtml(job.job_description)
      : undefined;
    const employmentType = job.job_employment_type ?? "";

    return {
      externalId: job.job_id,
      sourceProvider: this.name,
      companySlug: slugify(companyName),
      companyName,
      title: job.job_title,
      location: locationStr,
      country:
        job.job_country === "IN" ? "India" : this.inferCountry(locationStr),
      workMode: job.job_is_remote ? "remote" : this.inferWorkMode(locationStr),
      jobType: employmentType.toUpperCase().includes("INTERN")
        ? "internship"
        : this.inferJobType(`${job.job_title} ${employmentType}`),
      description,
      sourceUrl: job.job_apply_link ?? "",
      applyUrl: job.job_apply_link,
      postedDate: job.job_posted_at_datetime_utc
        ? new Date(job.job_posted_at_datetime_utc)
        : undefined,
      salaryMin: job.job_min_salary,
      salaryMax: job.job_max_salary,
      rawText: description,
    };
  }
}

export default new JSearchProvider();
