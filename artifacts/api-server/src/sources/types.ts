/**
 * Source Management — Type Definitions
 * ──────────────────────────────────────
 * A "source" is one (company, provider) pair in the registry — e.g.
 * {postman, greenhouse} or {meesho, lever}.
 */

/**
 * Lifecycle status of a source.
 *
 * active        — enabled and successfully syncing
 * failing       — enabled but last sync returned an error
 * pending       — enabled but no sync has run yet
 * empty         — endpoint is reachable but company posted 0 jobs
 * disabled      — manually turned off; was previously working
 * broken        — endpoint returns 4xx (slug/token invalid or company migrated ATS)
 * auth-required — endpoint exists but requires authentication (Ashby API, Workday)
 * no-public-api — provider has no public REST API (Workday CXS)
 */
export type SourceStatus =
  | "active"
  | "failing"
  | "pending"
  | "empty"
  | "disabled"
  | "broken"
  | "auth-required"
  | "no-public-api";

/** Full source record — the single authoritative view of one (company, provider) pair. */
export interface SourceRecord {
  /** Stable composite ID: "{providerName}:{companySlug}" */
  id: string;

  /** Human-readable company name */
  name: string;

  companySlug: string;
  providerName: string;
  providerId: string;

  status: SourceStatus;
  enabled: boolean;

  /** Verification state from the catalog */
  verificationStatus: "verified" | "unverified" | "disabled";

  /** Timestamp of the most recent successful sync */
  lastSync: Date | null;

  /** Error message from the most recent failed sync */
  lastError: string | null;

  /** Total jobs currently in the DB for this company */
  jobsInDb: number;

  /** Jobs inserted across all syncs (from sync log totals) */
  jobsImported: number;

  /** Jobs inserted in the single most recent sync run */
  jobsLastRun: number;

  /** How often the scheduler runs this source */
  syncFrequency: string;

  /** Canonical public careers page URL */
  careerUrl: string;

  industry: string;

  /** Maintainer note from config (reason for disabled/broken state, etc.) */
  note?: string;
}

/** Aggregated health report returned by GET /api/sources/health */
export interface SourceHealth {
  generatedAt: Date;
  syncFrequency: string;

  totals: {
    configured: number;
    active: number;
    failing: number;
    pending: number;
    empty: number;
    disabled: number;
    broken: number;
    authRequired: number;
    noPublicApi: number;
  };

  active: SourceSummary[];
  failing: SourceSummary[];
  disabled: SourceSummary[];
  broken: SourceSummary[];
  authRequired: SourceSummary[];
  noPublicApi: SourceSummary[];

  /** All sources sorted by jobs contributed, descending */
  jobsPerSource: SourceSummary[];
}

/** Compact view used inside the health report lists */
export interface SourceSummary {
  id: string;
  name: string;
  companySlug: string;
  providerName: string;
  status: SourceStatus;
  lastSync: Date | null;
  jobsInDb: number;
  jobsImported: number;
  note?: string;
}
