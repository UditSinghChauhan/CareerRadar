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
  // GREENHOUSE (continued) — boards-api.greenhouse.io
  // ═══════════════════════════════════════════════════════════════════════════

  {
    companySlug: "postman",
    providerName: "greenhouse",
    providerId: "postman",
    enabled: false,
    note: "Unverified — curl https://boards-api.greenhouse.io/v1/boards/postman/jobs to confirm",
  },
  {
    companySlug: "browserstack",
    providerName: "greenhouse",
    providerId: "browserstack",
    enabled: false,
    note: "Unverified — curl https://boards-api.greenhouse.io/v1/boards/browserstack/jobs to confirm",
  },
  {
    companySlug: "thoughtworks",
    providerName: "greenhouse",
    providerId: "thoughtworks",
    enabled: false,
    note: "Unverified — verify boards.greenhouse.io/thoughtworks",
  },
  {
    companySlug: "freshworks",
    providerName: "greenhouse",
    providerId: "freshworks",
    enabled: false,
    note: "Unverified — verify boards.greenhouse.io/freshworks",
  },
  {
    companySlug: "nutanix",
    providerName: "greenhouse",
    providerId: "nutanix",
    enabled: false,
    note: "Unverified — verify boards.greenhouse.io/nutanix",
  },
  {
    companySlug: "rubrik",
    providerName: "greenhouse",
    providerId: "rubrik",
    enabled: false,
    note: "Unverified — verify boards.greenhouse.io/rubrik",
  },
  {
    companySlug: "cohesity",
    providerName: "greenhouse",
    providerId: "cohesity",
    enabled: false,
    note: "Unverified — verify boards.greenhouse.io/cohesity",
  },
  {
    companySlug: "sap-labs",
    providerName: "greenhouse",
    providerId: "saplabs",
    enabled: false,
    note: "Unverified — verify boards.greenhouse.io/saplabs",
  },
  {
    companySlug: "vmware",
    providerName: "greenhouse",
    providerId: "vmware",
    enabled: false,
    note: "Unverified — verify boards.greenhouse.io/vmware",
  },
  {
    companySlug: "publicis-sapient",
    providerName: "greenhouse",
    providerId: "publicissapient",
    enabled: false,
    note: "Unverified — verify boards.greenhouse.io/publicissapient",
  },
  {
    companySlug: "cloudera",
    providerName: "greenhouse",
    providerId: "cloudera",
    enabled: false,
    note: "Unverified — verify boards.greenhouse.io/cloudera",
  },
  {
    companySlug: "informatica",
    providerName: "greenhouse",
    providerId: "informatica",
    enabled: false,
    note: "Unverified — verify boards.greenhouse.io/informatica",
  },
  {
    companySlug: "veritas",
    providerName: "greenhouse",
    providerId: "veritas",
    enabled: false,
    note: "Unverified — verify boards.greenhouse.io/veritas",
  },
  {
    companySlug: "mphasis",
    providerName: "greenhouse",
    providerId: "mphasis",
    enabled: false,
    note: "Unverified — verify boards.greenhouse.io/mphasis",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVER (continued) — api.lever.co/v0/postings
  // ═══════════════════════════════════════════════════════════════════════════

  {
    companySlug: "meesho",
    providerName: "lever",
    providerId: "meesho",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/meesho",
  },
  {
    companySlug: "cred",
    providerName: "lever",
    providerId: "cred",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/cred",
  },
  {
    companySlug: "groww",
    providerName: "lever",
    providerId: "groww",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/groww",
  },
  {
    companySlug: "zepto",
    providerName: "lever",
    providerId: "zepto",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/zepto",
  },
  {
    companySlug: "smallcase",
    providerName: "lever",
    providerId: "smallcase",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/smallcase",
  },
  {
    companySlug: "slice",
    providerName: "lever",
    providerId: "sliceit",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/sliceit",
  },
  {
    companySlug: "mpl",
    providerName: "lever",
    providerId: "mpl",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/mpl",
  },
  {
    companySlug: "dream11",
    providerName: "lever",
    providerId: "dreamsports",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/dreamsports",
  },
  {
    companySlug: "oyo",
    providerName: "lever",
    providerId: "oyo",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/oyo",
  },
  {
    companySlug: "lenskart",
    providerName: "lever",
    providerId: "lenskart",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/lenskart",
  },
  {
    companySlug: "niyo",
    providerName: "lever",
    providerId: "niyo",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/niyo",
  },
  {
    companySlug: "unacademy",
    providerName: "lever",
    providerId: "unacademy",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/unacademy",
  },
  {
    companySlug: "physicswallah",
    providerName: "lever",
    providerId: "physicswallah",
    enabled: false,
    note: "Unverified — verify jobs.lever.co/physicswallah",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ASHBY — api.ashbyhq.com/posting-public/jobs
  // ═══════════════════════════════════════════════════════════════════════════

  {
    companySlug: "linear",
    providerName: "ashby",
    providerId: "linear",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/linear",
  },
  {
    companySlug: "retool",
    providerName: "ashby",
    providerId: "retool",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/retool",
  },
  {
    companySlug: "cal",
    providerName: "ashby",
    providerId: "cal",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/cal",
  },
  {
    companySlug: "posthog",
    providerName: "ashby",
    providerId: "posthog",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/posthog",
  },
  {
    companySlug: "hasura",
    providerName: "ashby",
    providerId: "hasura",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/hasura",
  },
  {
    companySlug: "chargebee",
    providerName: "ashby",
    providerId: "chargebee",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/chargebee",
  },
  {
    companySlug: "darwinbox",
    providerName: "ashby",
    providerId: "darwinbox",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/darwinbox",
  },
  {
    companySlug: "100ms",
    providerName: "ashby",
    providerId: "100ms",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/100ms",
  },
  {
    companySlug: "setu",
    providerName: "ashby",
    providerId: "setu",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/setu",
  },
  {
    companySlug: "dukaan",
    providerName: "ashby",
    providerId: "dukaan",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/dukaan",
  },
  {
    companySlug: "leadsquared",
    providerName: "ashby",
    providerId: "leadsquared",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/leadsquared",
  },
  {
    companySlug: "vercel",
    providerName: "ashby",
    providerId: "vercel",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/vercel",
  },
  {
    companySlug: "ycombinator",
    providerName: "ashby",
    providerId: "ycombinator",
    enabled: false,
    note: "Unverified — verify jobs.ashbyhq.com/ycombinator",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SMARTRECRUITERS — api.smartrecruiters.com/v1/companies
  // ═══════════════════════════════════════════════════════════════════════════

  {
    companySlug: "delhivery",
    providerName: "smartrecruiters",
    providerId: "Delhivery",
    enabled: false,
    note: "Unverified — verify careers.smartrecruiters.com/Delhivery (case-sensitive)",
  },
  {
    companySlug: "juspay",
    providerName: "smartrecruiters",
    providerId: "Juspay",
    enabled: false,
    note: "Unverified — verify careers.smartrecruiters.com/Juspay",
  },
  {
    companySlug: "inmobi",
    providerName: "smartrecruiters",
    providerId: "InMobi",
    enabled: false,
    note: "Unverified — verify careers.smartrecruiters.com/InMobi",
  },
  {
    companySlug: "ola",
    providerName: "smartrecruiters",
    providerId: "Ola",
    enabled: false,
    note: "Unverified — verify careers.smartrecruiters.com/Ola (case-sensitive)",
  },
  {
    companySlug: "zs-associates",
    providerName: "smartrecruiters",
    providerId: "ZSAssociates",
    enabled: false,
    note: "Unverified — verify careers.smartrecruiters.com/ZSAssociates",
  },
  {
    companySlug: "kpmg-india",
    providerName: "smartrecruiters",
    providerId: "KPMGIndia",
    enabled: false,
    note: "Unverified — verify careers.smartrecruiters.com/KPMGIndia",
  },
  {
    companySlug: "nielsen",
    providerName: "smartrecruiters",
    providerId: "Nielsen",
    enabled: false,
    note: "Unverified — verify careers.smartrecruiters.com/Nielsen",
  },
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
