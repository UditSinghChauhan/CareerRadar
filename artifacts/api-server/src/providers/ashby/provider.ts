/**
 * AshbyProvider
 * ─────────────
 * Fetches open jobs via Ashby's public Job Posting API.
 *
 * API endpoint: POST https://api.ashbyhq.com/posting-public/jobs
 * No authentication required for published postings.
 *
 * ToS note: Ashby's posting-public API is the documented, publicly supported
 * way to list open roles from Ashby-hosted job boards. This is fully
 * permitted.
 *
 * HOW TO ADD A COMPANY
 * ─────────────────────
 * In providers/config.ts, add an entry with:
 *   providerName: "ashby"
 *   providerId: "<org_hosted_jobs_page_name>"
 *
 * The org name appears in the Ashby careers URL:
 *   https://jobs.ashbyhq.com/<org_name>
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { withRetry, FetchError } from "../retry";
import type { AshbyJobPosting, AshbyPostingsResponse } from "./types";

const API_URL = "https://api.ashbyhq.com/posting-public/jobs";

export class AshbyProvider extends AbstractProvider {
  readonly name = "ashby";
  readonly displayName = "Ashby";
  readonly hasPublicApi = true;

  protected async doFetch(config: CompanyProviderConfig): Promise<ProviderJob[]> {
    const allJobs: AshbyJobPosting[] = [];
    let cursor: string | undefined;

    do {
      const body: Record<string, unknown> = {
        organizationHostedJobsPageName: config.providerId,
        includeCompensation: true,
      };
      if (cursor) body["cursor"] = cursor;

      const data = await withRetry(
        () => this.postJson<AshbyPostingsResponse>(API_URL, body),
        { label: `ashby:${config.companySlug}`, maxAttempts: 3 },
      );

      allJobs.push(...data.results);
      cursor = data.moreDataAvailable
        ? (data as unknown as { nextCursor?: string }).nextCursor
        : undefined;
    } while (cursor);

    return allJobs.map((job) => this.normalize(job, config));
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "CareerRadar/0.2 (job-aggregator)",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new FetchError(response.status, response.statusText, url);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private normalize(job: AshbyJobPosting, config: CompanyProviderConfig): ProviderJob {
    const locationStr = job.locationName ?? "";
    const workMode = job.isRemote
      ? "remote"
      : this.inferWorkMode(locationStr);

    const description = job.descriptionPlain
      ? job.descriptionPlain
      : job.descriptionHtml
        ? this.stripHtml(job.descriptionHtml)
        : undefined;

    // Extract compensation
    let salaryMin: number | undefined;
    let salaryMax: number | undefined;
    let currency: string | undefined;
    const comp = job.compensation?.summaryComponents?.[0];
    if (comp) {
      salaryMin = comp.minValue;
      salaryMax = comp.maxValue;
      currency = comp.currency;
    }

    return {
      externalId: job.id,
      sourceProvider: this.name,
      companySlug: config.companySlug,
      title: job.title,
      department: job.department || job.team,
      location: locationStr || undefined,
      workMode,
      jobType: this.inferJobType(job.title + " " + (job.employmentType ?? "")),
      description,
      sourceUrl: job.jobUrl,
      applyUrl: job.applyUrl || job.jobUrl,
      postedDate: job.publishedAt ? new Date(job.publishedAt) : undefined,
      salaryMin,
      salaryMax,
      currency,
      rawText: description,
    };
  }
}

export default new AshbyProvider();
