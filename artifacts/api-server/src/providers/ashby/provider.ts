/**
 * AshbyProvider
 * ─────────────
 * Fetches open jobs from Ashby's public Job Board API.
 *
 *   GET https://api.ashbyhq.com/posting-api/job-board/{jobBoardName}
 *
 * ACCESS STATUS (verified 2026-09-14)
 * ────────────────────────────────────
 * This provider used to POST to `api.ashbyhq.com/posting-public/jobs`, which
 * started returning HTTP 401 in June 2025 and still does today — that endpoint
 * is genuinely gone, not misconfigured. The *posting-api* endpoint above is
 * Ashby's documented public job-board feed and answers 200 without any
 * credential. Measured on 2026-09-14: linear 30 jobs, posthog 11, ycombinator
 * 8, vercel 0 (board live, no open roles).
 *
 * A board name that is not hosted returns 404, which is how the 9 stale slugs
 * in config.ts were identified — that is a wrong-slug signal, not an auth wall.
 *
 * ToS note: this is the feed Ashby publishes for exactly this purpose. No
 * credential is forged, no browser session is replayed, no HTML is scraped.
 *
 * HOW TO ADD A COMPANY
 * ─────────────────────
 * In providers/config.ts:
 *   providerName: "ashby"
 *   providerId: "<job_board_name>"   // the segment in https://jobs.ashbyhq.com/<name>
 *   extra: { filterCountry: "India" } // optional, see below
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";
import { withRetry, httpGet } from "../retry";
import type {
  AshbyAddress,
  AshbyJobBoardResponse,
  AshbyJobPosting,
} from "./types";

const BASE_URL = "https://api.ashbyhq.com/posting-api/job-board";

/**
 * Location strings that mean "remote, anywhere" rather than "remote within a
 * specific region". Only these survive a `filterCountry` on a remote posting —
 * see `matchesCountry`.
 */
const UNSCOPED_REMOTE = /^(remote|anywhere|worldwide|global|distributed)$/i;

export class AshbyProvider extends AbstractProvider {
  readonly name = "ashby";
  readonly displayName = "Ashby";
  readonly hasPublicApi = true;

  protected async doFetch(
    config: CompanyProviderConfig,
  ): Promise<ProviderJob[]> {
    const url = `${BASE_URL}/${encodeURIComponent(config.providerId)}?includeCompensation=true`;

    const data = await withRetry(() => httpGet<AshbyJobBoardResponse>(url), {
      label: `ashby:${config.companySlug}`,
      maxAttempts: 3,
    });

    // `isListed: false` is Ashby's own "hidden from the board" flag. Undefined
    // means the board does not use the field, which is not a reason to drop.
    const listed = (data.jobs ?? []).filter((j) => j.isListed !== false);

    const filterCountry = config.extra?.["filterCountry"] as string | undefined;
    const kept = filterCountry
      ? listed.filter((j) => this.matchesCountry(j, filterCountry))
      : listed;

    return kept.map((job) => this.normalize(job, config));
  }

  /**
   * Does this posting plausibly admit an applicant in `filterCountry`?
   *
   * WHY THIS IS STRICTER THAN THE GREENHOUSE VERSION
   * ─────────────────────────────────────────────────
   * GreenhouseProvider keeps any posting whose workMode is "remote", on the
   * reasoning that a remote role is location-agnostic. On Ashby boards that
   * rule is close to useless: Linear, PostHog and Y Combinator mark nearly
   * every posting `isRemote: true` while scoping it in the location string —
   * "Remote (EMEA)", "Remote (UK)", "Remote (US)". Keeping all of those would
   * put hundreds of roles a Delhi NCR student cannot apply to into the daily
   * queue, which is the specific failure this filter exists to prevent.
   *
   * So a remote posting is kept only when nothing scopes it away: the location
   * reads as unscoped-remote AND the stated country is absent or itself global.
   * Anything naming the filter country — in the primary location, the postal
   * address, or any secondary location — is kept regardless of work mode.
   */
  private matchesCountry(job: AshbyJobPosting, filterCountry: string): boolean {
    const wanted = filterCountry.toLowerCase();

    const locations = [
      job.location,
      ...(job.secondaryLocations ?? []).map((s) => s.location),
    ].filter((l): l is string => typeof l === "string" && l.length > 0);

    const countries = [
      job.address,
      ...(job.secondaryLocations ?? []).map((s) => s.address),
    ]
      .map((a) => this.addressCountry(a))
      .filter((c): c is string => c !== undefined);

    // Positive evidence: something explicitly names the country we want.
    if (locations.some((l) => this.inferCountry(l)?.toLowerCase() === wanted)) {
      return true;
    }
    if (countries.some((c) => c.toLowerCase().includes(wanted))) {
      return true;
    }

    if (!job.isRemote) return false;

    // Remote, with no mention of the country. Keep it only if nothing scopes it
    // to somewhere else: a bare "Remote" with no stated country is genuinely
    // open, "Remote (EMEA)" is not.
    const unscopedLocation =
      locations.length === 0 ||
      locations.every((l) => UNSCOPED_REMOTE.test(l.trim()));

    // "US | EU" and similar multi-country strings are scoping, not global.
    const unscopedCountry = countries.length === 0;

    return unscopedLocation && unscopedCountry;
  }

  private addressCountry(address?: AshbyAddress): string | undefined {
    const country = address?.postalAddress?.addressCountry;
    return country && country.trim().length > 0 ? country : undefined;
  }

  private normalize(
    job: AshbyJobPosting,
    config: CompanyProviderConfig,
  ): ProviderJob {
    const locationStr = job.location ?? "";

    // workplaceType is Ashby's structured field and beats parsing free text;
    // fall back to the inherited string heuristic when a board omits it.
    const workplaceType = job.workplaceType?.toLowerCase();
    const workMode =
      workplaceType === "remote"
        ? "remote"
        : workplaceType === "hybrid"
          ? "hybrid"
          : workplaceType === "onsite"
            ? "onsite"
            : job.isRemote
              ? "remote"
              : this.inferWorkMode(locationStr);

    const description = job.descriptionPlain
      ? job.descriptionPlain
      : job.descriptionHtml
        ? this.stripHtml(job.descriptionHtml)
        : undefined;

    const comp = job.compensation?.summaryComponents?.[0];

    // Prefer a country the posting actually states over one guessed from the
    // location string, which cannot tell "Remote (EMEA)" from "Remote".
    const country =
      this.inferCountry(locationStr) ?? this.addressCountry(job.address);

    return {
      externalId: job.id,
      sourceProvider: this.name,
      companySlug: config.companySlug,
      title: job.title,
      department: job.department || job.team,
      location: locationStr || undefined,
      country,
      workMode,
      jobType: this.inferJobType(`${job.title} ${job.employmentType ?? ""}`),
      description,
      sourceUrl: job.jobUrl,
      applyUrl: job.applyUrl || job.jobUrl,
      postedDate: job.publishedAt ? new Date(job.publishedAt) : undefined,
      salaryMin: comp?.minValue,
      salaryMax: comp?.maxValue,
      currency: comp?.currencyCode,
      rawText: description,
    };
  }
}

export default new AshbyProvider();
