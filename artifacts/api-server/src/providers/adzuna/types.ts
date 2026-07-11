/** Adzuna Job Search API response shapes (https://api.adzuna.com/v1/api/jobs/in/search). */

export interface AdzunaCategory {
  tag?: string;
  label?: string;
}

export interface AdzunaCompany {
  display_name?: string;
}

export interface AdzunaLocation {
  display_name?: string;
  area?: string[];
}

export interface AdzunaResult {
  id: string;
  title: string;
  description?: string;
  redirect_url: string;
  created?: string;
  company?: AdzunaCompany;
  location?: AdzunaLocation;
  category?: AdzunaCategory;
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
}

export interface AdzunaSearchResponse {
  results: AdzunaResult[];
  count: number;
}
