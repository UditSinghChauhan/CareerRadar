/**
 * Company Provider Configuration
 * ───────────────────────────────
 * Maps each company in our DB to the provider and provider-specific ID that
 * fetches its job postings.
 *
 * HOW TO VERIFY A TOKEN BEFORE ENABLING
 * ───────────────────────────────────────
 *   Greenhouse:       curl -s "https://boards-api.greenhouse.io/v1/boards/<token>/jobs" | head -c 200
 *   Lever:            curl -s "https://api.lever.co/v0/postings/<slug>?mode=json&limit=1" | head -c 200
 *   Ashby:            curl -s -X POST https://api.ashbyhq.com/posting-public/jobs \
 *                       -H "Content-Type: application/json" \
 *                       -d '{"organizationHostedJobsPageName":"<org>"}' | head -c 200
 *   SmartRecruiters:  curl -s "https://api.smartrecruiters.com/v1/companies/<id>/postings?limit=1" | head -c 200
 *
 * If the response contains jobs data, set enabled: true.
 * If it returns 404, the token is wrong — check the company's careers URL.
 *
 * ADDING A NEW COMPANY
 * ─────────────────────
 * 1. Add a company row to the DB (via seed or POST /api/companies).
 * 2. Identify its ATS from the careers page URL pattern.
 * 3. Add an entry below with the verified token.
 * 4. Set enabled: true and restart the server.
 *
 * ATS DETECTION CHEAT SHEET
 * ──────────────────────────
 *   boards.greenhouse.io/<token>       → Greenhouse  (providerName: "greenhouse")
 *   jobs.lever.co/<slug>               → Lever       (providerName: "lever")
 *   jobs.ashbyhq.com/<org>             → Ashby       (providerName: "ashby")
 *   <co>.wd1.myworkdayjobs.com         → Workday     (not yet implemented)
 *   careers.smartrecruiters.com/<id>   → SmartRecruiters (providerName: "smartrecruiters")
 */

import type { CompanyProviderConfig } from "./types";

interface EnabledConfig extends CompanyProviderConfig {
  enabled?: boolean;
  /** Short note explaining why this is enabled/disabled. */
  note?: string;
}

const ALL_CONFIGS: EnabledConfig[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // GREENHOUSE — boards-api.greenhouse.io
  // ═══════════════════════════════════════════════════════════════════════════

  {
    // Atlassian India uses Greenhouse. Board token confirmed via
    // https://boards.greenhouse.io/atlassian
    companySlug: "atlassian",
    providerName: "greenhouse",
    providerId: "atlassian",
    enabled: true,
    note: "Confirmed: boards.greenhouse.io/atlassian returns live jobs",
  },
  {
    // Adobe India uses Greenhouse for engineering roles.
    // Verify: https://boards.greenhouse.io/adobe
    companySlug: "adobe",
    providerName: "greenhouse",
    providerId: "adobe",
    enabled: true,
    note: "Enabled — disable and set correct token if 404",
  },
  {
    // Google uses its own careers ATS, not Greenhouse.
    companySlug: "google",
    providerName: "greenhouse",
    providerId: "google",
    enabled: false,
    note: "Google uses custom ATS. Build a dedicated Workday/custom provider.",
  },
  {
    // Verify: https://boards.greenhouse.io/flipkart
    companySlug: "flipkart",
    providerName: "greenhouse",
    providerId: "flipkart",
    enabled: false,
    note: "Flipkart ATS unconfirmed. Verify before enabling.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVER — api.lever.co/v0/postings
  // ═══════════════════════════════════════════════════════════════════════════

  {
    // Razorpay is confirmed on Lever.
    // Verify: https://jobs.lever.co/razorpay
    companySlug: "razorpay",
    providerName: "lever",
    providerId: "razorpay",
    enabled: true,
    note: "Confirmed: jobs.lever.co/razorpay",
  },
  {
    // Swiggy has historically used Lever. Verify before enabling.
    // Verify: https://jobs.lever.co/swiggy
    companySlug: "swiggy",
    providerName: "lever",
    providerId: "swiggy",
    enabled: false,
    note: "Unconfirmed — verify jobs.lever.co/swiggy before enabling",
  },
  {
    // Zomato — verify slug before enabling.
    companySlug: "zomato",
    providerName: "lever",
    providerId: "zomato",
    enabled: false,
    note: "Unconfirmed — verify jobs.lever.co/zomato before enabling",
  },
  {
    // Microsoft India uses its own ATS (careers.microsoft.com), not Lever.
    companySlug: "microsoft",
    providerName: "lever",
    providerId: "microsoft",
    enabled: false,
    note: "Microsoft uses custom ATS. Build a dedicated provider.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ASHBY — api.ashbyhq.com/posting-public/jobs
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Most Ashby companies are global product-led firms. Add Indian unicorns
  // here once you verify they use Ashby via jobs.ashbyhq.com/<org>.
  //
  // Example (not in our seeded companies table):
  // {
  //   companySlug: "meesho",
  //   providerName: "ashby",
  //   providerId: "meesho",
  //   enabled: false,
  //   note: "Verify: jobs.ashbyhq.com/meesho",
  // },

  // ═══════════════════════════════════════════════════════════════════════════
  // SMARTRECRUITERS — api.smartrecruiters.com/v1/companies
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // SmartRecruiters exposes a fully public API. No auth required.
  // Companies in India known to use SmartRecruiters:
  //
  // {
  //   companySlug: "ola",
  //   providerName: "smartrecruiters",
  //   providerId: "Ola",      ← note: case-sensitive company ID
  //   enabled: false,
  //   note: "Verify: careers.smartrecruiters.com/Ola",
  // },
];

/** Returns only enabled configurations. */
export function getEnabledConfigs(): CompanyProviderConfig[] {
  return ALL_CONFIGS
    .filter((c) => c.enabled !== false)
    .map(({ enabled: _e, note: _n, ...rest }) => rest);
}

/** Returns all configurations including disabled ones (used by GET /providers). */
export function getAllConfigs(): EnabledConfig[] {
  return ALL_CONFIGS;
}
