import { and, count, desc, eq } from "drizzle-orm";
import {
  db,
  bookmarksTable,
  jobsTable,
  companiesTable,
  type Bookmark,
  type Job,
  type Company,
} from "@workspace/db";

export type BookmarkWithJob = Bookmark & { job: Job & { company: Company } };

// Drizzle does not support 3-level nested object selects.
// Use flat three-table join and transform the result.
async function queryBookmarksWithJob(where?: ReturnType<typeof and>) {
  const rows = await db
    .select()
    .from(bookmarksTable)
    .innerJoin(jobsTable, eq(bookmarksTable.jobId, jobsTable.id))
    .innerJoin(companiesTable, eq(jobsTable.companyId, companiesTable.id))
    .where(where)
    .orderBy(desc(bookmarksTable.createdAt));

  return rows.map((r) => ({
    ...r.bookmarks,
    job: { ...r.jobs, company: r.companies },
  })) as BookmarkWithJob[];
}

export const bookmarksRepository = {
  async findAll(clerkId: string): Promise<BookmarkWithJob[]> {
    return queryBookmarksWithJob(eq(bookmarksTable.clerkId, clerkId) as ReturnType<typeof and>);
  },

  async findByJobId(clerkId: string, jobId: string): Promise<Bookmark | null> {
    const [row] = await db
      .select()
      .from(bookmarksTable)
      .where(
        and(eq(bookmarksTable.clerkId, clerkId), eq(bookmarksTable.jobId, jobId)),
      );
    return row ?? null;
  },

  async count(clerkId: string): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(bookmarksTable)
      .where(eq(bookmarksTable.clerkId, clerkId));
    return Number(value);
  },

  async create(clerkId: string, jobId: string): Promise<BookmarkWithJob> {
    const [row] = await db
      .insert(bookmarksTable)
      .values({ clerkId, jobId })
      .returning();
    const rows = await queryBookmarksWithJob(eq(bookmarksTable.id, row.id) as ReturnType<typeof and>);
    return rows[0];
  },

  async delete(clerkId: string, jobId: string): Promise<boolean> {
    const result = await db
      .delete(bookmarksTable)
      .where(
        and(eq(bookmarksTable.clerkId, clerkId), eq(bookmarksTable.jobId, jobId)),
      )
      .returning({ id: bookmarksTable.id });
    return result.length > 0;
  },
};
