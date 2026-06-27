/**
 * GreenhouseProvider
 * ──────────────────
 * Fetches open jobs via Greenhouse's public Boards REST API.
 *
 * Public API docs: https://developers.greenhouse.io/job-board.html
 * No authentication required. Rate-limiting is lenient (no stated limit).
 *
 * ToS note: Greenhouse's public Boards API is explicitly designed for
 * external consumption. Fetching these endpoints is fully permitted.
 *
 * HOW TO ADD A COMPANY
 * ─────────────────────
 * In providers/config.ts, add an entry with:
 *   providerName: "greenhouse"
 *   providerId: "<greenhouse_board_token>"
 *
 * The board token appears in the company's Greenhouse job board URL:
 *   https://boards.greenhouse.io/<board_token>
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { withRetry, httpGet } from "../retry";
import type { GreenhouseBoardResponse, GreenhouseJob } from "./types";

const BASE_URL = "https://boards-api.greenhouse.io/v1/boards";

export class GreenhouseProvider extends AbstractProvider {
  readonly name = "greenhouse";
  readonly displayName = "Greenhouse";
  readonly hasPublicApi = true;

  protected async doFetch(config: CompanyProviderConfig): Promise<ProviderJob[]> {
    const url = `${BASE_URL}/${encodeURIComponent(config.providerId)}/jobs?content=true`;

    const data = await withRetry(
      () => httpGet<GreenhouseBoardResponse>(url),
      { label: `greenhouse:${config.companySlug}`, maxAttempts: 3 },
    );

    return data.jobs.map((job) => this.normalize(job, config));
  }

  private normalize(job: GreenhouseJob, config: CompanyProviderConfig): ProviderJob {
    const locationStr = job.location?.name ?? "";
    const department = job.departments?.[0]?.name;

    const description = job.content ? this.stripHtml(job.content) : undefined;

    return {
      externalId: String(job.id),
      sourceProvider: this.name,
      companySlug: config.companySlug,
      title: job.title,
      department,
      location: locationStr || undefined,
      workMode: this.inferWorkMode(locationStr),
      jobType: this.inferJobType(job.title + " " + (department ?? "")),
      description,
      sourceUrl: job.absolute_url,
      applyUrl: job.absolute_url,
      postedDate: job.updated_at ? new Date(job.updated_at) : undefined,
      rawText: description,
    };
  }
}

export default new GreenhouseProvider();
