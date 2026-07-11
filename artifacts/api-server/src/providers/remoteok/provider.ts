/**
 * RemoteOkProvider
 * ────────────────
 * Fetches remote tech jobs from RemoteOK's public JSON API. This is a
 * multi-company aggregator (not one company per config) — a single config
 * entry ("__remoteok__") pulls ALL current listings in one call.
 *
 * Public API: GET https://remoteok.com/api
 * No authentication required, but RemoteOK returns HTTP 403 without a
 * plausible browser-like User-Agent header.
 *
 * Response shape: a JSON array where the FIRST element is a metadata/legal
 * object (no `id` field) — skip it. The rest are job objects.
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { withRetry, httpGet } from "../retry";
import { slugify } from "../../lib/slugify";
import type { RemoteOkResponse, RemoteOkJob } from "./types";

const API_URL = "https://remoteok.com/api";

// RemoteOK blocks the default fetch/library User-Agent with a 403.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function isJob(entry: RemoteOkResponse[number]): entry is RemoteOkJob {
  return typeof (entry as RemoteOkJob).id === "string";
}

export class RemoteOkProvider extends AbstractProvider {
  readonly name = "remoteok";
  readonly displayName = "RemoteOK";
  readonly hasPublicApi = true;

  protected async doFetch(_config: CompanyProviderConfig): Promise<ProviderJob[]> {
    const data = await withRetry(
      () =>
        httpGet<RemoteOkResponse>(API_URL, {
          headers: { "User-Agent": BROWSER_USER_AGENT },
        }),
      { label: "remoteok:all", maxAttempts: 3 },
    );

    return data.filter(isJob).map((job) => this.normalize(job));
  }

  private normalize(job: RemoteOkJob): ProviderJob {
    const tagsStr = (job.tags ?? []).join(" ");
    const locationStr = job.location || "Worldwide";
    const description = job.description ? this.stripHtml(job.description) : undefined;

    return {
      externalId: job.id,
      sourceProvider: this.name,
      companySlug: slugify(job.company),
      companyName: job.company,
      title: job.position,
      location: locationStr,
      country: this.inferCountry(locationStr),
      workMode: this.inferWorkMode(`${locationStr} ${tagsStr} remote`),
      jobType: this.inferJobType(`${job.position} ${tagsStr}`),
      description,
      sourceUrl: job.url,
      applyUrl: job.apply_url || job.url,
      postedDate: job.date ? new Date(job.date) : undefined,
      salaryMin: job.salary_min,
      salaryMax: job.salary_max,
      requiredSkills: job.tags,
      rawText: description,
    };
  }
}

export default new RemoteOkProvider();
