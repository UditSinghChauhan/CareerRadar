/**
 * LeverProvider
 * ─────────────
 * Fetches open jobs via Lever's public Postings API v0.
 *
 * Public API docs: https://hire.lever.co/developer/postings
 * No authentication required for published postings.
 *
 * ToS note: Lever's public postings endpoint (`/v0/postings/:company`) is
 * explicitly meant for embedding and external job boards. Fetching it is
 * fully permitted.
 *
 * HOW TO ADD A COMPANY
 * ─────────────────────
 * In providers/config.ts, add an entry with:
 *   providerName: "lever"
 *   providerId: "<lever_company_slug>"
 *
 * The slug appears in the Lever careers URL:
 *   https://jobs.lever.co/<slug>
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { withRetry, httpGet } from "../retry";
import type { LeverPosting } from "./types";

const BASE_URL = "https://api.lever.co/v0/postings";

export class LeverProvider extends AbstractProvider {
  readonly name = "lever";
  readonly displayName = "Lever";
  readonly hasPublicApi = true;

  protected async doFetch(config: CompanyProviderConfig): Promise<ProviderJob[]> {
    const url = `${BASE_URL}/${encodeURIComponent(config.providerId)}?mode=json&skip=0&limit=500`;

    const postings = await withRetry(
      () => httpGet<LeverPosting[]>(url),
      { label: `lever:${config.companySlug}`, maxAttempts: 3 },
    );

    return postings.map((posting) => this.normalize(posting, config));
  }

  private normalize(posting: LeverPosting, config: CompanyProviderConfig): ProviderJob {
    const commitment = posting.categories.commitment ?? "";
    const location = posting.categories.location ?? "";
    const allLocations = (posting.categories.allLocations ?? []).join(", ");
    const locationStr = allLocations || location;

    const description = posting.descriptionPlain
      ? posting.descriptionPlain
      : posting.description
        ? this.stripHtml(posting.description)
        : undefined;

    const country = this.inferCountry(locationStr);

    return {
      externalId: posting.id,
      sourceProvider: this.name,
      companySlug: config.companySlug,
      title: posting.text,
      department: posting.categories.department || posting.categories.team,
      location: locationStr || undefined,
      country,
      workMode: this.inferWorkMode(locationStr + " " + commitment),
      jobType: this.inferJobType(posting.text + " " + commitment),
      description,
      sourceUrl: posting.hostedUrl,
      applyUrl: posting.applyUrl || posting.hostedUrl,
      postedDate: posting.createdAt ? new Date(posting.createdAt) : undefined,
      rawText: description,
    };
  }
}

export default new LeverProvider();
