/**
 * WellfoundProvider  (SCAFFOLDING — no public API)
 * ──────────────────────────────────────────────────
 * Wellfound (formerly AngelList Talent) does not provide a public API for
 * programmatic job listings. Their robots.txt and ToS prohibit automated
 * scraping.
 *
 * STATUS: Not implemented. Returns [] until a legitimate data access path
 * is available.
 *
 * FUTURE EXTENSION PATHS
 * ───────────────────────
 * 1. Partnership / official data feed: Contact Wellfound for a data
 *    partnership or RSS/API access.
 *
 * 2. Official partner program: Wellfound has a Jobs API for vetted partners.
 *    Apply at https://wellfound.com/partners and implement here once granted.
 *
 * 3. Company RSS feeds: Some Wellfound company pages offer RSS. If a company
 *    explicitly enables this, implement an `RssFeedProvider` base class and
 *    extend it here.
 *
 * IMPLEMENTING WHEN READY
 * ────────────────────────
 * 1. Set `hasPublicApi = true`
 * 2. Implement `doFetch(config)` using the approved data source
 * 3. Map response fields to `ProviderJob` using the helpers from AbstractProvider
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";

export class WellfoundProvider extends AbstractProvider {
  readonly name = "wellfound";
  readonly displayName = "Wellfound (AngelList)";

  /**
   * Deliberately false until a legitimate public API is available.
   * AbstractProvider will log a warning and return [] safely.
   */
  readonly hasPublicApi = false;

  protected async doFetch(_config: CompanyProviderConfig): Promise<ProviderJob[]> {
    // Will not be called while hasPublicApi = false.
    return [];
  }
}

export default new WellfoundProvider();
