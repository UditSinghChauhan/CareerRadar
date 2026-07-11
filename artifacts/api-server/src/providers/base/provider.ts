import { logger } from "../../lib/logger";
import type { CompanyProviderConfig, JobProvider, ProviderJob } from "../types";

/**
 * AbstractProvider
 * ─────────────────
 * Base class for all job providers. Handles:
 *  - Logging (start / success / error)
 *  - Timing
 *  - No-op scaffolding guard (hasPublicApi = false)
 *
 * Subclasses must implement `doFetch(config)`.
 *
 * IMPLEMENTING A NEW PROVIDER
 * ───────────────────────────
 * 1. Create `providers/<name>/provider.ts`
 * 2. Extend AbstractProvider
 * 3. Set `name`, `displayName`, `hasPublicApi`
 * 4. Implement `protected doFetch(config): Promise<ProviderJob[]>`
 * 5. Register in `providers/registry.ts`
 */
export abstract class AbstractProvider implements JobProvider {
  abstract readonly name: string;
  abstract readonly displayName: string;

  /**
   * Set to `false` for providers that don't have a usable public API yet.
   * fetchJobs() will log a warning and return [] to prevent ToS violations.
   */
  abstract readonly hasPublicApi: boolean;

  /**
   * Provider-specific fetch logic. Called only when `hasPublicApi` is true.
   * Must return normalized ProviderJob objects.
   */
  protected abstract doFetch(config: CompanyProviderConfig): Promise<ProviderJob[]>;

  async fetchJobs(config: CompanyProviderConfig): Promise<ProviderJob[]> {
    const tag = `${this.name}:${config.companySlug}`;

    if (!this.hasPublicApi) {
      logger.warn(
        { provider: this.name, companySlug: config.companySlug },
        `[${tag}] Provider is scaffolding-only — no public API available. ` +
          `Implement doFetch() once a legitimate API/feed is available.`,
      );
      return [];
    }

    const start = Date.now();
    logger.info({ provider: this.name, companySlug: config.companySlug }, `[${tag}] Fetching jobs`);

    try {
      const jobs = await this.doFetch(config);

      logger.info(
        { provider: this.name, companySlug: config.companySlug, count: jobs.length, ms: Date.now() - start },
        `[${tag}] Fetched ${jobs.length} jobs in ${Date.now() - start}ms`,
      );

      return jobs;
    } catch (err) {
      logger.error(
        { err, provider: this.name, companySlug: config.companySlug, ms: Date.now() - start },
        `[${tag}] Fetch failed`,
      );
      throw err;
    }
  }

  /**
   * Infer job type from title/commitment string.
   * Returns "internship" if any keyword matches, else "full_time".
   */
  protected inferJobType(text: string): "internship" | "full_time" {
    const lower = text.toLowerCase();
    if (
      lower.includes("intern") ||
      lower.includes("internship") ||
      lower.includes("co-op") ||
      lower.includes("coop") ||
      lower.includes("trainee")
    ) {
      return "internship";
    }
    return "full_time";
  }

  /**
   * Infer work mode from location/tags string.
   * Returns "remote" | "hybrid" | "onsite".
   */
  protected inferWorkMode(text: string): "remote" | "hybrid" | "onsite" {
    const lower = text.toLowerCase();
    if (lower.includes("remote") && !lower.includes("hybrid")) return "remote";
    if (lower.includes("hybrid")) return "hybrid";
    return "onsite";
  }

  /**
   * Infer country from a location string.
   * Returns "India" if any major Indian city or the word "india" is found.
   * Returns undefined for remote or unrecognized locations — callers can
   * fall back to a catalog-level country if needed.
   */
  protected inferCountry(location: string): string | undefined {
    if (!location) return undefined;
    const l = location.toLowerCase();
    const indiaCities = [
      "bengaluru", "bangalore",
      "mumbai", "bombay",
      "pune",
      "hyderabad",
      "chennai", "madras",
      "delhi", "new delhi",
      "noida",
      "gurugram", "gurgaon",
      "kolkata", "calcutta",
      "ahmedabad",
      "jaipur",
      "chandigarh",
      "indore",
      "coimbatore",
      "kochi",
      "india",
    ];
    if (indiaCities.some((city) => l.includes(city))) return "India";
    return undefined;
  }

  /**
   * Strip HTML tags from a description string. Quick-and-dirty — for
   * production quality, swap with a proper sanitiser library.
   */
  protected stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
}
