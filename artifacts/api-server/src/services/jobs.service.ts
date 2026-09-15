import {
  jobsRepository,
  JOB_SORTS,
  type JobFilters,
  type JobSort,
} from "../repositories/jobs.repository";
import { companiesRepository } from "../repositories/companies.repository";
import { paginate } from "../lib/pagination";
import { normalizeLocation, toLocationColumns } from "../relevance/location";
import {
  classifyJob,
  RELEVANCE_TRACKS,
  toRelevanceColumns,
  type RelevanceTrack,
} from "../relevance/classifier";
import { resolveGraduationYear } from "../relevance/graduation-year";
import { resolveProfileId } from "../repositories/jobDismissals.repository";

/** 'true' / 'false' from the query string; anything else is "not given". */
function parseBoolean(value: unknown): boolean | undefined {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return undefined;
}

/**
 * `?locations=NCR&locations=remote` arrives as an array, `?locations=NCR` as a
 * string, and the generated client sends the array form. Comma-separated is
 * accepted too so the URL can be typed by hand.
 */
function parseList(value: unknown): string[] | undefined {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const items = raw
    .flatMap((v) => String(v).split(","))
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return items.length > 0 ? items : undefined;
}

/** Only the four known tracks survive; anything else in the list is dropped. */
function parseTracks(value: unknown): RelevanceTrack[] | undefined {
  const items = parseList(value)?.filter((v): v is RelevanceTrack =>
    (RELEVANCE_TRACKS as readonly string[]).includes(v),
  );
  return items && items.length > 0 ? items : undefined;
}

/** Only the known work modes survive; anything else in the list is dropped. */
function parseWorkModes(value: unknown): JobFilters["workModes"] {
  const items = parseList(value)?.filter(
    (v): v is "remote" | "hybrid" | "onsite" =>
      v === "remote" || v === "hybrid" || v === "onsite",
  );
  return items && items.length > 0 ? items : undefined;
}

/** Graduation years. Non-integers are dropped rather than becoming NaN. */
function parseYears(value: unknown): number[] | undefined {
  const items = parseList(value)
    ?.map((v) => Number(v))
    .filter((n) => Number.isInteger(n));
  return items && items.length > 0 ? items : undefined;
}

/** One of the five known sorts, else the pre-2.1 default. */
function parseSort(value: unknown): JobSort {
  return (JOB_SORTS as readonly string[]).includes(value as string)
    ? (value as JobSort)
    : "newest";
}

/** An integer 0–100, else "not given". */
function parseScore(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100) return undefined;
  return n;
}

export const jobsService = {
  /**
   * `options.clerkId` is the SIGNED-IN caller, when there is one. `/api/jobs`
   * is a public route, so it may legitimately be absent; dismissals are
   * per-profile, so an anonymous caller sees the unfiltered list exactly as
   * before Phase 3.
   */
  async list(
    rawQuery: Record<string, unknown>,
    options: { clerkId?: string | null } = {},
  ) {
    // Phase 3.2: dismissed rows are hidden unless `showDismissed=true`.
    // Resolved to a profile id here rather than in the repository so the
    // repository stays a pure query builder.
    const showDismissed = parseBoolean(rawQuery.showDismissed) === true;
    const excludeDismissedForProfileId =
      options.clerkId && !showDismissed
        ? await resolveProfileId(options.clerkId)
        : null;

    const filters: JobFilters = {
      search: rawQuery.search as string | undefined,
      companyId: rawQuery.companyId as string | undefined,
      workMode: rawQuery.workMode as JobFilters["workMode"],
      jobType: rawQuery.jobType as JobFilters["jobType"],
      status: (rawQuery.status as JobFilters["status"]) ?? "active",
      eligibleBatch: rawQuery.eligibleBatch
        ? Number(rawQuery.eligibleBatch)
        : undefined,
      minCgpaLte: rawQuery.minCgpaLte ? Number(rawQuery.minCgpaLte) : undefined,
      deadlineBefore: rawQuery.deadlineBefore
        ? new Date(rawQuery.deadlineBefore as string)
        : undefined,
      isIndia: parseBoolean(rawQuery.isIndia),
      isRemote: parseBoolean(rawQuery.isRemote),
      locations: parseList(rawQuery.locations),
      isFresherEligible: parseBoolean(rawQuery.isFresherEligible),
      relevanceTrack: parseTracks(rawQuery.relevanceTrack),
      minRelevanceScore: parseScore(rawQuery.minRelevanceScore),
      excludeDismissedForProfileId,
      // Phase 7: the filters the Jobs page used to apply in the browser.
      workModes: parseWorkModes(rawQuery.workModes),
      batches: parseYears(rawQuery.batches),
      branches: parseList(rawQuery.branches),
      skills: parseList(rawQuery.skills),
      sourcePlatform: (rawQuery.sourcePlatform as string) || undefined,
      // Like dismissals, only meaningful for a signed-in caller: an anonymous
      // one has no applications, so there is nothing to hide.
      excludeAppliedForClerkId:
        parseBoolean(rawQuery.hideApplied) === true
          ? (options.clerkId ?? null)
          : null,
    };
    const pagination = paginate(rawQuery);
    return jobsRepository.findAll(
      filters,
      pagination,
      parseSort(rawQuery.sort),
    );
  },

  async get(id: string) {
    return jobsRepository.findById(id);
  },

  async getClosingSoon(days: number) {
    return jobsRepository.findClosingSoon(days);
  },

  async create(data: {
    companyId: string;
    sourceId?: string;
    title: string;
    department?: string;
    location?: string;
    country?: string;
    workMode: "remote" | "hybrid" | "onsite";
    jobType: "internship" | "full_time";
    salaryMin?: number;
    salaryMax?: number;
    stipend?: number;
    currency?: string;
    eligibleBatch?: number[];
    eligibleBranches?: string[];
    minCgpa?: number;
    requiredSkills?: string[];
    experienceMin?: number;
    experienceMax?: number;
    deadline?: string;
    applyUrl?: string;
    sourcePlatform?: string;
    sourceUrl?: string;
    postedDate?: string;
    status?: "active" | "closed" | "draft";
    description?: string;
    requirements?: string;
    benefits?: string[];
    selectionProcess?: string;
  }) {
    const company = await companiesRepository.findById(data.companyId);
    if (!company) {
      throw new Error(`Company "${data.companyId}" not found`);
    }

    // Hand-entered jobs get the same normalised location and the same
    // relevance verdict as synced ones.
    const location = toLocationColumns(
      normalizeLocation(data.location, data.country, {
        providerRemote: data.workMode === "remote",
      }),
    );
    const deadline = data.deadline ? new Date(data.deadline) : undefined;
    const postedDate = data.postedDate ? new Date(data.postedDate) : new Date();
    const relevance = toRelevanceColumns(
      classifyJob({
        title: data.title,
        description: data.description,
        requirements: data.requirements,
        experienceMin: data.experienceMin,
        experienceMax: data.experienceMax,
        jobType: data.jobType,
        isIndia: location.isIndia,
        isRemote: location.isRemote,
        eligibleBatch: data.eligibleBatch,
        deadline,
        postedDate,
        graduationYear: await resolveGraduationYear(),
      }),
    );

    return jobsRepository.create({
      ...data,
      ...location,
      ...relevance,
      deadline,
      postedDate,
      eligibleBatch: data.eligibleBatch ?? [],
      eligibleBranches: data.eligibleBranches ?? [],
      requiredSkills: data.requiredSkills ?? [],
      benefits: data.benefits ?? [],
      status: data.status ?? "active",
      currency: data.currency ?? "INR",
    });
  },

  async update(id: string, data: Record<string, unknown>) {
    const job = await jobsRepository.findById(id);
    if (!job) return null;

    const updateData: Record<string, unknown> = { ...data };
    if ("location" in data || "country" in data || "workMode" in data) {
      const location =
        "location" in data ? (data.location as string | null) : job.location;
      // Only a country the caller is sending right now may act as a hint. The
      // stored `job.country` is the unreliable column (schema default 'India')
      // and must never feed the normaliser — see relevance/location.ts.
      const country =
        "country" in data ? (data.country as string | null) : undefined;
      // workMode, unlike country, is a column the providers set deliberately.
      const workMode =
        "workMode" in data ? (data.workMode as string) : job.workMode;
      Object.assign(
        updateData,
        toLocationColumns(
          normalizeLocation(location, country, {
            providerRemote: workMode === "remote",
          }),
        ),
      );
    }
    if (data.deadline) updateData.deadline = new Date(data.deadline as string);
    if (data.postedDate)
      updateData.postedDate = new Date(data.postedDate as string);

    // Re-classify when anything the classifier reads has changed. The merged
    // view (stored row overlaid with this update) is what gets classified,
    // so a title edit alone re-scores against the stored description.
    const classifierInputs = [
      "title",
      "description",
      "requirements",
      "experienceMin",
      "experienceMax",
      "jobType",
      "eligibleBatch",
      "deadline",
      "postedDate",
      "location",
      "country",
      "workMode",
    ];
    if (classifierInputs.some((k) => k in data)) {
      const merged = { ...job, ...updateData } as typeof job;
      Object.assign(
        updateData,
        toRelevanceColumns(
          classifyJob({
            title: merged.title,
            description: merged.description,
            requirements: merged.requirements,
            experienceMin: merged.experienceMin,
            experienceMax: merged.experienceMax,
            jobType: merged.jobType,
            isIndia: merged.isIndia,
            isRemote: merged.isRemote,
            eligibleBatch: merged.eligibleBatch,
            deadline: merged.deadline,
            postedDate: merged.postedDate,
            graduationYear: await resolveGraduationYear(),
          }),
        ),
      );
    }

    return jobsRepository.update(
      id,
      updateData as Parameters<typeof jobsRepository.update>[1],
    );
  },

  async close(id: string) {
    const job = await jobsRepository.findById(id);
    if (!job) return null;
    return jobsRepository.softDelete(id);
  },
};
