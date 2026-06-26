import { and, asc, count, desc, eq, ilike, isNull, lte, or, sql } from "drizzle-orm";
import {
  db,
  jobsTable,
  companiesTable,
  type InsertJob,
  type Job,
  type Company,
} from "@workspace/db";
import { type PaginationParams, buildPaginatedResult } from "../lib/pagination";

export type JobWithCompany = Job & { company: Company };

export interface JobFilters {
  search?: string;
  companyId?: string;
  workMode?: "remote" | "hybrid" | "onsite";
  jobType?: "internship" | "full_time";
  status?: "active" | "closed" | "draft";
  eligibleBatch?: number;
  minCgpaLte?: number;
  deadlineBefore?: Date;
}

function buildJobSelect() {
  return db
    .select({
      id: jobsTable.id,
      companyId: jobsTable.companyId,
      sourceId: jobsTable.sourceId,
      title: jobsTable.title,
      department: jobsTable.department,
      location: jobsTable.location,
      country: jobsTable.country,
      workMode: jobsTable.workMode,
      jobType: jobsTable.jobType,
      salaryMin: jobsTable.salaryMin,
      salaryMax: jobsTable.salaryMax,
      stipend: jobsTable.stipend,
      currency: jobsTable.currency,
      eligibleBatch: jobsTable.eligibleBatch,
      eligibleBranches: jobsTable.eligibleBranches,
      minCgpa: jobsTable.minCgpa,
      requiredSkills: jobsTable.requiredSkills,
      experienceMin: jobsTable.experienceMin,
      experienceMax: jobsTable.experienceMax,
      deadline: jobsTable.deadline,
      applyUrl: jobsTable.applyUrl,
      sourcePlatform: jobsTable.sourcePlatform,
      sourceUrl: jobsTable.sourceUrl,
      postedDate: jobsTable.postedDate,
      status: jobsTable.status,
      description: jobsTable.description,
      requirements: jobsTable.requirements,
      benefits: jobsTable.benefits,
      selectionProcess: jobsTable.selectionProcess,
      createdAt: jobsTable.createdAt,
      updatedAt: jobsTable.updatedAt,
      company: {
        id: companiesTable.id,
        name: companiesTable.name,
        slug: companiesTable.slug,
        logoUrl: companiesTable.logoUrl,
        website: companiesTable.website,
        industry: companiesTable.industry,
        description: companiesTable.description,
        headquarters: companiesTable.headquarters,
        size: companiesTable.size,
        type: companiesTable.type,
        linkedinUrl: companiesTable.linkedinUrl,
        createdAt: companiesTable.createdAt,
        updatedAt: companiesTable.updatedAt,
      },
    })
    .from(jobsTable)
    .innerJoin(companiesTable, eq(jobsTable.companyId, companiesTable.id));
}

function buildConditions(filters: JobFilters) {
  const conditions = [];

  if (filters.search) {
    conditions.push(
      or(
        ilike(jobsTable.title, `%${filters.search}%`),
        ilike(companiesTable.name, `%${filters.search}%`),
      ),
    );
  }
  if (filters.companyId) {
    conditions.push(eq(jobsTable.companyId, filters.companyId));
  }
  if (filters.workMode) {
    conditions.push(eq(jobsTable.workMode, filters.workMode));
  }
  if (filters.jobType) {
    conditions.push(eq(jobsTable.jobType, filters.jobType));
  }
  if (filters.status) {
    conditions.push(eq(jobsTable.status, filters.status));
  }
  if (filters.eligibleBatch !== undefined) {
    conditions.push(
      or(
        sql`${jobsTable.eligibleBatch} = '{}'::integer[]`,
        sql`${jobsTable.eligibleBatch} @> ARRAY[${filters.eligibleBatch}]::integer[]`,
      ),
    );
  }
  if (filters.minCgpaLte !== undefined) {
    conditions.push(
      or(isNull(jobsTable.minCgpa), lte(jobsTable.minCgpa, filters.minCgpaLte)),
    );
  }
  if (filters.deadlineBefore) {
    conditions.push(lte(jobsTable.deadline, filters.deadlineBefore));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export const jobsRepository = {
  async findAll(filters: JobFilters, pagination: PaginationParams) {
    const where = buildConditions(filters);
    const offset = (pagination.page - 1) * pagination.limit;

    const [rows, countResult] = await Promise.all([
      buildJobSelect()
        .where(where)
        .orderBy(desc(jobsTable.postedDate), desc(jobsTable.createdAt))
        .limit(pagination.limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(jobsTable)
        .innerJoin(companiesTable, eq(jobsTable.companyId, companiesTable.id))
        .where(where),
    ]);

    return buildPaginatedResult(rows as JobWithCompany[], Number(countResult[0].value), pagination);
  },

  async findById(id: string): Promise<JobWithCompany | null> {
    const [row] = await buildJobSelect().where(eq(jobsTable.id, id));
    return (row as JobWithCompany) ?? null;
  },

  async findClosingSoon(days: number): Promise<JobWithCompany[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const rows = await buildJobSelect()
      .where(
        and(
          eq(jobsTable.status, "active"),
          lte(jobsTable.deadline, cutoff),
          sql`${jobsTable.deadline} >= NOW()`,
        ),
      )
      .orderBy(asc(jobsTable.deadline));

    return rows as JobWithCompany[];
  },

  async countActive(): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(jobsTable)
      .where(eq(jobsTable.status, "active"));
    return Number(value);
  },

  async countClosingSoon(days: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    const [{ value }] = await db
      .select({ value: count() })
      .from(jobsTable)
      .where(
        and(
          eq(jobsTable.status, "active"),
          lte(jobsTable.deadline, cutoff),
          sql`${jobsTable.deadline} >= NOW()`,
        ),
      );
    return Number(value);
  },

  async create(data: InsertJob): Promise<JobWithCompany> {
    const [row] = await db.insert(jobsTable).values(data).returning();
    const job = await this.findById(row.id);
    return job!;
  },

  async update(id: string, data: Partial<InsertJob>): Promise<JobWithCompany | null> {
    await db
      .update(jobsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(jobsTable.id, id));
    return this.findById(id);
  },

  async softDelete(id: string): Promise<JobWithCompany | null> {
    await db
      .update(jobsTable)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(jobsTable.id, id));
    return this.findById(id);
  },
};
