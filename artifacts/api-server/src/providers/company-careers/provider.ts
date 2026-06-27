/**
 * CompanyCareersProvider  (ABSTRACT BASE — extend per company)
 * ──────────────────────────────────────────────────────────────
 * Base class for fetching jobs from company-specific careers pages that
 * expose a structured JSON endpoint (common for React SPAs).
 *
 * Many Indian tech companies (Flipkart, Swiggy, Zomato, Razorpay, etc.) run
 * their own Workday, SAP SuccessFactors, SmartRecruiters, or custom ATS
 * instances with predictable JSON endpoints.
 *
 * USAGE
 * ─────
 * 1. Inspect the company's careers page network traffic (browser DevTools).
 * 2. Locate the JSON endpoint that returns job listings.
 * 3. Confirm it has no auth requirement and is publicly accessible.
 * 4. Verify the company's robots.txt and ToS permit this access.
 * 5. Create `providers/company-careers/<company>/provider.ts`.
 * 6. Extend CompanyCareersProvider and implement `fetchFromEndpoint()`.
 * 7. Register in `providers/registry.ts` and `providers/config.ts`.
 *
 * EXAMPLE SUBCLASS
 * ─────────────────
 *
 *   export class FlipkartCareersProvider extends CompanyCareersProvider {
 *     readonly name = "flipkart-careers";
 *     readonly displayName = "Flipkart Careers";
 *     readonly hasPublicApi = true;
 *
 *     protected get endpointUrl() {
 *       return "https://careers.flipkart.com/api/jobs?type=fulltime";
 *     }
 *
 *     protected parseJobs(raw: unknown): ProviderJob[] {
 *       const data = raw as FlipkartJobsResponse;
 *       return data.results.map(job => ({
 *         externalId: String(job.id),
 *         sourceProvider: this.name,
 *         companySlug: "flipkart",
 *         title: job.title,
 *         department: job.department,
 *         location: job.location,
 *         workMode: this.inferWorkMode(job.workplaceType),
 *         jobType: this.inferJobType(job.title),
 *         sourceUrl: `https://careers.flipkart.com/jobs/${job.id}`,
 *         applyUrl: job.applyUrl,
 *       }));
 *     }
 *   }
 *
 * WORKDAY COMPANIES
 * ──────────────────
 * Companies on Workday (e.g. Adobe India, Atlassian India) expose a
 * semi-public JSON endpoint pattern:
 *
 *   POST https://<company>.wd1.myworkdayjobs.com/wday/cxs/<company>/<board>/jobs
 *   Body: {"appliedFacets":{},"limit":20,"offset":0,"searchText":""}
 *
 * This endpoint is publicly accessible (no auth). Implement a
 * WorkdayProvider subclass here to support all Workday companies.
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { httpGet } from "../retry";

export abstract class CompanyCareersProvider extends AbstractProvider {
  /** Override with the company-specific JSON endpoint URL. */
  protected abstract get endpointUrl(): string;

  /** Parse the raw API response into ProviderJob objects. */
  protected abstract parseJobs(raw: unknown, config: CompanyProviderConfig): ProviderJob[];

  protected async doFetch(config: CompanyProviderConfig): Promise<ProviderJob[]> {
    const url = config.providerId || this.endpointUrl;
    const raw = await httpGet<unknown>(url);
    return this.parseJobs(raw, config);
  }
}

/**
 * SmartRecruitersCareersProvider
 * ───────────────────────────────
 * SmartRecruiters exposes a public API for all companies using their ATS.
 * No authentication required.
 *
 * API: GET https://api.smartrecruiters.com/v1/companies/{companyId}/postings
 *
 * Companies known to use SmartRecruiters in India:
 *   - Ola (companyId: "ola")
 *   - BYJU'S (companyId: "BYJUs")
 *
 * HOW TO ADD A COMPANY
 * ─────────────────────
 * In providers/config.ts, add an entry with:
 *   providerName: "smartrecruiters"
 *   providerId: "<smartrecruiters_company_id>"
 */
interface SmartRecruitersPosting {
  id: string;
  name: string;
  location: { city?: string; country?: string; remote?: boolean };
  department?: { label: string };
  typeOfEmployment?: { label: string };
  jobAd?: { sections?: { jobDescription?: { text?: string } } };
  ref: string;
}

interface SmartRecruitersResponse {
  content: SmartRecruitersPosting[];
}

export class SmartRecruitersProvider extends AbstractProvider {
  readonly name = "smartrecruiters";
  readonly displayName = "SmartRecruiters";
  readonly hasPublicApi = true;

  protected async doFetch(config: CompanyProviderConfig): Promise<ProviderJob[]> {
    const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(config.providerId)}/postings?status=PUBLISHED&limit=100`;
    const data = await httpGet<SmartRecruitersResponse>(url);
    return data.content.map((p) => this.normalize(p, config));
  }

  private normalize(p: SmartRecruitersPosting, config: CompanyProviderConfig): ProviderJob {
    const city = p.location?.city ?? "";
    const country = p.location?.country ?? "";
    const locationStr = [city, country].filter(Boolean).join(", ");

    return {
      externalId: p.id,
      sourceProvider: this.name,
      companySlug: config.companySlug,
      title: p.name,
      department: p.department?.label,
      location: locationStr || undefined,
      country: country || undefined,
      workMode: p.location?.remote ? "remote" : this.inferWorkMode(locationStr),
      jobType: this.inferJobType(p.name + " " + (p.typeOfEmployment?.label ?? "")),
      description: p.jobAd?.sections?.jobDescription?.text,
      sourceUrl: p.ref,
      applyUrl: p.ref,
    };
  }
}
