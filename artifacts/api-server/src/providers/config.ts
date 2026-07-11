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
    // VERIFIED 2025-06-27: 120 jobs returned. REVERIFIED 2026-07-10: 119 jobs.
    // filterCountry: "India" — Postman is US-HQ'd, most roles are US/global.
    // We keep only Bengaluru + Remote roles to avoid flooding with US noise.
    companySlug: "postman",
    providerName: "greenhouse",
    providerId: "postman",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "Verified 2026-07-10 — 119 jobs live. filterCountry=India to surface Bengaluru + Remote roles only.",
  },
  {
    // VERIFIED 2025-06-27: 105 jobs. REVERIFIED 2026-07-10: 97 jobs.
    // filterCountry: "India" — Rubrik is US-HQ'd. Keep Bengaluru + Remote only.
    companySlug: "rubrik",
    providerName: "greenhouse",
    providerId: "rubrik",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "Verified 2026-07-10 — 97 jobs live. filterCountry=India — Bengaluru engineering center.",
  },
  {
    // VERIFIED 2025-06-27: 77 jobs. REVERIFIED 2026-07-10: 62 jobs.
    // filterCountry: "India" — ThoughtWorks posts heavily to US/UK. Keep India.
    companySlug: "thoughtworks",
    providerName: "greenhouse",
    providerId: "thoughtworks",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "Verified 2026-07-10 — 62 jobs live. filterCountry=India. Offices in Chennai, Bengaluru, Pune, Hyderabad.",
  },

  {
    // NEW 2026-07-10: PhonePe confirmed 53 jobs — ALL in Bengaluru, India.
    // No filterCountry needed: PhonePe is India-only by nature.
    companySlug: "phonepe",
    providerName: "greenhouse",
    providerId: "phonepe",
    enabled: true,
    note: "VERIFIED 2026-07-10 — 53 Bengaluru jobs live on boards-api.greenhouse.io/phonepe.",
  },

  {
    // NEW 2026-07-10: Groww confirmed 15 jobs — all India (Bengaluru + Mumbai).
    // Previously this entry showed 0 postings (June 2026); now live again.
    companySlug: "groww",
    providerName: "greenhouse",
    providerId: "groww",
    enabled: true,
    note: "VERIFIED 2026-07-10 — 15 jobs live (Bengaluru + Mumbai). All India roles.",
  },

  {
    // NEW 2026-07-10: Naukri/InfoEdge confirmed 3 jobs on Greenhouse.
    companySlug: "naukri",
    providerName: "greenhouse",
    providerId: "naukri",
    enabled: true,
    note: "VERIFIED 2026-07-10 — 3 jobs live on boards-api.greenhouse.io/naukri. InfoEdge platform.",
  },

  // ─── Global companies with India engineering offices (VERIFIED 2026-07-10) ───

  {
    // VERIFIED 2026-07-10: 787 total jobs, 74 in India (Bengaluru, Pune, Hyderabad).
    companySlug: "databricks",
    providerName: "greenhouse",
    providerId: "databricks",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-07-10 — 787 total, 74 India jobs. filterCountry=India. Major data/AI platform, Bengaluru engineering.",
  },
  {
    // VERIFIED 2026-07-10: 385 total jobs, 51 in India.
    companySlug: "mongodb",
    providerName: "greenhouse",
    providerId: "mongodb",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-07-10 — 385 total, 51 India jobs. filterCountry=India. Strong Bengaluru/Gurugram offices.",
  },
  {
    // VERIFIED 2026-07-10: 511 total jobs, 37 in India.
    companySlug: "stripe",
    providerName: "greenhouse",
    providerId: "stripe",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-07-10 — 511 total, 37 India jobs. filterCountry=India. Bengaluru engineering hub.",
  },
  {
    // VERIFIED 2026-07-10: 154 total jobs, 23 in India.
    companySlug: "twilio",
    providerName: "greenhouse",
    providerId: "twilio",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-07-10 — 154 total, 23 India jobs. filterCountry=India. Delhi/Bengaluru offices.",
  },
  {
    // VERIFIED 2026-07-10: 185 total jobs, 20 in India.
    companySlug: "elastic",
    providerName: "greenhouse",
    providerId: "elastic",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-07-10 — 185 total, 20 India jobs. filterCountry=India. Pune/Bengaluru engineering.",
  },
  {
    // VERIFIED 2026-07-10: 147 total jobs, 16 in India.
    companySlug: "gitlab",
    providerName: "greenhouse",
    providerId: "gitlab",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-07-10 — 147 total, 16 India jobs. filterCountry=India. All-remote company, India-eligible roles.",
  },
  {
    // VERIFIED 2026-07-10: 427 total jobs, 12 in India.
    companySlug: "datadog",
    providerName: "greenhouse",
    providerId: "datadog",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-07-10 — 427 total, 12 India jobs. filterCountry=India. Hyderabad engineering office.",
  },
  {
    // VERIFIED 2026-07-10: 132 total jobs, 10 in India.
    companySlug: "coinbase",
    providerName: "greenhouse",
    providerId: "coinbase",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-07-10 — 132 total, 10 India jobs. filterCountry=India. India remote-eligible roles.",
  },
  {
    // VERIFIED 2026-07-10: 247 total jobs, 3 in India.
    companySlug: "cloudflare",
    providerName: "greenhouse",
    providerId: "cloudflare",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-07-10 — 247 total, 3 India jobs. filterCountry=India. Small India footprint.",
  },
  {
    // VERIFIED 2026-07-10: 41 total jobs, 16 in India (Bengaluru, Pune).
    companySlug: "6sense",
    providerName: "greenhouse",
    providerId: "6sense",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-07-10 — 41 total, 16 India jobs. filterCountry=India. AI/MarTech with India R&D.",
  },
  {
    // VERIFIED 2026-07-10: 212 total jobs, 42 in India (Bengaluru, Pune, Delhi).
    companySlug: "alphasense",
    providerName: "greenhouse",
    providerId: "alphasense",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-07-10 — 212 total, 42 India jobs. filterCountry=India. AI/Market Intelligence, India R&D.",
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
    // BROKEN 2025-06-27, Reverified 2026-06-27: still 404. Freshworks migrated away from Greenhouse.
    // Freshworks confirmed on Lever (api.lever.co/v0/postings/freshworks) with 0 active postings as of 2026-06-27.
    companySlug: "freshworks",
    providerName: "greenhouse",
    providerId: "freshworks",
    enabled: false,
    note: "BROKEN 2026-06-27 — boards.greenhouse.io/freshworks still returns 404. Freshworks migrated to Lever (see Lever section).",
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

  {
    // REVERIFIED 2026-07-10: Lever board exists (HTTP 200) but 0 active postings.
    // Freshworks is now LIVE on SmartRecruiters with 121 total / 41 India jobs.
    // See SmartRecruiters section below.
    companySlug: "freshworks",
    providerName: "lever",
    providerId: "freshworks",
    enabled: false,
    note: "Lever board 0 postings as of 2026-07-10. Freshworks active on SmartRecruiters — see SR section.",
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
    // NEW 2026-07-10: Paytm confirmed 5 live postings on Lever.
    // Catalog had Paytm as "custom" — Lever is the actual ATS.
    companySlug: "paytm",
    providerName: "lever",
    providerId: "paytm",
    enabled: true,
    note: "VERIFIED 2026-07-10 — 5 live jobs on api.lever.co/v0/postings/paytm. Noida fintech.",
  },
  {
    // NEW 2026-07-10: Hevo Data confirmed 5 live postings on Lever.
    companySlug: "hevodata",
    providerName: "lever",
    providerId: "hevodata",
    enabled: true,
    note: "VERIFIED 2026-07-10 — 5 live jobs on Lever. Bengaluru data integration startup.",
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
    // BROKEN 2025-06-27, Reverified 2026-06-27: still 404. Groww migrated away from Lever.
    // Groww confirmed on Greenhouse (boards-api.greenhouse.io/v1/boards/groww/jobs) with 0 active postings as of 2026-06-27.
    companySlug: "groww",
    providerName: "lever",
    providerId: "groww",
    enabled: false,
    note: "BROKEN 2026-06-27 — api.lever.co/v0/postings/groww still returns 404. Groww migrated to Greenhouse (see Greenhouse section).",
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
  // REVERIFIED 2026-07-10:
  //   Freshworks: 121 total jobs, ~41 in India (Bengaluru, Chennai, Hyderabad) ✅
  //   Swiggy:     2 jobs live ✅
  //   All others: 0 postings — kept enabled so scheduler picks them up when live.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    // LIVE 2026-07-10: 121 total jobs; ~41 in India (Bengaluru, Chennai, Hyderabad).
    // SmartRecruiters provider already sets country from location.country field.
    companySlug: "freshworks",
    providerName: "smartrecruiters",
    providerId: "Freshworks",
    enabled: true,
    note: "VERIFIED 2026-07-10 — 121 live jobs on SmartRecruiters, ~41 in India. Chennai/Bengaluru/Hyderabad.",
  },

  {
    // LIVE 2026-07-10: 2 jobs (Sales Manager - Bangalore).
    companySlug: "swiggy",
    providerName: "smartrecruiters",
    providerId: "Swiggy",
    enabled: true,
    note: "VERIFIED 2026-07-10 — 2 jobs live on SmartRecruiters. Monitor for tech role ramp-up.",
  },

  {
    // REVERIFIED 2026-07-10: 0 postings. Keep enabled to auto-capture when live.
    companySlug: "delhivery",
    providerName: "smartrecruiters",
    providerId: "Delhivery",
    enabled: true,
    note: "SR account exists. 0 postings 2026-07-10 — will auto-import when roles post.",
  },
  {
    // REVERIFIED 2026-07-10: 0 postings.
    companySlug: "juspay",
    providerName: "smartrecruiters",
    providerId: "Juspay",
    enabled: true,
    note: "SR account exists. 0 postings 2026-07-10 — will auto-import when roles post.",
  },
  {
    // REVERIFIED 2026-07-10: 0 postings.
    companySlug: "inmobi",
    providerName: "smartrecruiters",
    providerId: "InMobi",
    enabled: true,
    note: "SR account exists. 0 postings 2026-07-10 — will auto-import when roles post.",
  },
  {
    // REVERIFIED 2026-07-10: 0 postings.
    companySlug: "ola",
    providerName: "smartrecruiters",
    providerId: "Ola",
    enabled: true,
    note: "SR account exists. 0 postings 2026-07-10 — will auto-import when roles post.",
  },
  {
    // REVERIFIED 2026-07-10: 0 postings.
    companySlug: "zs-associates",
    providerName: "smartrecruiters",
    providerId: "ZSAssociates",
    enabled: true,
    note: "SR account exists. 0 postings 2026-07-10 — will auto-import when roles post.",
  },
  {
    // REVERIFIED 2026-07-10: 0 postings.
    companySlug: "kpmg-india",
    providerName: "smartrecruiters",
    providerId: "KPMGIndia",
    enabled: true,
    note: "SR account exists. 0 postings 2026-07-10 — will auto-import when roles post.",
  },
  {
    // REVERIFIED 2026-07-10: 0 postings.
    companySlug: "nielsen",
    providerName: "smartrecruiters",
    providerId: "Nielsen",
    enabled: true,
    note: "SR account exists. 0 postings 2026-07-10 — will auto-import when roles post.",
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

  // ═══════════════════════════════════════════════════════════════════════════
  // JOB AGGREGATORS — multi-company sources
  // ═══════════════════════════════════════════════════════════════════════════
  {
    companySlug: "__remoteok__",
    providerName: "remoteok",
    providerId: "all",
    enabled: true,
    note: "RemoteOK free API — ~100 remote tech jobs, no API key needed.",
  },
  {
    companySlug: "__remotive__",
    providerName: "remotive",
    providerId: "software-dev",
    enabled: true,
    note: "Remotive free API — ~30 remote software dev jobs, no API key needed.",
  },
  {
    companySlug: "__adzuna__",
    providerName: "adzuna",
    providerId: "india",
    enabled: true,
    note: "Adzuna India API — intern-focused queries. Needs ADZUNA_APP_ID and ADZUNA_APP_KEY.",
  },
  {
    companySlug: "__jsearch__",
    providerName: "jsearch",
    providerId: "google-jobs-india",
    enabled: true,
    note: "JSearch/Google Jobs — intern-focused India queries. Needs JSEARCH_API_KEY.",
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
