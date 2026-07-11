/** Remotive public API response shapes (https://remotive.com/api/remote-jobs). */

export interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo_url?: string;
  category?: string;
  /** Free-text region constraint, e.g. "USA Only", "Worldwide", "India". */
  candidate_required_location?: string;
  /** HTML description. */
  description?: string;
  publication_date?: string;
  salary?: string;
  job_type?: string;
}

export interface RemotiveResponse {
  "job-count"?: number;
  jobs: RemotiveJob[];
}
