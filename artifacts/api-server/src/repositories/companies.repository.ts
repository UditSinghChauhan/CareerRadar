import { and, count, eq, ilike, sql } from "drizzle-orm";
import { db, companiesTable, type InsertCompany, type Company } from "@workspace/db";
import { type PaginationParams, buildPaginatedResult } from "../lib/pagination";

export interface CompanyFilters {
  search?: string;
  industry?: string;
}

export const companiesRepository = {
  async findAll(filters: CompanyFilters, pagination: PaginationParams) {
    const conditions = [];

    if (filters.search) {
      conditions.push(ilike(companiesTable.name, `%${filters.search}%`));
    }
    if (filters.industry) {
      conditions.push(eq(companiesTable.industry, filters.industry));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (pagination.page - 1) * pagination.limit;

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(companiesTable)
        .where(where)
        .orderBy(companiesTable.name)
        .limit(pagination.limit)
        .offset(offset),
      db.select({ value: count() }).from(companiesTable).where(where),
    ]);

    return buildPaginatedResult(rows, Number(total), pagination);
  },

  async findById(id: string): Promise<Company | null> {
    const [row] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, id));
    return row ?? null;
  },

  async findBySlug(slug: string): Promise<Company | null> {
    const [row] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.slug, slug));
    return row ?? null;
  },

  async create(data: InsertCompany): Promise<Company> {
    const [row] = await db.insert(companiesTable).values(data).returning();
    return row;
  },

  async existsBySlug(slug: string): Promise<boolean> {
    const [row] = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(eq(companiesTable.slug, slug));
    return !!row;
  },
};
