import { and, desc, eq } from "drizzle-orm";
import {
  db,
  savedSearchesTable,
  type InsertSavedSearch,
  type SavedSearch,
} from "@workspace/db";

export const savedSearchesRepository = {
  async findAll(clerkId: string): Promise<SavedSearch[]> {
    return db
      .select()
      .from(savedSearchesTable)
      .where(eq(savedSearchesTable.clerkId, clerkId))
      .orderBy(desc(savedSearchesTable.createdAt));
  },

  async findById(id: string, clerkId: string): Promise<SavedSearch | null> {
    const [row] = await db
      .select()
      .from(savedSearchesTable)
      .where(
        and(
          eq(savedSearchesTable.id, id),
          eq(savedSearchesTable.clerkId, clerkId),
        ),
      );
    return row ?? null;
  },

  async create(data: InsertSavedSearch): Promise<SavedSearch> {
    const [row] = await db.insert(savedSearchesTable).values(data).returning();
    return row;
  },

  async delete(id: string, clerkId: string): Promise<boolean> {
    const result = await db
      .delete(savedSearchesTable)
      .where(
        and(
          eq(savedSearchesTable.id, id),
          eq(savedSearchesTable.clerkId, clerkId),
        ),
      )
      .returning({ id: savedSearchesTable.id });
    return result.length > 0;
  },
};
