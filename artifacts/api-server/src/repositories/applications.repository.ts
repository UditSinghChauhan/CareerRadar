import { and, count, desc, eq } from "drizzle-orm";
import {
  db,
  applicationsTable,
  jobsTable,
  companiesTable,
  type InsertApplication,
  type Application,
  type Job,
  type Company,
} from "@workspace/db";
import { type PaginationParams, buildPaginatedResult } from "../lib/pagination";
import { applicationColumns, companyColumns, jobColumns } from "./columns";

export type ApplicationWithJob = Application & {
  job: Job & { company: Company };
};

export interface ApplicationFilters {
  status?: Application["status"];
  jobType?: Job["jobType"];
}

// Drizzle does not support 3-level nested object selects, so this selects three
// flat groups and reassembles them. Columns are listed explicitly (see
// ./columns.ts) rather than taken from a bare select, so a new schema column
// does not appear in this response until someone puts it there on purpose.
async function queryApplicationsWithJob(
  where: Parameters<typeof db.select>[0] extends undefined
    ? undefined
    : ReturnType<typeof and> | undefined,
  opts: { limit?: number; offset?: number } = {},
) {
  const query = db
    .select({
      application: applicationColumns,
      job: jobColumns,
      company: companyColumns,
    })
    .from(applicationsTable)
    .innerJoin(jobsTable, eq(applicationsTable.jobId, jobsTable.id))
    .innerJoin(companiesTable, eq(jobsTable.companyId, companiesTable.id))
    .where(where)
    .orderBy(desc(applicationsTable.createdAt));

  const rows =
    opts.limit !== undefined
      ? await query.limit(opts.limit).offset(opts.offset ?? 0)
      : await query;

  return rows.map((r) => ({
    ...r.application,
    job: { ...r.job, company: r.company },
  })) as ApplicationWithJob[];
}

export const applicationsRepository = {
  async findAll(
    clerkId: string,
    filters: ApplicationFilters,
    pagination: PaginationParams,
  ) {
    const conditions = [eq(applicationsTable.clerkId, clerkId)];

    if (filters.status) {
      conditions.push(eq(applicationsTable.status, filters.status));
    }
    if (filters.jobType) {
      conditions.push(eq(jobsTable.jobType, filters.jobType));
    }

    const where = and(...conditions);
    const offset = (pagination.page - 1) * pagination.limit;

    const [rows, countResult] = await Promise.all([
      queryApplicationsWithJob(where, { limit: pagination.limit, offset }),
      db
        .select({ value: count() })
        .from(applicationsTable)
        .innerJoin(jobsTable, eq(applicationsTable.jobId, jobsTable.id))
        .where(where),
    ]);

    return buildPaginatedResult(rows, Number(countResult[0].value), pagination);
  },

  async findById(
    id: string,
    clerkId: string,
  ): Promise<ApplicationWithJob | null> {
    const where = and(
      eq(applicationsTable.id, id),
      eq(applicationsTable.clerkId, clerkId),
    );
    const rows = await queryApplicationsWithJob(where);
    return rows[0] ?? null;
  },

  async findByJobId(
    clerkId: string,
    jobId: string,
  ): Promise<Application | null> {
    const [row] = await db
      .select(applicationColumns)
      .from(applicationsTable)
      .where(
        and(
          eq(applicationsTable.clerkId, clerkId),
          eq(applicationsTable.jobId, jobId),
        ),
      );
    return row ?? null;
  },

  // Deliberately no join: the jobs list only needs jobId -> status, and this
  // runs on every /jobs render. Served straight off applications_clerk_id_idx.
  async findStatusMap(
    clerkId: string,
  ): Promise<Array<{ jobId: string; status: Application["status"] }>> {
    return db
      .select({
        jobId: applicationsTable.jobId,
        status: applicationsTable.status,
      })
      .from(applicationsTable)
      .where(eq(applicationsTable.clerkId, clerkId));
  },

  async countAll(clerkId: string): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(applicationsTable)
      .where(eq(applicationsTable.clerkId, clerkId));
    return Number(value);
  },

  async countByStatuses(clerkId: string): Promise<Record<string, number>> {
    const rows = await db
      .select({ status: applicationsTable.status, value: count() })
      .from(applicationsTable)
      .where(eq(applicationsTable.clerkId, clerkId))
      .groupBy(applicationsTable.status);

    return Object.fromEntries(rows.map((r) => [r.status, Number(r.value)]));
  },

  async create(data: InsertApplication): Promise<ApplicationWithJob> {
    const [row] = await db.insert(applicationsTable).values(data).returning();
    const app = await this.findById(row.id, data.clerkId);
    return app!;
  },

  async update(
    id: string,
    clerkId: string,
    data: Partial<InsertApplication>,
  ): Promise<ApplicationWithJob | null> {
    await db
      .update(applicationsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(applicationsTable.id, id),
          eq(applicationsTable.clerkId, clerkId),
        ),
      );
    return this.findById(id, clerkId);
  },

  async delete(id: string, clerkId: string): Promise<boolean> {
    const result = await db
      .delete(applicationsTable)
      .where(
        and(
          eq(applicationsTable.id, id),
          eq(applicationsTable.clerkId, clerkId),
        ),
      )
      .returning({ id: applicationsTable.id });
    return result.length > 0;
  },
};
