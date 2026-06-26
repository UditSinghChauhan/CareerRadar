import {
  jobsRepository,
  type JobFilters,
} from "../repositories/jobs.repository";
import { companiesRepository } from "../repositories/companies.repository";
import { paginate } from "../lib/pagination";

export const jobsService = {
  async list(rawQuery: Record<string, unknown>) {
    const filters: JobFilters = {
      search: rawQuery.search as string | undefined,
      companyId: rawQuery.companyId as string | undefined,
      workMode: rawQuery.workMode as JobFilters["workMode"],
      jobType: rawQuery.jobType as JobFilters["jobType"],
      status: (rawQuery.status as JobFilters["status"]) ?? "active",
      eligibleBatch: rawQuery.eligibleBatch
        ? Number(rawQuery.eligibleBatch)
        : undefined,
      minCgpaLte: rawQuery.minCgpaLte
        ? Number(rawQuery.minCgpaLte)
        : undefined,
      deadlineBefore: rawQuery.deadlineBefore
        ? new Date(rawQuery.deadlineBefore as string)
        : undefined,
    };
    const pagination = paginate(rawQuery);
    return jobsRepository.findAll(filters, pagination);
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

    return jobsRepository.create({
      ...data,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      postedDate: data.postedDate ? new Date(data.postedDate) : new Date(),
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
    if (data.deadline) updateData.deadline = new Date(data.deadline as string);
    if (data.postedDate) updateData.postedDate = new Date(data.postedDate as string);

    return jobsRepository.update(id, updateData as Parameters<typeof jobsRepository.update>[1]);
  },

  async close(id: string) {
    const job = await jobsRepository.findById(id);
    if (!job) return null;
    return jobsRepository.softDelete(id);
  },
};
