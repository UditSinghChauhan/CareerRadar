/**
 * InternshalaProvider  (SCAFFOLDING — no public API)
 * ────────────────────────────────────────────────────
 * Internshala does not expose a public REST API for job/internship listings.
 * Their robots.txt disallows automated crawling of listing pages.
 *
 * STATUS: Not implemented. Returns [] until a legitimate data access path
 * is available.
 *
 * FUTURE EXTENSION PATHS
 * ───────────────────────
 * 1. Official partnership: Contact Internshala (team@internshala.com) about
 *    a data partnership or affiliate API.
 *
 * 2. Internshala Recruiter API: If/when they expose a B2B API, implement
 *    doFetch() here using the authorized endpoint.
 *
 * 3. Manual import: Use InternshalaImportProvider (a companion class in this
 *    directory) to accept a JSON/CSV dump from an Internshala recruiter
 *    dashboard export and parse it into ProviderJob objects.
 *
 * IMPLEMENTING A MANUAL IMPORT FLOW
 * ───────────────────────────────────
 * Extend ManualImportProvider (to be created in base/manual-import.ts):
 *
 *   export class InternshalaManualProvider extends ManualImportProvider {
 *     readonly name = "internshala-manual";
 *     readonly hasPublicApi = true; // We control the data source
 *
 *     protected parseRow(row: Record<string, string>): ProviderJob { ... }
 *   }
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";

export class InternshalaProvider extends AbstractProvider {
  readonly name = "internshala";
  readonly displayName = "Internshala";
  readonly hasPublicApi = false;

  protected async doFetch(_config: CompanyProviderConfig): Promise<ProviderJob[]> {
    return [];
  }
}

export default new InternshalaProvider();
