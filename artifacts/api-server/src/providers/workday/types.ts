/**
 * Workday CXS REST API — response types.
 *
 * Workday's internal CXS endpoint is not a documented public API.
 * It is the JSON backend for Workday-hosted careers pages.
 *
 * Endpoint (per tenant):
 *   POST https://{tenant}.wd{n}.myworkdayjobs.com/wday/cxs/{tenant}/{board}/jobs
 *   Body: { "limit": 20, "offset": 0, "searchText": "", "locations": [] }
 *
 * Access status (verified 2025-06-27):
 *   The endpoint returns HTTP 401 from non-browser environments due to
 *   Cloudflare/session-cookie requirements. A browser session token (CSRF +
 *   session cookie) is required for each request.
 *
 *   Until a legitimate public access path is confirmed (e.g. a Workday
 *   partner API), WorkdayProvider is registered with hasPublicApi = false.
 */

export interface WorkdayJobPosting {
  bulletFields: string[];
  externalPath: string;
  locationsText: string;
  postedOn: string;
  /** Internal Workday job ID (UUID). */
  bulletField1?: string;
  /** Title from the posting. */
  title: string;
  /** Requisition ID visible on the job board. */
  externalId?: string;
  /** Department / function. */
  jobFamilyGroup?: string;
  jobFamily?: string;
  /** Location detail. */
  primaryLocation?: string;
  workerType?: { id?: string; descriptor?: string };
  jobPostingLink?: string;
}

export interface WorkdayJobsResponse {
  jobPostings: WorkdayJobPosting[];
  total: number;
}

/** Per-company Workday configuration, passed via CompanyProviderConfig.extra. */
export interface WorkdayExtra {
  /** Workday datacenter number (1–5). E.g. "wd5". */
  wd: string;
  /** Job board name as it appears in the careers URL path. Case-sensitive. */
  board: string;
  /** Tenant identifier (usually the company slug in lowercase). */
  tenant: string;
}
