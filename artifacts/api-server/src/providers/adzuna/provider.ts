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
 * If the API keys are missing, logs a warning and returns [] — does NOT
 * throw, so a missing key never crashes the scheduler run.
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { withRetry, httpGet } from "../retry";
import { slugify } from "../../lib/slugify";
import { logger } from "../../lib/logger";
import type { AdzunaSearchResponse, AdzunaResult } from "./types";

const BASE_URL = "https://api.adzuna.com/v1/api/jobs/in/search/1";

// Internship-focused search terms — one API call each.
const QUERIES: string[] = [
  "software intern",
  "SDE intern",
  "developer trainee",
  "fresher software engineer",
  "graduate engineer trainee",
  "backend developer entry level",
];

export class AdzunaProvider extends AbstractProvider {
  readonly name = "adzuna";
  readonly displayName = "Adzuna India";
  readonly hasPublicApi = true;

  protected async doFetch(_config: CompanyProviderConfig): Promise<ProviderJob[]> {
    const appId = process.env["ADZUNA_APP_ID"];
    const appKey = process.env["ADZUNA_APP_KEY"];

    if (!appId || !appKey) {
      logger.warn(
        "[adzuna:india] ADZUNA_APP_ID / ADZUNA_APP_KEY not set — skipping Adzuna sync.",
      );
      return [];
    }

    const byId = new Map<string, AdzunaResult>();

    for (const what of QUERIES) {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        what,
        category: "it-jobs",
        max_days_old: "30",
        results_per_page: "50",
      });
      const url = `${BASE_URL}?${params.toString()}`;

      try {
        const data = await withRetry(() => httpGet<AdzunaSearchResponse>(url), {
          label: `adzuna:india:${what}`,
          maxAttempts: 3,
        });

        for (const result of data.results ?? []) {
          if (!byId.has(result.id)) byId.set(result.id, result);
        }
      } catch (err) {
        // One bad query shouldn't sink the whole aggregator run.
        logger.warn({ err, what }, "[adzuna:india] Query failed — continuing with remaining queries");
      }

      // Polite pause between queries (free tier rate limits).
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return Array.from(byId.values()).map((result) => this.normalize(result));
  }

  private normalize(result: AdzunaResult): ProviderJob {
    const companyName = result.company?.display_name || "Unknown Company";
    const locationStr = result.location?.display_name || "India";
    const description = result.description ? this.stripHtml(result.description) : undefined;

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
      jobType: this.inferJobType(`${result.title} ${result.contract_time ?? ""}`),
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
