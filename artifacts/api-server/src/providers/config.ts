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
 *   SmartRecruiters:  curl -s "https://api.smartrecruiters.com/v1/companies/<id>/postings?limit=1" | head -c 200
 *
 *   Ashby: API returned HTTP 401 Unauthorized as of 2025-06-27. Public access
 *   is no longer available. Do not enable Ashby entries until this is resolved.
 *
 *   Workday: CXS endpoint returns HTTP 401 from non-browser environments.
 *   Requires browser session cookies. hasPublicApi = false until resolved.
 *
 * ATS DETECTION CHEAT SHEET
 * ──────────────────────────
 *   boards.greenhouse.io/<token>       → Greenhouse  (providerName: "greenhouse")
 *   jobs.lever.co/<slug>               → Lever       (providerName: "lever")
 *   jobs.ashbyhq.com/<org>             → Ashby       (providerName: "ashby")
 *   <co>.wd1.myworkdayjobs.com         → Workday     (providerName: "workday")
 *   careers.smartrecruiters.com/<id>   → SmartRecruiters (providerName: "smartrecruiters")
 *
 * LAST FULL AUDIT: 2025-06-27
 */

import type { CompanyProviderConfig } from "./types";

interface EnabledConfig extends CompanyProviderConfig {
  enabled?: boolean;
  note?: string;
}

const ALL_CONFIGS: EnabledConfig[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // GREENHOUSE — boards-api.greenhouse.io
  // Verify: curl -s "https://boards-api.greenhouse.io/v1/boards/<token>/jobs"
  // ═══════════════════════════════════════════════════════════════════════════

  {
    // VERIFIED 2025-06-27: 120 jobs returned.
    companySlug: "postman",
    providerName: "greenhouse",
    providerId: "postman",
    enabled: true,
    note: "Verified 2025-06-27 — 120 jobs live on boards-api.greenhouse.io/postman",
  },
  {
    // VERIFIED 2025-06-27: 105 jobs returned.
    companySlug: "rubrik",
    providerName: "greenhouse",
    providerId: "rubrik",
    enabled: true,
    note: "Verified 2025-06-27 — 105 jobs live on boards-api.greenhouse.io/rubrik",
  },
  {
    // VERIFIED 2025-06-27: 77 jobs returned.
    companySlug: "thoughtworks",
    providerName: "greenhouse",
    providerId: "thoughtworks",
    enabled: true,
    note: "Verified 2025-06-27 — 77 jobs live on boards-api.greenhouse.io/thoughtworks",
  },

  {
    // BROKEN 2025-06-27: returns "Job not found". Atlassian migrated to Workday.
    // Workday tenant: atlassian.wd5.myworkdayjobs.com — requires session auth (401).
    companySlug: "atlassian",
    providerName: "greenhouse",
    providerId: "atlassian",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/atlassian returns 404. Atlassian now on Workday (atlassian.wd5.myworkdayjobs.com) which requires browser session auth.",
  },
  {
    // BROKEN 2025-06-27: returns "Job not found". Adobe migrated away from Greenhouse.
    // Adobe careers at adobe.wd5.myworkdayjobs.com — requires session auth (401).
    companySlug: "adobe",
    providerName: "greenhouse",
    providerId: "adobe",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/adobe returns 404. Adobe now on Workday (adobe.wd5.myworkdayjobs.com) which requires browser session auth.",
  },
  {
    companySlug: "google",
    providerName: "greenhouse",
    providerId: "google",
    enabled: false,
    note: "Google uses custom ATS (careers.google.com). Not on Greenhouse.",
  },
  {
    // BROKEN 2025-06-27: returns "Job not found".
    companySlug: "freshworks",
    providerName: "greenhouse",
    providerId: "freshworks",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/freshworks returns 404. Freshworks likely migrated ATS. Reverify.",
  },
  {
    companySlug: "flipkart",
    providerName: "greenhouse",
    providerId: "flipkart",
    enabled: false,
    note: "Flipkart uses custom ATS. Not on Greenhouse.",
  },
  {
    // BROKEN 2025-06-27: returns "Job not found".
    companySlug: "browserstack",
    providerName: "greenhouse",
    providerId: "browserstack",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/browserstack returns 404. Reverify BrowserStack's current ATS.",
  },
  {
    // BROKEN 2025-06-27: returns "Job not found".
    companySlug: "nutanix",
    providerName: "greenhouse",
    providerId: "nutanix",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/nutanix returns 404. Nutanix on Workday (nutanix.wd5.myworkdayjobs.com) — requires auth.",
  },
  {
    // BROKEN 2025-06-27: returns "Job not found".
    companySlug: "cohesity",
    providerName: "greenhouse",
    providerId: "cohesity",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/cohesity returns 404. Reverify Cohesity's current ATS.",
  },
  {
    // BROKEN 2025-06-27: returns "Job not found".
    companySlug: "sap-labs",
    providerName: "greenhouse",
    providerId: "saplabs",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/saplabs returns 404. SAP uses its own career portal (jobs.sap.com).",
  },
  {
    // BROKEN 2025-06-27: returns "Job not found".
    companySlug: "vmware",
    providerName: "greenhouse",
    providerId: "vmware",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/vmware returns 404. VMware/Broadcom uses custom ATS.",
  },
  {
    // BROKEN 2025-06-27: returns "Job not found".
    companySlug: "publicis-sapient",
    providerName: "greenhouse",
    providerId: "publicissapient",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/publicissapient returns 404. Reverify current ATS.",
  },
  {
    // BROKEN 2025-06-27: returns "Job not found".
    companySlug: "cloudera",
    providerName: "greenhouse",
    providerId: "cloudera",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/cloudera returns 404. Reverify Cloudera's current ATS.",
  },
  {
    // BROKEN 2025-06-27: returns "Job not found".
    companySlug: "informatica",
    providerName: "greenhouse",
    providerId: "informatica",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/informatica returns 404. Reverify Informatica's current ATS.",
  },
  {
    // BROKEN 2025-06-27: returns "Job not found".
    companySlug: "veritas",
    providerName: "greenhouse",
    providerId: "veritas",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/veritas returns 404. Reverify Veritas's current ATS.",
  },
  {
    // BROKEN 2025-06-27: returns "Job not found".
    companySlug: "mphasis",
    providerName: "greenhouse",
    providerId: "mphasis",
    enabled: false,
    note: "BROKEN 2025-06-27 — boards.greenhouse.io/mphasis returns 404. Reverify Mphasis's current ATS.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVER — api.lever.co/v0/postings
  // Verify: curl -s "https://api.lever.co/v0/postings/<slug>?mode=json&limit=1"
  // ═══════════════════════════════════════════════════════════════════════════

  {
    // VERIFIED 2025-06-27: returns live postings.
    companySlug: "meesho",
    providerName: "lever",
    providerId: "meesho",
    enabled: true,
    note: "Verified 2025-06-27 — jobs.lever.co/meesho returns live postings.",
  },
  {
    // VERIFIED 2025-06-27: returns live postings.
    companySlug: "cred",
    providerName: "lever",
    providerId: "cred",
    enabled: true,
    note: "Verified 2025-06-27 — jobs.lever.co/cred returns live postings.",
  },
  {
    // VERIFIED 2025-06-27: returns live postings.
    companySlug: "dream11",
    providerName: "lever",
    providerId: "dreamsports",
    enabled: true,
    note: "Verified 2025-06-27 — jobs.lever.co/dreamsports returns live postings.",
  },

  {
    // BROKEN 2025-06-27: returns "Document not found". Slug invalid.
    // Note: This was previously enabled. Razorpay may have changed their Lever slug.
    companySlug: "razorpay",
    providerName: "lever",
    providerId: "razorpay",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/razorpay returns 404. Razorpay may have migrated ATS. Check jobs.razorpay.com directly.",
  },
  {
    // BROKEN 2025-06-27: returns "Document not found".
    companySlug: "swiggy",
    providerName: "lever",
    providerId: "swiggy",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/swiggy returns 404. Swiggy not on Lever.",
  },
  {
    // BROKEN 2025-06-27: returns "Document not found".
    companySlug: "zomato",
    providerName: "lever",
    providerId: "zomato",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/zomato returns 404. Zomato not on Lever.",
  },
  {
    companySlug: "microsoft",
    providerName: "lever",
    providerId: "microsoft",
    enabled: false,
    note: "Microsoft uses custom ATS (careers.microsoft.com). Not on Lever.",
  },
  {
    // BROKEN 2025-06-27: returns "Document not found".
    companySlug: "groww",
    providerName: "lever",
    providerId: "groww",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/groww returns 404. Reverify Groww's current ATS.",
  },
  {
    // BROKEN 2025-06-27: returns "Document not found".
    companySlug: "zepto",
    providerName: "lever",
    providerId: "zepto",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/zepto returns 404. Reverify Zepto's current ATS.",
  },
  {
    // BROKEN 2025-06-27: returns "Document not found".
    companySlug: "smallcase",
    providerName: "lever",
    providerId: "smallcase",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/smallcase returns 404.",
  },
  {
    // BROKEN 2025-06-27: returns "Document not found".
    companySlug: "slice",
    providerName: "lever",
    providerId: "sliceit",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/sliceit returns 404.",
  },
  {
    // BROKEN 2025-06-27: returns "Document not found".
    companySlug: "mpl",
    providerName: "lever",
    providerId: "mpl",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/mpl returns 404.",
  },
  {
    // BROKEN 2025-06-27: returns "Document not found".
    companySlug: "oyo",
    providerName: "lever",
    providerId: "oyo",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/oyo returns 404. OYO may have migrated ATS.",
  },
  {
    // BROKEN 2025-06-27: returns "Document not found".
    companySlug: "lenskart",
    providerName: "lever",
    providerId: "lenskart",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/lenskart returns 404.",
  },
  {
    // BROKEN 2025-06-27: returns "Document not found".
    companySlug: "niyo",
    providerName: "lever",
    providerId: "niyo",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/niyo returns 404.",
  },
  {
    // BROKEN 2025-06-27: returns "Document not found".
    companySlug: "unacademy",
    providerName: "lever",
    providerId: "unacademy",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/unacademy returns 404.",
  },
  {
    // BROKEN 2025-06-27: returns "Document not found".
    companySlug: "physicswallah",
    providerName: "lever",
    providerId: "physicswallah",
    enabled: false,
    note: "BROKEN 2025-06-27 — api.lever.co/v0/postings/physicswallah returns 404.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ASHBY — api.ashbyhq.com/posting-public/jobs
  //
  // STATUS AS OF 2025-06-27: HTTP 401 UNAUTHORIZED
  // Ashby's previously public /posting-public/jobs endpoint now requires
  // authentication. All companies below are disabled until Ashby restores
  // public access or provides an alternative endpoint.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    companySlug: "linear",
    providerName: "ashby",
    providerId: "linear",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API (api.ashbyhq.com/posting-public/jobs) returns HTTP 401. Public access revoked.",
  },
  {
    companySlug: "retool",
    providerName: "ashby",
    providerId: "retool",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API returns HTTP 401. Public access revoked.",
  },
  {
    companySlug: "cal",
    providerName: "ashby",
    providerId: "cal",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API returns HTTP 401. Public access revoked.",
  },
  {
    companySlug: "posthog",
    providerName: "ashby",
    providerId: "posthog",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API returns HTTP 401. Public access revoked.",
  },
  {
    companySlug: "hasura",
    providerName: "ashby",
    providerId: "hasura",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API returns HTTP 401. Public access revoked.",
  },
  {
    companySlug: "chargebee",
    providerName: "ashby",
    providerId: "chargebee",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API returns HTTP 401. Public access revoked.",
  },
  {
    companySlug: "darwinbox",
    providerName: "ashby",
    providerId: "darwinbox",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API returns HTTP 401. Public access revoked.",
  },
  {
    companySlug: "100ms",
    providerName: "ashby",
    providerId: "100ms",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API returns HTTP 401. Public access revoked.",
  },
  {
    companySlug: "setu",
    providerName: "ashby",
    providerId: "setu",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API returns HTTP 401. Public access revoked.",
  },
  {
    companySlug: "dukaan",
    providerName: "ashby",
    providerId: "dukaan",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API returns HTTP 401. Public access revoked.",
  },
  {
    companySlug: "leadsquared",
    providerName: "ashby",
    providerId: "leadsquared",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API returns HTTP 401. Public access revoked.",
  },
  {
    companySlug: "vercel",
    providerName: "ashby",
    providerId: "vercel",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API returns HTTP 401. Public access revoked.",
  },
  {
    companySlug: "ycombinator",
    providerName: "ashby",
    providerId: "ycombinator",
    enabled: false,
    note: "DISABLED 2025-06-27 — Ashby API returns HTTP 401. Public access revoked.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SMARTRECRUITERS — api.smartrecruiters.com/v1/companies
  //
  // STATUS AS OF 2025-06-27: Company accounts exist but 0 active postings.
  // Keeping disabled until companies post new roles.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    companySlug: "delhivery",
    providerName: "smartrecruiters",
    providerId: "Delhivery",
    enabled: false,
    note: "Verified 2025-06-27 — SmartRecruiters account exists but 0 active postings.",
  },
  {
    companySlug: "juspay",
    providerName: "smartrecruiters",
    providerId: "Juspay",
    enabled: false,
    note: "Verified 2025-06-27 — SmartRecruiters account exists but 0 active postings.",
  },
  {
    companySlug: "inmobi",
    providerName: "smartrecruiters",
    providerId: "InMobi",
    enabled: false,
    note: "Verified 2025-06-27 — SmartRecruiters account exists but 0 active postings.",
  },
  {
    companySlug: "ola",
    providerName: "smartrecruiters",
    providerId: "Ola",
    enabled: false,
    note: "Verified 2025-06-27 — SmartRecruiters account exists but 0 active postings.",
  },
  {
    companySlug: "zs-associates",
    providerName: "smartrecruiters",
    providerId: "ZSAssociates",
    enabled: false,
    note: "Verified 2025-06-27 — SmartRecruiters account exists but 0 active postings.",
  },
  {
    companySlug: "kpmg-india",
    providerName: "smartrecruiters",
    providerId: "KPMGIndia",
    enabled: false,
    note: "Verified 2025-06-27 — SmartRecruiters account exists but 0 active postings.",
  },
  {
    companySlug: "nielsen",
    providerName: "smartrecruiters",
    providerId: "Nielsen",
    enabled: false,
    note: "Verified 2025-06-27 — SmartRecruiters account exists but 0 active postings.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKDAY — WorkdayProvider (hasPublicApi = false)
  //
  // STATUS AS OF 2025-06-27: HTTP 401 from all non-browser environments.
  // The Workday CXS REST endpoint (/wday/cxs/{tenant}/{board}/jobs) requires
  // browser session cookies (CSRF token + Workday session cookie). There is
  // no documented public API for job board access.
  //
  // These entries are pre-configured for when public access is resolved.
  // At that point, set WorkdayProvider.hasPublicApi = true and enable entries.
  //
  // extra.wd     = Workday datacenter number (wd1–wd5)
  // extra.board  = job board path segment from the careers URL
  // extra.tenant = company tenant identifier
  // ═══════════════════════════════════════════════════════════════════════════

  {
    companySlug: "atlassian",
    providerName: "workday",
    providerId: "atlassian",
    enabled: false,
    extra: { wd: "wd5", board: "Atlassian", tenant: "atlassian" },
    note: "Workday tenant confirmed (atlassian.wd5.myworkdayjobs.com). Disabled — CXS API returns HTTP 401 from non-browser env.",
  },
  {
    companySlug: "adobe",
    providerName: "workday",
    providerId: "adobe",
    enabled: false,
    extra: { wd: "wd5", board: "external_experienced_careers", tenant: "adobe" },
    note: "Workday tenant likely adobe.wd5.myworkdayjobs.com. Disabled — CXS API returns HTTP 401 from non-browser env.",
  },
  {
    companySlug: "nutanix",
    providerName: "workday",
    providerId: "nutanix",
    enabled: false,
    extra: { wd: "wd5", board: "Nutanixjobs", tenant: "nutanix" },
    note: "Workday tenant likely nutanix.wd5.myworkdayjobs.com. Disabled — CXS API returns HTTP 401.",
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
