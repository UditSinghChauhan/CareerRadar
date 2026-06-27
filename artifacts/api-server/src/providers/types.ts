/**
 * Core types shared across the entire provider engine.
 *
 * EXTENDING THE ENGINE
 * --------------------
 * 1. Add a new directory under providers/<name>/
 * 2. Implement AbstractProvider (extends BaseProvider)
 * 3. Export a default class that satisfies JobProvider
 * 4. Register it in registry.ts
 * 5. Add company configs in config.ts
 */

// ─── Raw output from a provider ───────────────────────────────────────────────

export interface ProviderJob {
  /** Provider-assigned unique identifier (e.g. Greenhouse job ID "12345"). */
  externalId: string;

  /** Slug of the provider, e.g. "greenhouse". Filled in by AbstractProvider. */
  sourceProvider: string;

  /** Slug of the company in our DB, e.g. "google". */
  companySlug: string;

  title: string;

  department?: string;
  location?: string;
  country?: string;

  /** Inferred from location/tags — default "onsite" if unknown. */
  workMode?: "remote" | "hybrid" | "onsite";

  /** "internship" | "full_time". Inferred from title/commitment field. */
  jobType?: "internship" | "full_time";

  description?: string;
  requirements?: string;

  /** Direct URL to the job posting page (used as a stable dedup key). */
  sourceUrl: string;

  /** Direct URL to the "Apply" button/form. May equal sourceUrl. */
  applyUrl?: string;

  postedDate?: Date;
  deadline?: Date;

  salaryMin?: number;
  salaryMax?: number;
  stipend?: number;
  currency?: string;

  eligibleBranches?: string[];
  eligibleBatch?: number[];
  requiredSkills?: string[];
  benefits?: string[];

  /** Raw text extracted from the posting (for future skill detection). */
  rawText?: string;
}

// ─── Company-level configuration for a provider ───────────────────────────────

export interface CompanyProviderConfig {
  /** Slug matching `companiesTable.slug`, e.g. "google". */
  companySlug: string;

  /** Which provider to use, e.g. "greenhouse". */
  providerName: string;

  /**
   * Provider-specific identifier for this company.
   * Greenhouse: board token (e.g. "google").
   * Lever: company URL slug (e.g. "lever").
   * Ashby: org name (e.g. "linear").
   * CompanyCareers: custom careers page URL.
   */
  providerId: string;

  /** Optional extra config passed to the provider at runtime. */
  extra?: Record<string, unknown>;
}

// ─── What a single provider run returns ───────────────────────────────────────

export interface FetchResult {
  companySlug: string;
  providerName: string;
  jobs: ProviderJob[];
  /** Total raw jobs returned by the source before filtering. */
  rawCount: number;
  /** Elapsed fetch time in ms. */
  durationMs: number;
  error?: string;
}

// ─── The interface every provider must implement ──────────────────────────────

export interface JobProvider {
  /** Unique slug for this provider, e.g. "greenhouse". */
  readonly name: string;

  /** Human-readable display name. */
  readonly displayName: string;

  /**
   * Whether this provider has a genuine public API (true) or is scaffolding
   * only (false). Scaffolding providers will log a warning and return [] until
   * implemented.
   */
  readonly hasPublicApi: boolean;

  /**
   * Fetch all open jobs for the given company config.
   * Implementations must NOT scrape sites that prohibit it in their ToS.
   */
  fetchJobs(config: CompanyProviderConfig): Promise<ProviderJob[]>;
}

// ─── Result of a full scheduler run ───────────────────────────────────────────

export interface SchedulerRunResult {
  startedAt: Date;
  finishedAt: Date;
  results: FetchResult[];
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
  totalSkipped: number;
  errors: number;
}

// ─── Deduplication result ─────────────────────────────────────────────────────

export type DedupeAction = "insert" | "update" | "skip";

export interface DedupeDecision {
  action: DedupeAction;
  existingId?: string;
}
