/**
 * Company Provider Configuration
 * ───────────────────────────────
 * Maps each company in our DB to the provider and provider-specific ID that
 * should be used to fetch its job postings.
 *
 * ADDING A NEW COMPANY
 * ─────────────────────
 * 1. Ensure the company row exists in the `companies` table (slug must match).
 * 2. Identify which ATS the company uses (check their careers page URL).
 * 3. Find the provider-specific identifier:
 *    - Greenhouse: board token from boards.greenhouse.io/<token>
 *    - Lever:      slug from jobs.lever.co/<slug>
 *    - Ashby:      org name from jobs.ashbyhq.com/<org>
 *    - SmartRecruiters: company ID from smartrecruiters.com/jobs/<id>
 * 4. Add a CompanyProviderConfig entry below.
 * 5. Restart the API server. The scheduler picks it up on the next run.
 *
 * CONFIRMED PROVIDERS FOR SEEDED COMPANIES
 * ──────────────────────────────────────────
 * Google       → Greenhouse   ("google")     boards.greenhouse.io/google
 * Microsoft    → Custom ATS   (not yet impl) careers.microsoft.com
 * Flipkart     → Greenhouse   ("flipkart")   boards.greenhouse.io/flipkart [verify]
 * Swiggy       → Lever        ("swiggy")     jobs.lever.co/swiggy [verify]
 * Zomato       → Lever        ("zomato")     jobs.lever.co/zomato [verify]
 * Razorpay     → Lever        ("razorpay")   jobs.lever.co/razorpay
 * Adobe        → Workday      (custom)       adobe.wd5.myworkdayjobs.com [not yet impl]
 * Atlassian    → Greenhouse   ("atlassian")  boards.greenhouse.io/atlassian
 *
 * NOTE: Verify each board token by visiting the URL before enabling.
 * Set `enabled: false` to skip a company without removing its config.
 */

import type { CompanyProviderConfig } from "./types";

interface EnabledConfig extends CompanyProviderConfig {
  /** Set to false to temporarily disable without deleting the config. */
  enabled?: boolean;
}

const ALL_CONFIGS: EnabledConfig[] = [
  // ── Greenhouse companies ────────────────────────────────────────────────────
  // HOW TO VERIFY: Visit https://boards.greenhouse.io/<token>
  // If it loads a job board, the token is correct — set enabled: true.
  {
    // Google uses its own ATS (not Greenhouse). Keep disabled until a
    // Google-specific provider is built (Workday/custom).
    companySlug: "google",
    providerName: "greenhouse",
    providerId: "google",
    enabled: false,
  },
  {
    // Verify: https://boards.greenhouse.io/atlassian
    // Atlassian uses Greenhouse — token may be "atlassianau" or "atlassian".
    companySlug: "atlassian",
    providerName: "greenhouse",
    providerId: "atlassian",
    enabled: false,
  },
  {
    // Verify: https://boards.greenhouse.io/flipkart
    companySlug: "flipkart",
    providerName: "greenhouse",
    providerId: "flipkart",
    enabled: false,
  },

  // ── Lever companies ─────────────────────────────────────────────────────────
  // HOW TO VERIFY: Visit https://jobs.lever.co/<slug>
  // If it loads a Lever-hosted jobs page, the slug is correct — set enabled: true.
  {
    // Verify: https://jobs.lever.co/razorpay
    companySlug: "razorpay",
    providerName: "lever",
    providerId: "razorpay",
    enabled: false,
  },
  {
    // Verify: https://jobs.lever.co/swiggy
    companySlug: "swiggy",
    providerName: "lever",
    providerId: "swiggy",
    enabled: false,
  },
  {
    // Verify: https://jobs.lever.co/zomato
    companySlug: "zomato",
    providerName: "lever",
    providerId: "zomato",
    enabled: false,
  },

  // ── Ashby companies ─────────────────────────────────────────────────────────
  // Add Ashby companies here once verified.
  // Example (not a seeded company):
  // {
  //   companySlug: "linear",
  //   providerName: "ashby",
  //   providerId: "linear",
  //   enabled: true,
  // },

  // ── SmartRecruiters companies ───────────────────────────────────────────────
  // Example (not a seeded company):
  // {
  //   companySlug: "ola",
  //   providerName: "smartrecruiters",
  //   providerId: "Ola",
  //   enabled: true,
  // },
];

/** Returns only enabled configurations. */
export function getEnabledConfigs(): CompanyProviderConfig[] {
  return ALL_CONFIGS
    .filter((c) => c.enabled !== false)
    .map(({ enabled: _enabled, ...rest }) => rest);
}

/** Returns all configurations including disabled ones (for admin UI). */
export function getAllConfigs(): EnabledConfig[] {
  return ALL_CONFIGS;
}
