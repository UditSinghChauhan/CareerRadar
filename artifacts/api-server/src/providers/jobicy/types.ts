/**
 * Jobicy public remote-jobs API shapes.
 * Endpoint: GET https://jobicy.com/api/v2/remote-jobs
 * Free, no key. Shapes read off a live response on 2026-09-14.
 *
 * Jobicy asks that it be credited with a link back to the source; every job we
 * ingest keeps its `url` as sourceUrl/applyUrl, which satisfies that.
 */

export interface JobicyJob {
  id: number;
  url: string;
  jobSlug: string;
  jobTitle: string;
  companyName: string;
  companyLogo?: string;
  jobIndustry?: string[];
  jobType?: string[];
  /** Free text, e.g. "Anywhere", "UK,  USA", "India". */
  jobGeo?: string;
  /** e.g. "Senior", "Entry-Level, Junior", "Any". */
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  /** e.g. "2026-09-10 11:22:33". */
  pubDate?: string;
}

export interface JobicyResponse {
  jobCount?: number;
  jobs: JobicyJob[];
}
