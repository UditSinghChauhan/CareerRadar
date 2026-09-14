/**
 * Arbeitnow public job-board API shapes.
 * Endpoint: GET https://www.arbeitnow.com/api/job-board-api
 * Free, no key. Shapes read off a live response on 2026-09-14.
 */

export interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  /** True for roles the board marks remote. Note: often means "Homeoffice" within Germany. */
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  /** Free text, e.g. "Onemedia Germany, Munich" or "Homeoffice". */
  location: string;
  /** Unix seconds. */
  created_at: number;
  description?: string;
}

export interface ArbeitnowResponse {
  data: ArbeitnowJob[];
  links?: { next?: string | null };
  meta?: { current_page?: number; per_page?: number };
}
