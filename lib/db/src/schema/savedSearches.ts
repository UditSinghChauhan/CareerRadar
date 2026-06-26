import { pgTable, text, timestamp, uuid, index, jsonb } from "drizzle-orm/pg-core";

export const savedSearchesTable = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull(),
    name: text("name").notNull(),
    filters: jsonb("filters").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [index("saved_searches_clerk_id_idx").on(table.clerkId)],
);

export type SavedSearch = typeof savedSearchesTable.$inferSelect;
export type InsertSavedSearch = typeof savedSearchesTable.$inferInsert;
