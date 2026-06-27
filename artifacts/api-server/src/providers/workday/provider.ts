/**
 * WorkdayProvider
 * ───────────────
 * Fetches open jobs from Workday-hosted career pages via the internal
 * CXS REST API.
 *
 * WORKDAY ENDPOINT PATTERN
 * ─────────────────────────
 *   POST https://{tenant}.wd{n}.myworkdayjobs.com/wday/cxs/{tenant}/{board}/jobs
 *   Body: { "limit": 20, "offset": 0, "searchText": "", "locations": [] }
 *
 * To identify {tenant}, {n}, and {board} for a company, visit its careers
 * page URL:
 *   https://{tenant}.wd{n}.myworkdayjobs.com/{board}
 *
 * ACCESS STATUS (verified 2025-06-27)
 * ────────────────────────────────────
 * Workday's CXS API returns HTTP 401 from automated/cloud environments.
 * The endpoint requires browser session cookies (CSRF token + Workday session)
 * that are obtained during initial page load. There is no documented public
 * API key or OAuth flow for job board access.
 *
 * Workday's ToS also prohibits automated scraping of their hosted pages.
 *
 * CURRENT STATE: hasPublicApi = false
 * ─────────────────────────────────────
 * This provider is implemented but disabled until one of the following is
 * resolved:
 *   a) A Workday Partner API is available (requires Workday AMS partnership).
 *   b) A specific tenant's jobs endpoint is confirmed accessible without auth
 *      from a non-browser environment.
 *
 * HOW TO ENABLE A COMPANY (once access is resolved)
 * ───────────────────────────────────────────────────
 * In providers/config.ts, add an entry with:
 *   providerName: "workday"
 *   providerId:   "<tenant>"        // e.g. "atlassian"
 *   extra:
 *     wd:     "wd5"                 // datacenter number from the careers URL
 *     board:  "Atlassian"           // job board path segment (case-sensitive)
 *     tenant: "atlassian"           // same as providerId, for URL construction
 *
 * Verify the board path:
 *   curl -s -X POST \
 *     "https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{board}/jobs" \
 *     -H "Content-Type: application/json" \
 *     -d '{"limit":3,"offset":0}' | head -c 300
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { withRetry, FetchError } from "../retry";
import type { WorkdayExtra, WorkdayJobPosting, WorkdayJobsResponse } from "./types";

const PAGE_SIZE = 20;

export class WorkdayProvider extends AbstractProvider {
  readonly name = "workday";
  readonly displayName = "Workday";

  /**
   * Disabled until a legitimate public access path is confirmed.
   * The CXS endpoint requires browser session tokens; returning false
   * prevents 401 errors from polluting sync logs.
   * Set to true and register new configs once endpoint access is verified.
   */
  readonly hasPublicApi = false;

  protected async doFetch(config: CompanyProviderConfig): Promise<ProviderJob[]> {
    const extra = config.extra as WorkdayExtra | undefined;

    if (!extra?.wd || !extra?.board || !extra?.tenant) {
      throw new Error(
        `WorkdayProvider: missing required extra fields (wd, board, tenant) for ${config.companySlug}. ` +
          `Add them to the config entry in providers/config.ts.`,
      );
    }

    const baseUrl = `https://${extra.tenant}.${extra.wd}.myworkdayjobs.com/wday/cxs/${extra.tenant}/${extra.board}/jobs`;
    const allJobs: WorkdayJobPosting[] = [];
    let offset = 0;

    for (;;) {
      const data = await withRetry(
        () => this.postJobs(baseUrl, offset),
        {
          label: `workday:${config.companySlug}`,
          maxAttempts: 3,
          isRetryable: (err) => {
            if (err instanceof FetchError) {
              // Do not retry 401/403 — auth errors are not transient.
              if (err.status === 401 || err.status === 403) return false;
              return err.isRetryable;
            }
            return err instanceof TypeError;
          },
        },
      );

      allJobs.push(...data.jobPostings);

      const fetched = offset + data.jobPostings.length;
      if (fetched >= data.total || data.jobPostings.length === 0) break;
      offset = fetched;
    }

    return allJobs.map((job) => this.normalize(job, config, extra));
  }

  private async postJobs(url: string, offset: number): Promise<WorkdayJobsResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "CareerRadar/0.2 (job-aggregator; contact via repo)",
        },
        body: JSON.stringify({
          limit: PAGE_SIZE,
          offset,
          searchText: "",
          locations: [],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new FetchError(response.status, response.statusText, url);
      }

      return (await response.json()) as WorkdayJobsResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  private normalize(
    job: WorkdayJobPosting,
    config: CompanyProviderConfig,
    extra: WorkdayExtra,
  ): ProviderJob {
    const locationStr = job.locationsText ?? job.primaryLocation ?? "";

    const externalPath = job.externalPath ?? "";
    const sourceUrl = externalPath
      ? `https://${extra.tenant}.${extra.wd}.myworkdayjobs.com${externalPath}`
      : `https://${extra.tenant}.${extra.wd}.myworkdayjobs.com/${extra.board}`;

    const externalId = externalPath.split("/").pop() ?? job.title;

    const postedDate = job.postedOn ? this.parseWorkdayDate(job.postedOn) : undefined;

    return {
      externalId,
      sourceProvider: this.name,
      companySlug: config.companySlug,
      title: job.title,
      department: job.jobFamilyGroup ?? job.jobFamily,
      location: locationStr || undefined,
      workMode: this.inferWorkMode(locationStr),
      jobType: this.inferJobType(
        job.title + " " + (job.workerType?.descriptor ?? ""),
      ),
      sourceUrl,
      applyUrl: sourceUrl,
      postedDate,
    };
  }

  /**
   * Workday dates come in two formats:
   *   "Posted 30+ Days Ago"  → approximate, use now minus 30 days
   *   "Posted 3 Days Ago"    → subtract N days from now
   *   "Posted Today"         → today
   */
  private parseWorkdayDate(postedOn: string): Date | undefined {
    const lower = postedOn.toLowerCase();
    const now = new Date();

    if (lower.includes("today")) return now;

    const match = lower.match(/posted\s+(\d+)\+?\s+days?\s+ago/);
    if (match) {
      const days = parseInt(match[1], 10);
      const date = new Date(now);
      date.setDate(date.getDate() - days);
      return date;
    }

    return undefined;
  }
}

export default new WorkdayProvider();
