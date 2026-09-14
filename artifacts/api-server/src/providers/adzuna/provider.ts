/**
 * AdzunaProvider
 * ──────────────
 * Fetches India internship/entry-level software jobs from Adzuna's public
 * Job Search API, dedicated India endpoint (/jobs/in/search).
 *
 * Auth: query params app_id + app_key, read from env vars
 * ADZUNA_APP_ID / ADZUNA_APP_KEY. Free tier: 250 requests/day.
 *
 * This is a multi-company aggregator — a single config entry
 * ("__adzuna__") runs several internship-focused queries per sync and
 * deduplicates results by Adzuna's job id.
 *
 * THE REQUEST BUDGET (Phase 5.5)
 * ───────────────────────────────
 * Eight queries paginated three pages deep is 24 requests per sync against a
 * 250 requests/day free tier — comfortable at the 6-hourly cron cadence, and
 * not comfortable if something re-triggers sync in a loop. ADZUNA_MAX_REQUESTS
 * (default 40) caps a run; exhaustion stops it cleanly and keeps what was
 * already fetched, rather than throwing.
 *
 * A truncated run cannot cause the Phase 1.5 last-seen sweep to close anything:
 * "adzuna" is in AGGREGATOR_PLATFORMS, and closeUnseenJobs disarms on platform
 * identity before reading any count. See providers/request-budget.ts.
 *
 * If the API keys are missing, logs a warning and returns [] — does NOT
 * throw, so a missing key never crashes the scheduler run.
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { withRetry, httpGet } from "../retry";
import { budgetFromEnv } from "../request-budget";
import { slugify } from "../../lib/slugify";
import { logger } from "../../lib/logger";
import type { AdzunaSearchResponse, AdzunaResult } from "./types";

/** Page number is appended: .../jobs/in/search/{page} */
const BASE_URL = "https://api.adzuna.com/v1/api/jobs/in/search";

/**
 * Search terms, with a per-term page depth.
 *
 * WHY SHORT TERMS (measured 2026-09-14)
 * ──────────────────────────────────────
 * Adzuna's `what` parameter AND-matches every word, so a long phrase matches
 * almost nothing. The previous query set was built from natural-sounding
 * phrases and every one of them short-paged on page 1:
 *
 *   "graduate engineer trainee"      →   0 results
 *   "sde intern"                     →   3
 *   "entry level software engineer"  →   4
 *   "fresher software engineer"      →   5
 *
 * which is what made Adzuna look like a shallow source. It is not. The same
 * API answers with thousands of postings for single words:
 *
 *   "intern"       1,102 available   "internship"  1,100
 *   "fresher"        321             "entry level"   236
 *   "trainee"        114             "software intern" 404
 *
 * Page depth per term is set from that availability and from where the
 * fresher-titled share actually falls off. "software intern" is a clear case:
 * 46 and 41 fresher titles on pages 1-2, then 10, 3, 2 — so it is capped at 3.
 * "intern" holds 19-47 across all five pages and gets the full depth.
 *
 * Deliberately NOT included: "software engineer", "software developer",
 * "software", "developer", "graduate". All return full pages of 50 — and
 * 0 to 5 fresher-titled postings per 250. They are volume without relevance,
 * and this app's one user is hunting internships.
 */
interface AdzunaQuery {
  what: string;
  pages: number;
}

const QUERIES: AdzunaQuery[] = [
  { what: "intern", pages: 5 },
  { what: "internship", pages: 4 },
  { what: "software intern", pages: 3 },
  { what: "fresher", pages: 3 },
  { what: "entry level", pages: 3 },
  { what: "trainee", pages: 3 },
  { what: "junior software engineer", pages: 2 },
];

/** Results per page. Adzuna's maximum. */
const PER_PAGE = 50;

/** Default cap on requests per run — see the budget note in the file header. */
const DEFAULT_MAX_REQUESTS = 40;

export class AdzunaProvider extends AbstractProvider {
  readonly name = "adzuna";
  readonly displayName = "Adzuna India";
  readonly hasPublicApi = true;

  protected async doFetch(
    _config: CompanyProviderConfig,
  ): Promise<ProviderJob[]> {
    const appId = process.env["ADZUNA_APP_ID"];
    const appKey = process.env["ADZUNA_APP_KEY"];

    if (!appId || !appKey) {
      logger.warn(
        "[adzuna:india] ADZUNA_APP_ID / ADZUNA_APP_KEY not set — skipping Adzuna sync.",
      );
      return [];
    }

    const budget = budgetFromEnv(
      "ADZUNA_MAX_REQUESTS",
      DEFAULT_MAX_REQUESTS,
      "adzuna:india",
    );

    const byId = new Map<string, AdzunaResult>();
    let queriesAttempted = 0;

    outer: for (const { what, pages } of QUERIES) {
      for (let page = 1; page <= pages; page++) {
        // Claim the request BEFORE issuing it, so the cap is never overshot.
        if (!budget.tryConsume()) break outer;

        const params = new URLSearchParams({
          app_id: appId,
          app_key: appKey,
          what,
          category: "it-jobs",
          max_days_old: "30",
          results_per_page: String(PER_PAGE),
        });
        const url = `${BASE_URL}/${page}?${params.toString()}`;

        try {
          const data = await withRetry(
            () => httpGet<AdzunaSearchResponse>(url),
            { label: `adzuna:india:${what}:p${page}`, maxAttempts: 3 },
          );

          const results = data.results ?? [];
          for (const result of results) {
            if (!byId.has(result.id)) byId.set(result.id, result);
          }

          if (page === 1) queriesAttempted++;

          // Fewer than a full page means there is nothing further to page to.
          if (results.length < PER_PAGE) break;
        } catch (err) {
          // One bad query shouldn't sink the whole aggregator run.
          logger.warn(
            { err, what, page },
            "[adzuna:india] Query failed — continuing with remaining queries",
          );
          break;
        }

        // Polite pause between requests (free tier rate limits).
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    logger.info(
      {
        ...budget.state(),
        queriesAttempted,
        totalQueries: QUERIES.length,
        uniqueJobs: byId.size,
      },
      budget.exhausted
        ? "[adzuna:india] Run truncated by the request budget — partial result kept, this is not a failure"
        : "[adzuna:india] Run completed within budget",
    );

    return Array.from(byId.values()).map((result) => this.normalize(result));
  }

  private normalize(result: AdzunaResult): ProviderJob {
    const companyName = result.company?.display_name || "Unknown Company";
    const locationStr = result.location?.display_name || "India";
    const description = result.description
      ? this.stripHtml(result.description)
      : undefined;

    return {
      externalId: String(result.id),
      sourceProvider: this.name,
      companySlug: slugify(companyName),
      companyName,
      title: result.title,
      department: result.category?.label,
      location: locationStr,
      // Adzuna's /in/ endpoint is India-only by construction — fall back to
      // "India" when the free-text location doesn't match a known city.
      country: this.inferCountry(locationStr) ?? "India",
      workMode: this.inferWorkMode(locationStr),
      jobType: this.inferJobType(
        `${result.title} ${result.contract_time ?? ""}`,
      ),
      description,
      sourceUrl: result.redirect_url,
      applyUrl: result.redirect_url,
      postedDate: result.created ? new Date(result.created) : undefined,
      salaryMin: result.salary_min,
      salaryMax: result.salary_max,
      rawText: description,
    };
  }
}

export default new AdzunaProvider();
