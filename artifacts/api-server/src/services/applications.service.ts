import {
  applicationsRepository,
  type ApplicationFilters,
} from "../repositories/applications.repository";
import { jobsRepository } from "../repositories/jobs.repository";
import { paginate } from "../lib/pagination";
import type { Application } from "@workspace/db";

export const applicationsService = {
  async list(clerkId: string, rawQuery: Record<string, unknown>) {
    const filters: ApplicationFilters = {
      status: rawQuery.status as Application["status"] | undefined,
      jobType: rawQuery.jobType as "internship" | "full_time" | undefined,
    };
    const pagination = paginate(rawQuery);
    return applicationsRepository.findAll(clerkId, filters, pagination);
  },

  async get(id: string, clerkId: string) {
    return applicationsRepository.findById(id, clerkId);
  },

  async create(
    clerkId: string,
    data: {
      jobId: string;
      status?: Application["status"];
      notes?: string;
      resumeVersion?: string;
      referralName?: string;
    },
  ) {
    const job = await jobsRepository.findById(data.jobId);
    if (!job) throw new Error(`Job "${data.jobId}" not found`);

    const existing = await applicationsRepository.findByJobId(clerkId, data.jobId);
    if (existing) throw new Error("You have already applied to this job");

    return applicationsRepository.create({
      clerkId,
      jobId: data.jobId,
      status: data.status ?? "saved",
      notes: data.notes,
      resumeVersion: data.resumeVersion,
      referralName: data.referralName,
    });
  },

  async update(
    id: string,
    clerkId: string,
    data: {
      status?: Application["status"];
      notes?: string;
      resumeVersion?: string;
      referralName?: string;
      followUpDate?: string;
      appliedDate?: string;
      offerAmount?: number;
    },
  ) {
    const existing = await applicationsRepository.findById(id, clerkId);
    if (!existing) return null;

    return applicationsRepository.update(id, clerkId, {
      ...data,
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : undefined,
      appliedDate: data.appliedDate ? new Date(data.appliedDate) : undefined,
    });
  },

  async delete(id: string, clerkId: string) {
    return applicationsRepository.delete(id, clerkId);
  },

  async getStats(clerkId: string) {
    const [total, byStatus] = await Promise.all([
      applicationsRepository.countAll(clerkId),
      applicationsRepository.countByStatuses(clerkId),
    ]);
    return { total, byStatus };
  },
};
