/**
 * CareerRadar Company Catalog
 * ────────────────────────────
 * Single source of truth for every company tracked by CareerRadar.
 *
 * DESIGN PRINCIPLE
 * ─────────────────
 * Adding a new company requires only a new entry in COMPANY_CATALOG below.
 * No code changes are needed. The catalog drives:
 *   • GET /api/companies/catalog          — full catalog browser
 *   • GET /api/companies/catalog/provider — filtered by ATS provider
 *   • GET /api/companies/catalog/search   — full-text search
 *
 * ADDING A NEW COMPANY — CHECKLIST
 * ──────────────────────────────────
 * 1. Identify the company's ATS from its careers page URL:
 *      boards.greenhouse.io/<token>              → provider: "greenhouse"
 *      jobs.lever.co/<slug>                      → provider: "lever"
 *      jobs.ashbyhq.com/<org>                    → provider: "ashby"
 *      careers.smartrecruiters.com/<CompanyId>   → provider: "smartrecruiters"
 *      <company>.wd1.myworkdayjobs.com           → provider: "workday"  (not yet live)
 *      (anything else)                           → provider: "custom"
 *
 * 2. Verify the public API token with a quick curl (see config.ts header).
 *
 * 3. Add an entry to COMPANY_CATALOG with:
 *      - verificationStatus: "verified"   if the token/slug is confirmed working
 *      - verificationStatus: "unverified" if you haven't tested it yet
 *      - verificationStatus: "disabled"   if the company no longer uses this ATS
 *
 * 4. To activate live job fetching, also add an entry in config.ts with
 *    enabled: true once the token is verified.
 *
 * FIELD REFERENCE
 * ────────────────
 *   slug             — unique ID matching companiesTable.slug in the DB
 *   name             — human-readable company name
 *   provider         — ATS identifier (see above)
 *   providerId       — provider-specific token/slug/ID
 *   careerUrl        — canonical public careers page URL
 *   industry         — broad sector (e.g. "Technology", "Fintech")
 *   hiringCategory   — recruitment focus ("fresher", "experienced", "both")
 *   expectedRoles    — sample roles this company typically posts
 *   country          — primary country of this company's hiring
 *   isActive         — does this company actively hire? (false = paused/shutdown)
 *   verificationStatus — "verified" = API tested; "unverified" = untested; "disabled" = wrong ATS
 *   note             — any extra context for future maintainers
 */

export type ProviderName =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workday"
  | "custom"
  | "unknown";

export type HiringCategory = "fresher" | "experienced" | "both";

export type VerificationStatus = "verified" | "unverified" | "disabled";

export interface CatalogEntry {
  slug: string;
  name: string;

  provider: ProviderName;
  providerId: string;
  careerUrl: string;

  industry: string;
  hiringCategory: HiringCategory;
  expectedRoles: string[];
  country: string;

  isActive: boolean;
  verificationStatus: VerificationStatus;
  note?: string;
}

export const COMPANY_CATALOG: CatalogEntry[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // GREENHOUSE — boards.greenhouse.io/<providerId>
  // ═══════════════════════════════════════════════════════════════════════════

  {
    slug: "atlassian",
    name: "Atlassian",
    provider: "greenhouse",
    providerId: "atlassian",
    careerUrl: "https://boards.greenhouse.io/atlassian",
    industry: "Technology",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "SRE", "Product Manager", "Data Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "BROKEN 2025-06-27: boards.greenhouse.io/atlassian returns 404. Atlassian migrated to Workday (atlassian.wd5.myworkdayjobs.com). See Workday section.",
  },
  {
    slug: "adobe",
    name: "Adobe",
    provider: "greenhouse",
    providerId: "adobe",
    careerUrl: "https://boards.greenhouse.io/adobe",
    industry: "Technology",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Research Scientist", "Data Scientist", "UX Designer"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "BROKEN 2025-06-27: boards.greenhouse.io/adobe returns 404. Adobe migrated away from Greenhouse. Likely Workday (adobe.wd5.myworkdayjobs.com).",
  },
  {
    slug: "postman",
    name: "Postman",
    provider: "greenhouse",
    providerId: "postman",
    careerUrl: "https://boards.greenhouse.io/postman",
    industry: "Developer Tools",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Backend Engineer", "Frontend Engineer", "DevRel"],
    country: "India",
    isActive: true,
    verificationStatus: "verified",
    note: "VERIFIED 2025-06-27: 120 live jobs on boards-api.greenhouse.io/postman. Bengaluru HQ.",
  },
  {
    slug: "browserstack",
    name: "BrowserStack",
    provider: "greenhouse",
    providerId: "browserstack",
    careerUrl: "https://boards.greenhouse.io/browserstack",
    industry: "Developer Tools",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "QA Engineer", "Solutions Engineer", "DevOps"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "BROKEN 2025-06-27: boards.greenhouse.io/browserstack returns 404. Reverify BrowserStack's current ATS.",
  },
  {
    slug: "thoughtworks",
    name: "ThoughtWorks",
    provider: "greenhouse",
    providerId: "thoughtworks",
    careerUrl: "https://boards.greenhouse.io/thoughtworks",
    industry: "Consulting",
    hiringCategory: "both",
    expectedRoles: ["Graduate Consultant", "Software Developer", "QA Consultant", "Data Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "verified",
    note: "VERIFIED 2025-06-27: 77 live jobs on boards-api.greenhouse.io/thoughtworks. Offices in Chennai, Bengaluru, Pune, Hyderabad.",
  },
  {
    slug: "freshworks",
    name: "Freshworks",
    provider: "greenhouse",
    providerId: "freshworks",
    careerUrl: "https://boards.greenhouse.io/freshworks",
    industry: "SaaS / CRM",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Product Manager", "Data Scientist", "Sales Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "BROKEN 2025-06-27: boards.greenhouse.io/freshworks returns 404. Freshworks likely migrated ATS. Reverify.",
  },
  {
    slug: "nutanix",
    name: "Nutanix",
    provider: "greenhouse",
    providerId: "nutanix",
    careerUrl: "https://boards.greenhouse.io/nutanix",
    industry: "Cloud Infrastructure",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "SRE", "Technical Support Engineer", "Solutions Architect"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "BROKEN 2025-06-27: boards.greenhouse.io/nutanix returns 404. Nutanix now on Workday (nutanix.wd5.myworkdayjobs.com — auth required).",
  },
  {
    slug: "rubrik",
    name: "Rubrik",
    provider: "greenhouse",
    providerId: "rubrik",
    careerUrl: "https://boards.greenhouse.io/rubrik",
    industry: "Cloud Security",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "Security Engineer", "Solutions Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "verified",
    note: "VERIFIED 2025-06-27: 105 live jobs on boards-api.greenhouse.io/rubrik. Bengaluru engineering center.",
  },
  {
    slug: "cohesity",
    name: "Cohesity",
    provider: "greenhouse",
    providerId: "cohesity",
    careerUrl: "https://boards.greenhouse.io/cohesity",
    industry: "Cloud Infrastructure",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "QA Engineer", "Cloud Architect"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Large R&D center in Pune and Bengaluru.",
  },
  {
    slug: "sap-labs",
    name: "SAP Labs India",
    provider: "greenhouse",
    providerId: "saplabs",
    careerUrl: "https://boards.greenhouse.io/saplabs",
    industry: "Enterprise Software",
    hiringCategory: "both",
    expectedRoles: ["Software Developer", "Cloud Engineer", "Data Scientist", "UX Designer"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru Labs — one of SAP's largest development centers globally.",
  },
  {
    slug: "vmware",
    name: "VMware (Broadcom)",
    provider: "greenhouse",
    providerId: "vmware",
    careerUrl: "https://boards.greenhouse.io/vmware",
    industry: "Cloud / Virtualization",
    hiringCategory: "both",
    expectedRoles: ["Member of Technical Staff", "SRE", "QA Engineer", "Product Manager"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru and Pune engineering centers. Now part of Broadcom.",
  },
  {
    slug: "publicis-sapient",
    name: "Publicis Sapient",
    provider: "greenhouse",
    providerId: "publicissapient",
    careerUrl: "https://boards.greenhouse.io/publicissapient",
    industry: "Consulting / Digital",
    hiringCategory: "fresher",
    expectedRoles: ["Associate Technology L1", "Associate Business Analyst", "Trainee"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Large annual fresher batch under SPEED program. Multiple India offices.",
  },
  {
    slug: "cloudera",
    name: "Cloudera",
    provider: "greenhouse",
    providerId: "cloudera",
    careerUrl: "https://boards.greenhouse.io/cloudera",
    industry: "Big Data / Analytics",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "Data Engineer", "Cloud Engineer", "Field Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru center focused on Hadoop/CDP engineering.",
  },
  {
    slug: "informatica",
    name: "Informatica",
    provider: "greenhouse",
    providerId: "informatica",
    careerUrl: "https://boards.greenhouse.io/informatica",
    industry: "Data Integration",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Cloud Engineer", "QA Engineer", "Data Architect"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Hyderabad and Bengaluru offices. Data cloud and integration platform.",
  },
  {
    slug: "veritas",
    name: "Veritas Technologies",
    provider: "greenhouse",
    providerId: "veritas",
    careerUrl: "https://boards.greenhouse.io/veritas",
    industry: "Data Management",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "QA Engineer", "Technical Writer", "SRE"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Pune engineering center. Backup and data management software.",
  },
  {
    slug: "mphasis",
    name: "Mphasis",
    provider: "greenhouse",
    providerId: "mphasis",
    careerUrl: "https://boards.greenhouse.io/mphasis",
    industry: "IT Services",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Cloud Engineer", "AI/ML Engineer", "Business Analyst"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru HQ. HP subsidiary with strong cloud and AI practice.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVER — api.lever.co/v0/postings/<providerId>
  // ═══════════════════════════════════════════════════════════════════════════

  {
    slug: "razorpay",
    name: "Razorpay",
    provider: "lever",
    providerId: "razorpay",
    careerUrl: "https://jobs.lever.co/razorpay",
    industry: "Fintech",
    hiringCategory: "both",
    expectedRoles: ["SDE", "Product Manager", "Data Engineer", "Solutions Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "BROKEN 2025-06-27: api.lever.co/v0/postings/razorpay returns 404. Razorpay may have migrated ATS. Check jobs.razorpay.com directly.",
  },
  {
    slug: "meesho",
    name: "Meesho",
    provider: "lever",
    providerId: "meesho",
    careerUrl: "https://jobs.lever.co/meesho",
    industry: "E-Commerce",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Data Scientist", "Product Manager", "SRE"],
    country: "India",
    isActive: true,
    verificationStatus: "verified",
    note: "VERIFIED 2025-06-27: Live postings on api.lever.co/v0/postings/meesho. Bengaluru social commerce unicorn.",
  },
  {
    slug: "cred",
    name: "CRED",
    provider: "lever",
    providerId: "cred",
    careerUrl: "https://jobs.lever.co/cred",
    industry: "Fintech",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "Product Designer", "Data Scientist", "Backend Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "verified",
    note: "VERIFIED 2025-06-27: Live postings on api.lever.co/v0/postings/cred. Bengaluru fintech unicorn.",
  },
  {
    slug: "groww",
    name: "Groww",
    provider: "lever",
    providerId: "groww",
    careerUrl: "https://jobs.lever.co/groww",
    industry: "Fintech / Wealth Management",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Product Manager", "Data Engineer", "QA Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru fintech unicorn. Retail stock & mutual fund investing platform.",
  },
  {
    slug: "zepto",
    name: "Zepto",
    provider: "lever",
    providerId: "zepto",
    careerUrl: "https://jobs.lever.co/zepto",
    industry: "Quick Commerce",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Product Manager", "Data Scientist", "Operations Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Mumbai-based 10-minute grocery delivery unicorn. Rapid growth phase.",
  },
  {
    slug: "smallcase",
    name: "Smallcase Technologies",
    provider: "lever",
    providerId: "smallcase",
    careerUrl: "https://jobs.lever.co/smallcase",
    industry: "Fintech / Wealthtech",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Frontend Engineer", "Data Analyst", "Product Manager"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru wealthtech startup. Modern portfolio investing platform.",
  },
  {
    slug: "slice",
    name: "Slice",
    provider: "lever",
    providerId: "sliceit",
    careerUrl: "https://jobs.lever.co/sliceit",
    industry: "Fintech / Neo-banking",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Backend Engineer", "Product Manager", "Credit Risk Analyst"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru neo-banking startup with credit card product.",
  },
  {
    slug: "mpl",
    name: "Mobile Premier League (MPL)",
    provider: "lever",
    providerId: "mpl",
    careerUrl: "https://jobs.lever.co/mpl",
    industry: "Gaming / Esports",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Game Developer", "Data Scientist", "Product Manager"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru esports and gaming platform.",
  },
  {
    slug: "dream11",
    name: "Dream11 (Dream Sports)",
    provider: "lever",
    providerId: "dreamsports",
    careerUrl: "https://jobs.lever.co/dreamsports",
    industry: "Sports Tech / Fantasy Gaming",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "SRE", "Data Engineer", "Product Manager"],
    country: "India",
    isActive: true,
    verificationStatus: "verified",
    note: "VERIFIED 2025-06-27: Live postings on api.lever.co/v0/postings/dreamsports. Mumbai fantasy sports unicorn.",
  },
  {
    slug: "oyo",
    name: "OYO Rooms",
    provider: "lever",
    providerId: "oyo",
    careerUrl: "https://jobs.lever.co/oyo",
    industry: "Hospitality Tech",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Product Manager", "Data Analyst", "Revenue Manager"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Gurugram hospitality tech unicorn. Global operations.",
  },
  {
    slug: "lenskart",
    name: "Lenskart",
    provider: "lever",
    providerId: "lenskart",
    careerUrl: "https://jobs.lever.co/lenskart",
    industry: "D2C Eyewear",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Data Scientist", "Product Manager", "ML Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Faridabad D2C eyewear brand with strong tech team.",
  },
  {
    slug: "niyo",
    name: "Niyo Solutions",
    provider: "lever",
    providerId: "niyo",
    careerUrl: "https://jobs.lever.co/niyo",
    industry: "Fintech / Neo-banking",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Mobile Developer", "Product Manager", "Data Analyst"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru neo-bank focused on salaried workers and international students.",
  },
  {
    slug: "unacademy",
    name: "Unacademy",
    provider: "lever",
    providerId: "unacademy",
    careerUrl: "https://jobs.lever.co/unacademy",
    industry: "EdTech",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Product Manager", "Data Scientist", "Educator Partnerships"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru edtech unicorn. Online test preparation platform.",
  },
  {
    slug: "physicswallah",
    name: "PhysicsWallah",
    provider: "lever",
    providerId: "physicswallah",
    careerUrl: "https://jobs.lever.co/physicswallah",
    industry: "EdTech",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Frontend Developer", "Data Engineer", "Content Manager"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Noida edtech unicorn. Affordable online and offline education.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ASHBY — api.ashbyhq.com/posting-public/jobs
  //         organizationHostedJobsPageName = providerId
  // ═══════════════════════════════════════════════════════════════════════════

  {
    slug: "linear",
    name: "Linear",
    provider: "ashby",
    providerId: "linear",
    careerUrl: "https://jobs.ashbyhq.com/linear",
    industry: "Developer Tools",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "Product Designer", "Engineering Manager"],
    country: "Remote",
    isActive: true,
    verificationStatus: "unverified",
    note: "Fully remote. Lean team, high bar. Issue tracking for modern software teams.",
  },
  {
    slug: "retool",
    name: "Retool",
    provider: "ashby",
    providerId: "retool",
    careerUrl: "https://jobs.ashbyhq.com/retool",
    industry: "Developer Tools / Low-Code",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "Solutions Engineer", "Product Manager"],
    country: "Remote",
    isActive: true,
    verificationStatus: "unverified",
    note: "Remote-friendly. Build internal tools fast. Strong India engineering community.",
  },
  {
    slug: "cal",
    name: "Cal.com",
    provider: "ashby",
    providerId: "cal",
    careerUrl: "https://jobs.ashbyhq.com/cal",
    industry: "Developer Tools / SaaS",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "Developer Advocate", "Product Manager"],
    country: "Remote",
    isActive: true,
    verificationStatus: "unverified",
    note: "Fully remote, open-source scheduling infrastructure.",
  },
  {
    slug: "posthog",
    name: "PostHog",
    provider: "ashby",
    providerId: "posthog",
    careerUrl: "https://jobs.ashbyhq.com/posthog",
    industry: "Product Analytics",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "Product Marketer", "Growth Engineer"],
    country: "Remote",
    isActive: true,
    verificationStatus: "unverified",
    note: "All-remote, open-source product analytics. Generous compensation.",
  },
  {
    slug: "hasura",
    name: "Hasura",
    provider: "ashby",
    providerId: "hasura",
    careerUrl: "https://jobs.ashbyhq.com/hasura",
    industry: "Developer Tools / GraphQL",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "SRE", "Technical Writer", "Developer Advocate"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru-founded GraphQL data access layer. Remote-first.",
  },
  {
    slug: "chargebee",
    name: "Chargebee",
    provider: "ashby",
    providerId: "chargebee",
    careerUrl: "https://jobs.ashbyhq.com/chargebee",
    industry: "SaaS / Billing",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Product Manager", "Data Engineer", "Solutions Architect"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Chennai-founded subscription billing SaaS. Large India team.",
  },
  {
    slug: "darwinbox",
    name: "Darwinbox",
    provider: "ashby",
    providerId: "darwinbox",
    careerUrl: "https://jobs.ashbyhq.com/darwinbox",
    industry: "HRTech / SaaS",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Product Manager", "Customer Success", "Data Analyst"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Hyderabad HR-tech unicorn. Cloud HCM platform for enterprises.",
  },
  {
    slug: "100ms",
    name: "100ms",
    provider: "ashby",
    providerId: "100ms",
    careerUrl: "https://jobs.ashbyhq.com/100ms",
    industry: "Video Infrastructure",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "Infra Engineer", "WebRTC Engineer", "Developer Advocate"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru video SDK startup. Used by Clubhouse, Discord-scale apps.",
  },
  {
    slug: "setu",
    name: "Setu (by Pine Labs)",
    provider: "ashby",
    providerId: "setu",
    careerUrl: "https://jobs.ashbyhq.com/setu",
    industry: "Fintech Infrastructure",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Product Manager", "Integration Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru fintech API infrastructure. Acquired by Pine Labs.",
  },
  {
    slug: "dukaan",
    name: "Dukaan",
    provider: "ashby",
    providerId: "dukaan",
    careerUrl: "https://jobs.ashbyhq.com/dukaan",
    industry: "E-Commerce / D2C",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Mobile Developer", "Product Manager", "Growth Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru D2C commerce platform. No-code online store builder.",
  },
  {
    slug: "leadsquared",
    name: "LeadSquared",
    provider: "ashby",
    providerId: "leadsquared",
    careerUrl: "https://jobs.ashbyhq.com/leadsquared",
    industry: "SaaS / CRM",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Product Manager", "Data Engineer", "Solutions Consultant"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru CRM and marketing automation SaaS.",
  },
  {
    slug: "vercel",
    name: "Vercel",
    provider: "ashby",
    providerId: "vercel",
    careerUrl: "https://jobs.ashbyhq.com/vercel",
    industry: "Developer Tools / Cloud",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "Developer Relations", "Solutions Engineer"],
    country: "Remote",
    isActive: true,
    verificationStatus: "unverified",
    note: "Fully remote. Frontend cloud platform. High-bar hiring.",
  },
  {
    slug: "ycombinator",
    name: "Y Combinator",
    provider: "ashby",
    providerId: "ycombinator",
    careerUrl: "https://jobs.ashbyhq.com/ycombinator",
    industry: "Venture Capital",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "Product Manager", "Program Manager"],
    country: "Remote",
    isActive: true,
    verificationStatus: "unverified",
    note: "YC internal team hiring. Small, high-impact roles.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SMARTRECRUITERS — api.smartrecruiters.com/v1/companies/<providerId>/postings
  // ═══════════════════════════════════════════════════════════════════════════

  {
    slug: "delhivery",
    name: "Delhivery",
    provider: "smartrecruiters",
    providerId: "Delhivery",
    careerUrl: "https://careers.smartrecruiters.com/Delhivery",
    industry: "Logistics / Supply Chain",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Data Scientist", "Product Manager", "Operations Analyst"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Gurugram logistics unicorn. Largest tech-enabled logistics network in India.",
  },
  {
    slug: "juspay",
    name: "Juspay Technologies",
    provider: "smartrecruiters",
    providerId: "Juspay",
    careerUrl: "https://careers.smartrecruiters.com/Juspay",
    industry: "Fintech / Payments",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Haskell Developer", "Mobile Developer", "SRE"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru payments infra. Powers UPI payments for Amazon, Jio, IRCTC.",
  },
  {
    slug: "inmobi",
    name: "InMobi",
    provider: "smartrecruiters",
    providerId: "InMobi",
    careerUrl: "https://careers.smartrecruiters.com/InMobi",
    industry: "AdTech / Mobile",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Data Scientist", "Product Manager", "ML Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru mobile advertising unicorn. First Indian tech unicorn.",
  },
  {
    slug: "ola",
    name: "Ola (ANI Technologies)",
    provider: "smartrecruiters",
    providerId: "Ola",
    careerUrl: "https://careers.smartrecruiters.com/Ola",
    industry: "Mobility Tech",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Data Scientist", "Product Manager", "Android Developer"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru ride-hailing and EV company (Ola Electric). Note case-sensitive ID.",
  },
  {
    slug: "mphasis-sr",
    name: "Mphasis (SmartRecruiters)",
    provider: "smartrecruiters",
    providerId: "Mphasis",
    careerUrl: "https://careers.smartrecruiters.com/Mphasis",
    industry: "IT Services",
    hiringCategory: "fresher",
    expectedRoles: ["Associate Engineer", "Trainee", "Business Analyst Trainee"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Fresher batch hiring via SmartRecruiters. Different from Greenhouse listing.",
  },
  {
    slug: "zs-associates",
    name: "ZS Associates",
    provider: "smartrecruiters",
    providerId: "ZSAssociates",
    careerUrl: "https://careers.smartrecruiters.com/ZSAssociates",
    industry: "Consulting / Life Sciences",
    hiringCategory: "both",
    expectedRoles: ["Business Technology Analyst", "Decision Analytics Associate", "Software Engineer"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Pune and Gurugram offices. Analytics consulting for pharma and healthcare.",
  },
  {
    slug: "kpmg-india",
    name: "KPMG India",
    provider: "smartrecruiters",
    providerId: "KPMGIndia",
    careerUrl: "https://careers.smartrecruiters.com/KPMGIndia",
    industry: "Consulting / Big 4",
    hiringCategory: "both",
    expectedRoles: ["Technology Analyst", "Data & Analytics Consultant", "Cyber Security Analyst"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Multiple India offices. Big 4 professional services firm.",
  },
  {
    slug: "nielsen",
    name: "Nielsen",
    provider: "smartrecruiters",
    providerId: "Nielsen",
    careerUrl: "https://careers.smartrecruiters.com/Nielsen",
    industry: "Market Research / Analytics",
    hiringCategory: "both",
    expectedRoles: ["Data Analyst", "Software Engineer", "Business Analyst", "Research Scientist"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Mumbai and Bengaluru offices. Global measurement and analytics company.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKDAY — <company>.wd1.myworkdayjobs.com  (provider not yet live)
  // These entries document known Workday ATS users for future implementation.
  // ═══════════════════════════════════════════════════════════════════════════

  {
    slug: "google",
    name: "Google India",
    provider: "workday",
    providerId: "google",
    careerUrl: "https://careers.google.com",
    industry: "Technology",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer L3", "Software Engineer (New Grad)", "Research Scientist", "SRE"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "Google uses custom ATS (not Workday). Workday provider pending implementation. Seed data covers manually curated roles.",
  },
  {
    slug: "microsoft",
    name: "Microsoft India",
    provider: "workday",
    providerId: "microsoft",
    careerUrl: "https://careers.microsoft.com",
    industry: "Technology",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Program Manager", "Data Scientist", "Cloud Solution Architect"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "Microsoft uses custom ATS. Hyderabad and Bengaluru campuses. Pending dedicated provider.",
  },
  {
    slug: "amazon",
    name: "Amazon India",
    provider: "workday",
    providerId: "amazon",
    careerUrl: "https://amazon.jobs",
    industry: "E-Commerce / Cloud",
    hiringCategory: "both",
    expectedRoles: ["SDE I", "SDE II", "Business Analyst", "Applied Scientist", "TPM"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "Amazon uses its own ATS (amazon.jobs). Hyderabad and Bengaluru. Pending provider.",
  },
  {
    slug: "meta",
    name: "Meta (Facebook)",
    provider: "workday",
    providerId: "meta",
    careerUrl: "https://metacareers.com",
    industry: "Social Media / Technology",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Research Scientist", "Data Engineer", "Product Manager"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "Meta uses custom ATS. Limited India office presence. Pending provider.",
  },
  {
    slug: "apple",
    name: "Apple India",
    provider: "workday",
    providerId: "apple",
    careerUrl: "https://jobs.apple.com",
    industry: "Technology / Consumer Electronics",
    hiringCategory: "experienced",
    expectedRoles: ["Software Engineer", "Hardware Engineer", "UX Designer", "Supply Chain Manager"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "Apple uses Workday ATS. Small but growing India team. Hyderabad Maps center.",
  },
  {
    slug: "ibm",
    name: "IBM India",
    provider: "workday",
    providerId: "ibm",
    careerUrl: "https://ibm.com/careers",
    industry: "Technology / Consulting",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Cloud Consultant", "Data Scientist", "Security Analyst"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "IBM uses Workday. Large India presence — Bengaluru, Pune, Delhi, Hyderabad.",
  },
  {
    slug: "accenture",
    name: "Accenture India",
    provider: "workday",
    providerId: "accenture",
    careerUrl: "https://accenture.com/careers",
    industry: "Consulting / IT Services",
    hiringCategory: "fresher",
    expectedRoles: ["ASE (Associate Software Engineer)", "Technology Analyst", "Packaged App Associate"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "Accenture uses Workday. Largest India fresher recruiter. ASE program annually.",
  },
  {
    slug: "tcs",
    name: "Tata Consultancy Services",
    provider: "workday",
    providerId: "tcs",
    careerUrl: "https://ibegin.tcs.com",
    industry: "IT Services",
    hiringCategory: "fresher",
    expectedRoles: ["System Engineer", "IT Analyst", "Digital Trainee"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "TCS uses its own iBegin portal. Largest fresher recruiter in India. Pending custom provider.",
  },
  {
    slug: "infosys",
    name: "Infosys",
    provider: "workday",
    providerId: "infosys",
    careerUrl: "https://career.infosys.com",
    industry: "IT Services",
    hiringCategory: "fresher",
    expectedRoles: ["Systems Engineer", "Digital Specialist Engineer", "Associate"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "Infosys uses its own InfyTQ/career portal. Pending custom provider.",
  },
  {
    slug: "wipro",
    name: "Wipro",
    provider: "workday",
    providerId: "wipro",
    careerUrl: "https://careers.wipro.com",
    industry: "IT Services",
    hiringCategory: "fresher",
    expectedRoles: ["Project Engineer", "Analyst", "Associate Consultant"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "Wipro uses its own careers portal. ELITE/WILP fresher programs. Pending custom provider.",
  },
  {
    slug: "hcl",
    name: "HCLTech",
    provider: "workday",
    providerId: "hcltech",
    careerUrl: "https://hcltech.com/careers",
    industry: "IT Services",
    hiringCategory: "fresher",
    expectedRoles: ["Graduate Engineer Trainee", "Software Engineer", "Associate"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "HCLTech uses Workday. Noida HQ. Large fresher intake via TechBee program.",
  },
  {
    slug: "cognizant",
    name: "Cognizant",
    provider: "workday",
    providerId: "cognizant",
    careerUrl: "https://careers.cognizant.com",
    industry: "IT Services",
    hiringCategory: "fresher",
    expectedRoles: ["Programmer Analyst Trainee", "Associate", "Junior Associate"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "Cognizant uses Workday. Chennai HQ. CognizAnt fresher hiring program.",
  },
  {
    slug: "capgemini",
    name: "Capgemini India",
    provider: "workday",
    providerId: "capgemini",
    careerUrl: "https://capgemini.com/careers",
    industry: "Consulting / IT Services",
    hiringCategory: "fresher",
    expectedRoles: ["Analyst", "Senior Analyst", "Consultant", "Associate Consultant"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "Capgemini uses Workday. Mumbai HQ. InfraServices and digital transformation.",
  },
  {
    slug: "tech-mahindra",
    name: "Tech Mahindra",
    provider: "workday",
    providerId: "techmahindra",
    careerUrl: "https://careers.techmahindra.com",
    industry: "IT Services / Telecom",
    hiringCategory: "fresher",
    expectedRoles: ["Software Engineer", "Associate Software Engineer", "Technical Lead"],
    country: "India",
    isActive: true,
    verificationStatus: "disabled",
    note: "Pune HQ. Tech Mahindra uses Workday. Strong telecom and 5G practice.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOM / UNKNOWN ATS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    slug: "flipkart",
    name: "Flipkart",
    provider: "custom",
    providerId: "flipkart",
    careerUrl: "https://flipkartcareers.com",
    industry: "E-Commerce",
    hiringCategory: "both",
    expectedRoles: ["SDE 1", "SDE 2", "Data Scientist", "Product Manager", "SDE Intern"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Flipkart uses a custom ATS. Manual scraping not supported. Seed data covers curated roles.",
  },
  {
    slug: "swiggy",
    name: "Swiggy",
    provider: "custom",
    providerId: "swiggy",
    careerUrl: "https://careers.swiggy.com",
    industry: "Food Delivery / Logistics",
    hiringCategory: "both",
    expectedRoles: ["SDE 1", "Backend Engineer", "Data Engineer", "Product Manager", "SRE"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Swiggy uses Workday but candidate-facing portal is custom. Pending provider.",
  },
  {
    slug: "zomato",
    name: "Zomato",
    provider: "custom",
    providerId: "zomato",
    careerUrl: "https://careers.zomato.com",
    industry: "Food Delivery / Restaurant Tech",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Frontend Engineer", "Data Scientist", "Product Manager"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Zomato uses a custom careers portal. Gurugram HQ. Pending dedicated provider.",
  },
  {
    slug: "byjus",
    name: "BYJU'S (Think & Learn)",
    provider: "custom",
    providerId: "byjus",
    careerUrl: "https://byjus.com/jobs",
    industry: "EdTech",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Business Development Associate", "Data Analyst"],
    country: "India",
    isActive: false,
    verificationStatus: "disabled",
    note: "BYJU'S is currently under NCLT proceedings. Hiring paused. Monitor for resumption.",
  },
  {
    slug: "paytm",
    name: "Paytm (One97 Communications)",
    provider: "custom",
    providerId: "paytm",
    careerUrl: "https://paytm.com/about-us/career",
    industry: "Fintech / Payments",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Product Manager", "Data Scientist", "Risk Analyst"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Noida fintech. Custom ATS. Post-RBI action, hiring is more selective.",
  },
  {
    slug: "phonepe",
    name: "PhonePe",
    provider: "custom",
    providerId: "phonepe",
    careerUrl: "https://phonepe.com/en-in/careers",
    industry: "Fintech / UPI",
    hiringCategory: "both",
    expectedRoles: ["SDE", "Data Engineer", "ML Engineer", "Product Manager"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Bengaluru-based UPI leader. Spun off from Walmart India. Custom ATS.",
  },
  {
    slug: "nykaa",
    name: "Nykaa",
    provider: "custom",
    providerId: "nykaa",
    careerUrl: "https://jobs.nykaa.com",
    industry: "Beauty / D2C E-commerce",
    hiringCategory: "both",
    expectedRoles: ["Software Engineer", "Data Analyst", "Product Manager", "Category Manager"],
    country: "India",
    isActive: true,
    verificationStatus: "unverified",
    note: "Mumbai D2C beauty unicorn. Custom ATS. Strong data and product teams.",
  },
];

/**
 * Returns all catalog entries, optionally filtered.
 */
export function getCatalog(opts?: {
  provider?: ProviderName;
  isActive?: boolean;
  verificationStatus?: VerificationStatus;
}): CatalogEntry[] {
  let entries = COMPANY_CATALOG;

  if (opts?.provider !== undefined) {
    entries = entries.filter((e) => e.provider === opts.provider);
  }
  if (opts?.isActive !== undefined) {
    entries = entries.filter((e) => e.isActive === opts.isActive);
  }
  if (opts?.verificationStatus !== undefined) {
    entries = entries.filter((e) => e.verificationStatus === opts.verificationStatus);
  }

  return entries;
}

/**
 * Search catalog entries by name, industry, or expected roles.
 */
export function searchCatalog(query: string): CatalogEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return COMPANY_CATALOG;

  return COMPANY_CATALOG.filter((e) => {
    return (
      e.name.toLowerCase().includes(q) ||
      e.slug.toLowerCase().includes(q) ||
      e.industry.toLowerCase().includes(q) ||
      e.country.toLowerCase().includes(q) ||
      e.expectedRoles.some((r) => r.toLowerCase().includes(q)) ||
      (e.note?.toLowerCase().includes(q) ?? false)
    );
  });
}

/**
 * Returns all distinct provider names present in the catalog.
 */
export function getCatalogProviders(): ProviderName[] {
  return [...new Set(COMPANY_CATALOG.map((e) => e.provider))];
}

/**
 * Summary stats for the catalog.
 */
export function getCatalogStats() {
  const byProvider: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byCountry: Record<string, number> = {};

  for (const e of COMPANY_CATALOG) {
    byProvider[e.provider] = (byProvider[e.provider] ?? 0) + 1;
    byStatus[e.verificationStatus] = (byStatus[e.verificationStatus] ?? 0) + 1;
    byCountry[e.country] = (byCountry[e.country] ?? 0) + 1;
  }

  return {
    total: COMPANY_CATALOG.length,
    active: COMPANY_CATALOG.filter((e) => e.isActive).length,
    verified: COMPANY_CATALOG.filter((e) => e.verificationStatus === "verified").length,
    byProvider,
    byStatus,
    byCountry,
  };
}
