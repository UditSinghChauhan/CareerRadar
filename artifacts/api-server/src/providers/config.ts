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
 *   Ashby:            curl -s "https://api.ashbyhq.com/posting-api/job-board/<board>" | head -c 200
 *
 *   Ashby NOTE: the old POST api.ashbyhq.com/posting-public/jobs endpoint is
 *   dead (re-confirmed HTTP 401 on 2026-09-14). The GET posting-api endpoint
 *   above is public and answers 200 with no credential. An unknown board name
 *   returns 404 there, which is a wrong-slug signal, NOT an auth wall.
 *
 *   SmartRecruiters CAUTION: this API has no 404. Measured 2026-09-14,
 *   /v1/companies/<anything>/postings returns 200 with totalFound=0 even for a
 *   company that does not exist. A zero is therefore NOT evidence the account
 *   exists; only a non-zero count proves a board is real.
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
 * LAST FULL AUDIT: 2026-09-14 — see docs/provider-health.md for the measured run.
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
    // REGRESSED 2026-09-14: the board that served 53 Bengaluru jobs in July now
    // 404s. Also 404 on Lever and Ashby, and SmartRecruiters cannot confirm
    // either way (see the SmartRecruiters caution in the header). PhonePe's
    // current ATS is unresolved, so this stays off rather than guessing.
    companySlug: "phonepe",
    providerName: "greenhouse",
    providerId: "phonepe",
    enabled: false,
    note: "BROKEN 2026-09-14 — boards-api.greenhouse.io/v1/boards/phonepe/jobs returns 404 (was 53 jobs on 2026-07-10). Tried phonepe/PhonePe/phonepeltd on Greenhouse, Lever and Ashby: all 404. Current ATS unresolved.",
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
  // ─── Phase 5.4: India coverage, all verified live on 2026-09-14 ───────────
  // Counts are "total on the board" / "kept after filterCountry=India".

  {
    // VERIFIED 2026-09-14: 83 total, 60 India. Order-to-cash SaaS; Hyderabad
    // and Chennai engineering centres, hires freshers in volume.
    companySlug: "highradius",
    providerName: "greenhouse",
    providerId: "highradius",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-09-14 — 83 total, 60 India after filterCountry. Hyderabad/Chennai; strong fresher intake.",
  },
  {
    // VERIFIED 2026-09-14: 29 total, 22 India.
    companySlug: "hackerrank",
    providerName: "greenhouse",
    providerId: "hackerrank",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-09-14 — 29 total, 22 India after filterCountry. Bengaluru HQ engineering.",
  },
  {
    // VERIFIED 2026-09-14: 45 total, 26 India.
    companySlug: "glance",
    providerName: "greenhouse",
    providerId: "glance",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-09-14 — 45 total, 26 India after filterCountry. InMobi group, Bengaluru.",
  },
  {
    // VERIFIED 2026-09-14: 41 total, 15 India.
    companySlug: "druva",
    providerName: "greenhouse",
    providerId: "druva",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-09-14 — 41 total, 15 India after filterCountry. Pune engineering centre.",
  },
  {
    // VERIFIED 2026-09-14: 17 total, 12 India.
    companySlug: "observeai",
    providerName: "greenhouse",
    providerId: "observeai",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-09-14 — 17 total, 12 India after filterCountry. Bengaluru AI/contact-centre.",
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
    note: "VERIFIED 2026-09-14 — 50 live postings on api.lever.co/v0/postings/meesho.",
  },
  {
    // VERIFIED 2025-06-27: returns live postings.
    companySlug: "cred",
    providerName: "lever",
    providerId: "cred",
    enabled: true,
    note: "VERIFIED 2026-09-14 — 11 live postings on api.lever.co/v0/postings/cred.",
  },
  {
    // REGRESSED 2026-09-14: api.lever.co/v0/postings/dreamsports returns 404.
    // dream11, dreamsports and dream11-sports all 404 on Greenhouse, Lever and
    // Ashby. Current ATS unresolved — left off rather than guessed at.
    companySlug: "dream11",
    providerName: "lever",
    providerId: "dreamsports",
    enabled: false,
    note: "BROKEN 2026-09-14 — api.lever.co/v0/postings/dreamsports returns 404 (was live 2025-06-27). dream11 / dreamsports / dream11-sports all 404 across Greenhouse, Lever and Ashby.",
  },

  {
    // NEW 2026-07-10: Paytm confirmed 5 live postings on Lever.
    // Catalog had Paytm as "custom" — Lever is the actual ATS.
    companySlug: "paytm",
    providerName: "lever",
    providerId: "paytm",
    enabled: true,
    note: "VERIFIED 2026-09-14 — 210 live postings on api.lever.co/v0/postings/paytm (was 5 on 2026-07-10). Noida fintech.",
  },
  {
    // NEW 2026-07-10: Hevo Data confirmed 5 live postings on Lever.
    companySlug: "hevodata",
    providerName: "lever",
    providerId: "hevodata",
    enabled: true,
    note: "VERIFIED 2026-09-14 — 46 live postings on Lever (was 5 on 2026-07-10). Bengaluru data integration startup.",
  },

  // ─── Phase 5.4: India coverage, all verified live on 2026-09-14 ───────────
  // No filterCountry on these — each is India-native, so the board is already
  // almost entirely India and a filter would only risk dropping valid rows.

  {
    // VERIFIED 2026-09-14: 19 postings, all India (16 Pune, 3 Bengaluru).
    companySlug: "mindtickle",
    providerName: "lever",
    providerId: "mindtickle",
    enabled: true,
    note: "VERIFIED 2026-09-14 — 19 live postings, all India (Pune 16, Bengaluru 3). Sales-enablement SaaS.",
  },
  {
    // VERIFIED 2026-09-14: 18 postings, 16 India (Bengaluru/Hyderabad/Mumbai).
    companySlug: "zeta",
    providerName: "lever",
    providerId: "zeta",
    enabled: true,
    note: "VERIFIED 2026-09-14 — 18 live postings, 16 India (Bengaluru, Hyderabad, Mumbai); 2 US. Banking-tech unicorn.",
  },
  {
    // VERIFIED 2026-09-14: 13 postings, all Bengaluru.
    companySlug: "fampay",
    providerName: "lever",
    providerId: "fampay",
    enabled: true,
    note: "VERIFIED 2026-09-14 — 13 live postings, all Bengaluru. Teen-fintech, hires freshers.",
  },
  {
    // VERIFIED 2026-09-14: 11 postings, all Bangalore. 4 are internships.
    companySlug: "epifi",
    providerName: "lever",
    providerId: "epifi",
    enabled: true,
    note: "VERIFIED 2026-09-14 — 11 live postings, all Bangalore, 4 tagged internship. Fi Money neobank.",
  },
  {
    // VERIFIED 2026-09-14: 9 postings, all Bengaluru. Previously configured as
    // an Ashby entry, where the board name 404s — Lever is the real ATS.
    companySlug: "100ms",
    providerName: "lever",
    providerId: "100ms",
    enabled: true,
    note: "VERIFIED 2026-09-14 — 9 live postings, all Bengaluru, on api.lever.co/v0/postings/100ms. Moved here from the Ashby section, where the board 404s.",
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
  // ASHBY — api.ashbyhq.com/posting-api/job-board/{board}
  //
  // STATUS 2026-09-14: PUBLIC ACCESS WORKS.
  // The old POST /posting-public/jobs endpoint these entries were disabled
  // against in June 2025 is still 401 and is not coming back. The GET
  // posting-api job-board endpoint is public, needs no credential, and answers
  // 200. Re-measured every board below on 2026-09-14.
  //
  // A 404 here means the board name is wrong or the company left Ashby — it is
  // NOT an auth wall, so a 404 entry is a research task, not a blocked one.
  //
  // filterCountry: "India" is stricter on Ashby than on Greenhouse. Ashby boards
  // mark nearly everything isRemote while scoping it in the location string
  // ("Remote (EMEA)", "Remote (US)"), so AshbyProvider keeps a remote posting
  // only when nothing scopes it elsewhere. See providers/ashby/provider.ts.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    // VERIFIED 2026-09-14: 110 postings, 88 of them India after filterCountry.
    // Automotive retail SaaS with a large Bengaluru/Chennai engineering base —
    // the single highest-yield board found in this audit.
    companySlug: "tekion",
    providerName: "ashby",
    providerId: "tekion",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-09-14 — 110 total postings, 88 India after filterCountry, on api.ashbyhq.com/posting-api/job-board/tekion.",
  },
  {
    // VERIFIED 2026-09-14: 8 postings, 6 India after filterCountry.
    companySlug: "atlan",
    providerName: "ashby",
    providerId: "atlan",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-09-14 — 8 total postings, 6 India after filterCountry. Data catalog startup, Delhi NCR + remote India.",
  },
  {
    // VERIFIED 2026-09-14: 11 postings, 5 India after filterCountry.
    companySlug: "skyflow",
    providerName: "ashby",
    providerId: "skyflow",
    enabled: true,
    extra: { filterCountry: "India" },
    note: "VERIFIED 2026-09-14 — 11 total postings, 5 India after filterCountry. Data-privacy vault, Bengaluru engineering.",
  },

  // ─── Boards that are LIVE but yield nothing for an India-based applicant ────
  // Each of these answers 200 with real postings. They stay disabled because
  // every posting is scoped to a region this app's user cannot apply from, so
  // enabling them would add noise to the daily queue and nothing else. The
  // measured counts are recorded so a future session does not re-test the
  // endpoint and mistake "filtered to zero" for "endpoint broken".

  {
    companySlug: "linear",
    providerName: "ashby",
    providerId: "linear",
    enabled: false,
    extra: { filterCountry: "India" },
    note: "Board LIVE 2026-09-14 — 30 postings — but 0 survive filterCountry=India: every role is North America (19), Europe (7+2) or London (2). Enable only if Linear opens India-eligible roles.",
  },
  {
    companySlug: "posthog",
    providerName: "ashby",
    providerId: "posthog",
    enabled: false,
    extra: { filterCountry: "India" },
    note: "Board LIVE 2026-09-14 — 11 postings — but 0 survive filterCountry=India: all are Remote (US/EMEA/UK) or San Francisco.",
  },
  {
    companySlug: "ycombinator",
    providerName: "ashby",
    providerId: "ycombinator",
    enabled: false,
    extra: { filterCountry: "India" },
    note: "Board LIVE 2026-09-14 — 8 postings — but 0 survive filterCountry=India: all San Francisco Bay Area.",
  },
  {
    companySlug: "vercel",
    providerName: "ashby",
    providerId: "vercel",
    enabled: false,
    note: "Board LIVE 2026-09-14 — HTTP 200 — but 0 postings open. Endpoint is healthy; re-check later.",
  },

  // ─── Board name not resolved — 404 on Ashby, Greenhouse and Lever ──────────
  // These were disabled in 2025 against the wrong diagnosis (the dead
  // posting-public endpoint). Re-tested on the working endpoint 2026-09-14:
  // each 404s, meaning the board name is not hosted on Ashby at all. None was
  // resolvable from Greenhouse or Lever either. They stay disabled with a dated
  // note rather than being enabled on a guessed slug.

  {
    companySlug: "retool",
    providerName: "ashby",
    providerId: "retool",
    enabled: false,
    note: "UNRESOLVED 2026-09-14 — api.ashbyhq.com/posting-api/job-board/retool returns 404, i.e. this board name is not hosted on Ashby. Also 404 on Greenhouse and Lever. Current ATS not identified; do not enable without a live non-zero count.",
  },
  {
    companySlug: "cal",
    providerName: "ashby",
    providerId: "cal",
    enabled: false,
    note: "UNRESOLVED 2026-09-14 — api.ashbyhq.com/posting-api/job-board/cal returns 404, i.e. this board name is not hosted on Ashby. Also 404 on Greenhouse and Lever. Current ATS not identified; do not enable without a live non-zero count.",
  },
  {
    companySlug: "hasura",
    providerName: "ashby",
    providerId: "hasura",
    enabled: false,
    note: "UNRESOLVED 2026-09-14 — api.ashbyhq.com/posting-api/job-board/hasura returns 404, i.e. this board name is not hosted on Ashby. Also 404 on Greenhouse and Lever. Current ATS not identified; do not enable without a live non-zero count.",
  },
  {
    companySlug: "chargebee",
    providerName: "ashby",
    providerId: "chargebee",
    enabled: false,
    note: "UNRESOLVED 2026-09-14 — api.ashbyhq.com/posting-api/job-board/chargebee returns 404, i.e. this board name is not hosted on Ashby. Also 404 on Greenhouse and Lever. Current ATS not identified; do not enable without a live non-zero count.",
  },
  {
    companySlug: "darwinbox",
    providerName: "ashby",
    providerId: "darwinbox",
    enabled: false,
    note: "UNRESOLVED 2026-09-14 — api.ashbyhq.com/posting-api/job-board/darwinbox returns 404, i.e. this board name is not hosted on Ashby. Also 404 on Greenhouse and Lever. Current ATS not identified; do not enable without a live non-zero count.",
  },
  {
    companySlug: "setu",
    providerName: "ashby",
    providerId: "setu",
    enabled: false,
    note: "UNRESOLVED 2026-09-14 — api.ashbyhq.com/posting-api/job-board/setu returns 404, i.e. this board name is not hosted on Ashby. Also 404 on Greenhouse and Lever. Current ATS not identified; do not enable without a live non-zero count.",
  },
  {
    companySlug: "dukaan",
    providerName: "ashby",
    providerId: "dukaan",
    enabled: false,
    note: "UNRESOLVED 2026-09-14 — api.ashbyhq.com/posting-api/job-board/dukaan returns 404, i.e. this board name is not hosted on Ashby. Also 404 on Greenhouse and Lever. Current ATS not identified; do not enable without a live non-zero count.",
  },
  {
    companySlug: "leadsquared",
    providerName: "ashby",
    providerId: "leadsquared",
    enabled: false,
    note: "UNRESOLVED 2026-09-14 — api.ashbyhq.com/posting-api/job-board/leadsquared returns 404, i.e. this board name is not hosted on Ashby. Also 404 on Greenhouse and Lever. Current ATS not identified; do not enable without a live non-zero count.",
  },

  // 100ms moved off Ashby entirely — it is on Lever now, and that entry lives
  // in the Lever section below with its verified count.

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
    note: "VERIFIED 2026-09-14 — 139 live postings on SmartRecruiters (was 121 on 2026-07-10). Chennai/Bengaluru/Hyderabad.",
  },

  {
    // LIVE 2026-07-10: 2 jobs (Sales Manager - Bangalore).
    companySlug: "swiggy",
    providerName: "smartrecruiters",
    providerId: "Swiggy",
    enabled: true,
    note: "VERIFIED 2026-09-14 — 71 live postings on SmartRecruiters (was 2 on 2026-07-10).",
  },

  {
    // REVERIFIED 2026-07-10: 0 postings. Keep enabled to auto-capture when live.
    companySlug: "delhivery",
    providerName: "smartrecruiters",
    providerId: "Delhivery",
    enabled: true,
    note: "UNVERIFIABLE 2026-09-14 — 0 postings. SmartRecruiters returns 200/totalFound=0 for companies that do not exist, so this does NOT confirm the account. Left enabled: an empty fetch costs one request and cannot close jobs (the last-seen sweep is disarmed at fetchedCount=0). Confirm via the careers page before relying on it.",
  },
  {
    // REVERIFIED 2026-07-10: 0 postings.
    companySlug: "juspay",
    providerName: "smartrecruiters",
    providerId: "Juspay",
    enabled: true,
    note: "UNVERIFIABLE 2026-09-14 — 0 postings. SmartRecruiters returns 200/totalFound=0 for companies that do not exist, so this does NOT confirm the account. Left enabled: an empty fetch costs one request and cannot close jobs (the last-seen sweep is disarmed at fetchedCount=0). Confirm via the careers page before relying on it.",
  },
  {
    // REVERIFIED 2026-07-10: 0 postings.
    companySlug: "inmobi",
    providerName: "smartrecruiters",
    providerId: "InMobi",
    enabled: true,
    note: "UNVERIFIABLE 2026-09-14 — 0 postings. SmartRecruiters returns 200/totalFound=0 for companies that do not exist, so this does NOT confirm the account. Left enabled: an empty fetch costs one request and cannot close jobs (the last-seen sweep is disarmed at fetchedCount=0). Confirm via the careers page before relying on it.",
  },
  {
    // REVERIFIED 2026-07-10: 0 postings.
    companySlug: "ola",
    providerName: "smartrecruiters",
    providerId: "Ola",
    enabled: true,
    note: "UNVERIFIABLE 2026-09-14 — 0 postings. SmartRecruiters returns 200/totalFound=0 for companies that do not exist, so this does NOT confirm the account. Left enabled: an empty fetch costs one request and cannot close jobs (the last-seen sweep is disarmed at fetchedCount=0). Confirm via the careers page before relying on it.",
  },
  {
    // REVERIFIED 2026-07-10: 0 postings.
    companySlug: "zs-associates",
    providerName: "smartrecruiters",
    providerId: "ZSAssociates",
    enabled: true,
    note: "UNVERIFIABLE 2026-09-14 — 0 postings. SmartRecruiters returns 200/totalFound=0 for companies that do not exist, so this does NOT confirm the account. Left enabled: an empty fetch costs one request and cannot close jobs (the last-seen sweep is disarmed at fetchedCount=0). Confirm via the careers page before relying on it.",
  },
  {
    // REVERIFIED 2026-07-10: 0 postings.
    companySlug: "kpmg-india",
    providerName: "smartrecruiters",
    providerId: "KPMGIndia",
    enabled: true,
    note: "UNVERIFIABLE 2026-09-14 — 0 postings. SmartRecruiters returns 200/totalFound=0 for companies that do not exist, so this does NOT confirm the account. Left enabled: an empty fetch costs one request and cannot close jobs (the last-seen sweep is disarmed at fetchedCount=0). Confirm via the careers page before relying on it.",
  },
  {
    // REVERIFIED 2026-07-10: 0 postings.
    companySlug: "nielsen",
    providerName: "smartrecruiters",
    providerId: "Nielsen",
    enabled: true,
    note: "UNVERIFIABLE 2026-09-14 — 0 postings. SmartRecruiters returns 200/totalFound=0 for companies that do not exist, so this does NOT confirm the account. Left enabled: an empty fetch costs one request and cannot close jobs (the last-seen sweep is disarmed at fetchedCount=0). Confirm via the careers page before relying on it.",
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
    extra: {
      wd: "wd5",
      board: "external_experienced_careers",
      tenant: "adobe",
    },
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
    note: "Adzuna India API — 8 fresher/intern queries, 3 pages each, capped by ADZUNA_MAX_REQUESTS (default 40). Needs ADZUNA_APP_ID and ADZUNA_APP_KEY. NOT verifiable in the 2026-09-14 audit: no keys were available in that environment, so no status is claimed.",
  },
  {
    companySlug: "__jsearch__",
    providerName: "jsearch",
    providerId: "google-jobs-india",
    enabled: true,
    note: "JSearch/Google Jobs — 8 fresher/intern India queries, 2 pages each, capped by JSEARCH_MAX_REQUESTS (default 20). Needs JSEARCH_API_KEY. NOT verifiable in the 2026-09-14 audit: no key was available in that environment, so no status is claimed.",
  },

  // ─── Phase 5.5(C): free public job APIs, no key required ───────────────────

  {
    // VERIFIED 2026-09-14: geo=anywhere&industry=dev returned 46 postings,
    // 12 of them entry-level/junior. Jobicy has no India geography at all
    // (?geo=india returns nothing), so "anywhere" — roles open to applicants
    // worldwide — is the slice an India-based applicant can actually use.
    companySlug: "__jobicy__",
    providerName: "jobicy",
    providerId: "anywhere",
    enabled: true,
    extra: { industry: "dev" },
    note: "VERIFIED 2026-09-14 — 46 live postings on jobicy.com/api/v2/remote-jobs?geo=anywhere&industry=dev, 12 entry-level/junior. Free, no key. geo=india returns nothing, so 'anywhere' is the usable slice.",
  },

  {
    // Endpoint VERIFIED HEALTHY 2026-09-14 — and deliberately left OFF.
    // www.arbeitnow.com/api/job-board-api returned HTTP 200 with 250 postings
    // on page one. Of those 250: ZERO matched any Indian city or "India", and
    // all 9 flagged remote were German-language roles at German employers
    // ("Homeoffice", "(m/w/d)"), i.e. remote within Germany.
    //
    // Enabling this would add hundreds of inapplicable postings and bury the
    // relevant ones. The provider is implemented and registered so this is a
    // one-line change if coverage ever widens — see providers/arbeitnow/.
    companySlug: "__arbeitnow__",
    providerName: "arbeitnow",
    providerId: "all",
    enabled: false,
    extra: { remoteOnly: true },
    note: "Endpoint HEALTHY 2026-09-14 — HTTP 200, 250 postings/page — but 0 India matches and all 9 remote roles were Germany-based and German-language. Disabled as noise, not as breakage. Re-measure before enabling.",
  },
];

/** Returns only enabled configurations. */
export function getEnabledConfigs(): CompanyProviderConfig[] {
  return ALL_CONFIGS.filter((c) => c.enabled !== false).map(
    ({ enabled: _e, note: _n, ...rest }) => rest,
  );
}

/** Returns all configurations including disabled ones (used by GET /providers). */
export function getAllConfigs(): EnabledConfig[] {
  return ALL_CONFIGS;
}
