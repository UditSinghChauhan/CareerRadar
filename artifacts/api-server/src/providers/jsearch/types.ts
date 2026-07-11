/** JSearch (RapidAPI, Google Jobs index) response shapes. */

export interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name?: string;
  employer_logo?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_description?: string;
  job_apply_link?: string;
  job_posted_at_datetime_utc?: string;
  job_employment_type?: string;
  job_is_remote?: boolean;
  job_min_salary?: number;
  job_max_salary?: number;
}

export interface JSearchResponse {
  status?: string;
  data: {
    jobs: JSearchJob[];
  };
}
