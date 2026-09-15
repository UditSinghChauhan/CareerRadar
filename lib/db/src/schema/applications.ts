import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { applicationStatusEnum } from "./enums";

export const applicationsTable = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),
    status: applicationStatusEnum("status").notNull().default("saved"),
    appliedDate: timestamp("applied_date", { withTimezone: true }),
    notes: text("notes"),
    resumeVersion: text("resume_version"),
    // ── Phase 6.1 referral / outreach tracking ──────────────────────────────
    // `referralName` predates this phase and IS section 6.1's `contactName`:
    // the person being asked for the referral. A second `contact_name` column
    // would have left this one orphaned forever, because CLAUDE.md forbids
    // ever dropping one.
    referralName: text("referral_name"),
    /** The contact's LinkedIn (or any) profile URL. */
    contactUrl: text("contact_url"),
    /**
     * "none" | "requested" | "received" | "declined".
     *
     * Plain text, not a pgEnum, exactly as section 6.1 specifies. An enum here
     * would be a one-way door: Postgres cannot remove a value from one, and
     * CLAUDE.md forbids renaming, so a wording change would be permanent. The
     * allowed set is enforced by the OpenAPI schema and by REFERRAL_STATUSES
     * in the applications service.
     *
     * NOT NULL DEFAULT 'none' so every pre-existing row reads as "not asked"
     * without a backfill, and the drawer never has to render a null.
     */
    referralStatus: text("referral_status").notNull().default("none"),
    /** Free text: what was sent, to whom, when, and what came back. */
    outreachNotes: text("outreach_notes"),
    // Section 6.1 calls this `followUpAt`. It already existed under this name
    // and is reused rather than duplicated.
    followUpDate: timestamp("follow_up_date", { withTimezone: true }),
    offerAmount: integer("offer_amount"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    unique("applications_clerk_job_unique").on(table.clerkId, table.jobId),
    index("applications_clerk_id_idx").on(table.clerkId),
    index("applications_job_id_idx").on(table.jobId),
    index("applications_status_idx").on(table.status),
    // Phase 6.1's "Awaiting follow-up" filter: follow_up_date <= now() AND a
    // non-terminal status, always scoped to one clerk_id. Leading with
    // clerk_id keeps it usable for that scan; rows with a NULL follow-up date
    // are the overwhelming majority and are excluded from the index entirely.
    index("applications_clerk_follow_up_idx")
      .on(table.clerkId, table.followUpDate)
      .where(sql`${table.followUpDate} IS NOT NULL`),
  ],
);

export type Application = typeof applicationsTable.$inferSelect;
export type InsertApplication = typeof applicationsTable.$inferInsert;
