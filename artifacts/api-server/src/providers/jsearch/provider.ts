/**
 * JSearchProvider
 * ───────────────
 * Fetches India internship/entry-level software jobs from JSearch
 * (RapidAPI), which indexes Google Jobs — in turn aggregating Internshala,
 * LinkedIn, Naukri, Unstop, and company career sites.
 *
 * Auth: headers x-rapidapi-key (env JSEARCH_API_KEY) + x-rapidapi-host.
 * Free tier: 200 requests/month — budgeted to 6 queries per sync, 1 page
 * each.
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
import { slugify } from "../../lib/slugify";
import { logger } from "../../lib/logger";
import type { JSearchResponse, JSearchJob } from "./types";

const API_URL = "https://jsearch.p.rapidapi.com/search";
const RAPIDAPI_HOST = "jsearch.p.rapidapi.com";

// Budgeted to the 200 req/month free tier — 6 queries per sync, 1 page each.
const QUERIES: string[] = [
  "software engineering intern India",
  "SDE intern Bangalore Hyderabad Pune",
  "backend developer intern India",
  "full stack intern India",
  "data engineer intern India",
  "software developer fresher India",
];

export class JSearchProvider extends AbstractProvider {
  readonly name = "jsearch";
  readonly displayName = "JSearch (Google Jobs)";
  readonly hasPublicApi = true;

  protected async doFetch(_config: CompanyProviderConfig): Promise<ProviderJob[]> {
    const apiKey = process.env["JSEARCH_API_KEY"];

    if (!apiKey) {
      logger.warn("[jsearch:google-jobs-india] JSEARCH_API_KEY not set — skipping JSearch sync.");
      return [];
    }

    const byId = new Map<string, JSearchJob>();

    for (const query of QUERIES) {
      const params = new URLSearchParams({
        query,
        country: "IN",
        date_posted: "month",
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
          { label: `jsearch:google-jobs-india:${query}`, maxAttempts: 2 },
        );

        for (const job of data.data ?? []) {
          if (!byId.has(job.job_id)) byId.set(job.job_id, job);
        }
      } catch (err) {
        // One bad query shouldn't burn the whole monthly budget on retries elsewhere.
        logger.warn({ err, query }, "[jsearch:google-jobs-india] Query failed — continuing with remaining queries");
      }

      // Polite pause between queries.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return Array.from(byId.values()).map((job) => this.normalize(job));
  }

  private normalize(job: JSearchJob): ProviderJob {
    const companyName = job.employer_name || "Unknown Company";
    const locationParts = [job.job_city, job.job_state].filter(Boolean);
    const locationStr = locationParts.join(", ") || job.job_country || "India";
    const description = job.job_description ? this.stripHtml(job.job_description) : undefined;
    const employmentType = job.job_employment_type ?? "";

    return {
      externalId: job.job_id,
      sourceProvider: this.name,
      companySlug: slugify(companyName),
      companyName,
      title: job.job_title,
      location: locationStr,
      country: job.job_country === "IN" ? "India" : this.inferCountry(locationStr),
      workMode: job.job_is_remote ? "remote" : this.inferWorkMode(locationStr),
      jobType: employmentType.toUpperCase().includes("INTERN")
        ? "internship"
        : this.inferJobType(`${job.job_title} ${employmentType}`),
      description,
      sourceUrl: job.job_apply_link ?? "",
      applyUrl: job.job_apply_link,
      postedDate: job.job_posted_at_datetime_utc ? new Date(job.job_posted_at_datetime_utc) : undefined,
      salaryMin: job.job_min_salary,
      salaryMax: job.job_max_salary,
      rawText: description,
    };
  }
}

export default new JSearchProvider();
