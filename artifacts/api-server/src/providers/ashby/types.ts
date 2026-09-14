/**
 * Ashby public Job Board API response shapes.
 *
 * Endpoint: GET https://api.ashbyhq.com/posting-api/job-board/{jobBoardName}
 *
 * Shapes below were read off live responses from the `linear`, `posthog` and
 * `ycombinator` boards on 2026-09-14, not from documentation — the previous
 * types in this file described the retired POST /posting-public/jobs endpoint
 * and had a different envelope (`results` rather than `jobs`).
 */

/** `{ postalAddress: { addressCountry: "India", ... } }` — every field optional in practice. */
export interface AshbyAddress {
  postalAddress?: {
    addressCountry?: string;
    addressRegion?: string;
    addressLocality?: string;
  };
}

/**
 * An additional location a posting is open in. Boards commonly list one
 * headline `location` and several of these, so a posting open in Bengaluru can
 * carry "San Francisco" as its primary string.
 */
export interface AshbySecondaryLocation {
  location?: string;
  address?: AshbyAddress;
}

export interface AshbyJobPosting {
  id: string;
  title: string;
  department?: string;
  team?: string;
  /** Free text, e.g. "Bengaluru", "Remote (EMEA)", "San Francisco, CA". */
  location?: string;
  secondaryLocations?: AshbySecondaryLocation[];
  address?: AshbyAddress;
  isRemote?: boolean;
  /** "Remote" | "Hybrid" | "Onsite" — more reliable than parsing `location`. */
  workplaceType?: string;
  employmentType?: string;
  /** False for postings the board hides; we never ingest those. */
  isListed?: boolean;
  compensation?: {
    summaryComponents?: Array<{
      summary?: string;
      componentType?: string;
      interval?: string;
      minValue?: number;
      maxValue?: number;
      currencyCode?: string;
    }>;
  };
  descriptionHtml?: string;
  descriptionPlain?: string;
  jobUrl: string;
  applyUrl?: string;
  publishedAt?: string;
}

export interface AshbyJobBoardResponse {
  jobs: AshbyJobPosting[];
  apiVersion?: string;
}
