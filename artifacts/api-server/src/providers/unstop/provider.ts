/**
 * UnstopProvider  (SCAFFOLDING — no public API)
 * ──────────────────────────────────────────────
 * Unstop (formerly D2C) does not expose a public REST API for job or
 * opportunity listings. Their terms of service prohibit automated data
 * extraction.
 *
 * STATUS: Not implemented. Returns [] until a legitimate data access path
 * is available.
 *
 * FUTURE EXTENSION PATHS
 * ───────────────────────
 * 1. Official API partnership: Contact Unstop at
 *    https://unstop.com/contact-us for a data partnership.
 *
 * 2. Recruiter-side export: Unstop recruiters can export opportunity data.
 *    Build an UnstopManualProvider that parses that export format.
 *
 * 3. Webhook integration: If Unstop exposes a webhook for new opportunity
 *    postings in the future, implement a receiver in routes/webhooks.ts and
 *    pipe the payload through the normalizer directly.
 *
 * IMPLEMENTING A WEBHOOK RECEIVER (future)
 * ──────────────────────────────────────────
 * 1. Add POST /api/webhooks/unstop in routes/webhooks.ts
 * 2. Verify the payload signature (HMAC or shared secret)
 * 3. Parse the payload into ProviderJob using the normalizer
 * 4. Call deduplicationService.decide() + jobRepository.upsert()
 */

import { AbstractProvider } from "../base/provider";
import type { CompanyProviderConfig, ProviderJob } from "../types";

export class UnstopProvider extends AbstractProvider {
  readonly name = "unstop";
  readonly displayName = "Unstop";
  readonly hasPublicApi = false;

  protected async doFetch(_config: CompanyProviderConfig): Promise<ProviderJob[]> {
    return [];
  }
}

export default new UnstopProvider();
