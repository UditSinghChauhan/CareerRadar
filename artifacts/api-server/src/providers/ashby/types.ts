/** Ashby public Posting API response shapes. */

export interface AshbyLocation {
  locationStr: string;
  isRemote: boolean;
}

export interface AshbyJobPosting {
  id: string;
  title: string;
  department: string;
  team?: string;
  locationName?: string;
  isRemote?: boolean;
  employmentType?: string;
  compensation?: {
    summaryComponents?: Array<{ type: string; minValue?: number; maxValue?: number; currency?: string }>;
  };
  descriptionHtml?: string;
  descriptionPlain?: string;
  jobUrl: string;
  applyUrl?: string;
  publishedAt?: string;
}

export interface AshbyPostingsResponse {
  results: AshbyJobPosting[];
  moreDataAvailable: boolean;
}
