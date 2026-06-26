import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { companySizeEnum, companyTypeEnum } from "./enums";

export const companiesTable = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logoUrl: text("logo_url"),
    website: text("website"),
    industry: text("industry"),
    description: text("description"),
    headquarters: text("headquarters"),
    size: companySizeEnum("size"),
    type: companyTypeEnum("type"),
    linkedinUrl: text("linkedin_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("companies_slug_idx").on(table.slug),
    index("companies_industry_idx").on(table.industry),
    index("companies_name_idx").on(table.name),
  ],
);

export type Company = typeof companiesTable.$inferSelect;
export type InsertCompany = typeof companiesTable.$inferInsert;
