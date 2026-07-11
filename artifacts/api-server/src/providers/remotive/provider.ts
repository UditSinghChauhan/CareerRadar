/**
 * RemotiveProvider
 * ────────────────
 * Fetches remote software-dev jobs from Remotive's public JSON API. Like
 * RemoteOK, this is a multi-company aggregator — a single config entry
 * ("__remotive__") pulls the whole software-dev category in one call.
 *
 * Public API: GET https://remotive.com/api/remote-jobs?category=software-dev
 * No authentication required.
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { withRetry, httpGet } from "../retry";
import { slugify } from "../../lib/slugify";
import type { RemotiveResponse, RemotiveJob } from "./types";

const API_URL = "https://remotive.com/api/remote-jobs?category=software-dev&limit=100";

export class RemotiveProvider extends AbstractProvider {
  readonly name = "remotive";
  readonly displayName = "Remotive";
  readonly hasPublicApi = true;

  protected async doFetch(_config: CompanyProviderConfig): Promise<ProviderJob[]> {
    const data = await withRetry(() => httpGet<RemotiveResponse>(API_URL), {
      label: "remotive:software-dev",
      maxAttempts: 3,
    });

    return (data.jobs ?? []).map((job) => this.normalize(job));
  }

  private normalize(job: RemotiveJob): ProviderJob {
    const locationStr = job.candidate_required_location || "Worldwide";
    const description = job.description ? this.stripHtml(job.description) : undefined;

    return {
      externalId: String(job.id),
      sourceProvider: this.name,
      companySlug: slugify(job.company_name),
      companyName: job.company_name,
      title: job.title,
      department: job.category,
      location: locationStr,
      country: this.inferCountry(locationStr),
      // Remotive only lists remote roles; still respect explicit hybrid/onsite wording.
      workMode: this.inferWorkMode(`${locationStr} remote`),
      jobType: this.inferJobType(`${job.title} ${job.job_type ?? ""}`),
      description,
      sourceUrl: job.url,
      applyUrl: job.url,
      postedDate: job.publication_date ? new Date(job.publication_date) : undefined,
      rawText: description,
    };
  }
}

export default new RemotiveProvider();
