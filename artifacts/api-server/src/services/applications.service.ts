import {
  applicationsRepository,
  type ApplicationFilters,
} from "../repositories/applications.repository";
import { jobsRepository } from "../repositories/jobs.repository";
import { paginate } from "../lib/pagination";
import type { Application } from "@workspace/db";

/**
 * Phase 6.1. The column is plain text (see lib/db/src/schema/applications.ts
 * for why it is not a pgEnum), so this is where the allowed set is enforced on
 * the way in. It matches the enum in openapi.yaml exactly; anything else is
 * rejected rather than written, so the drawer's select can never be handed a
 * value it has no label for.
 */
export const REFERRAL_STATUSES = [
  "none",
  "requested",
  "received",
  "declined",
] as const;

export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export function isReferralStatus(value: unknown): value is ReferralStatus {
  return (REFERRAL_STATUSES as readonly unknown[]).includes(value);
}

/**
 * `undefined` means "the caller did not mention this field, leave it alone";
 * `null` means "the caller cleared it". Drizzle drops undefined keys from a
 * `.set()` and writes NULL for null, so the distinction survives all the way
 * to the UPDATE — which is the whole reason the drawer can erase a follow-up
 * date instead of being stuck with it forever.
 */
type Clearable<T> = T | null | undefined;

function toDate(value: Clearable<string>): Clearable<Date> {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const applicationsService = {
  async list(clerkId: string, rawQuery: Record<string, unknown>) {
    const filters: ApplicationFilters = {
      status: rawQuery.status as Application["status"] | undefined,
      jobType: rawQuery.jobType as "internship" | "full_time" | undefined,
      // Query strings carry no booleans. "true" is the only affirmative, so a
      // stray ?awaitingFollowUp=0 or =no reads as off rather than on.
      awaitingFollowUp: rawQuery.awaitingFollowUp === "true",
    };
    const pagination = paginate(rawQuery);
    return applicationsRepository.findAll(clerkId, filters, pagination);
  },

  async get(id: string, clerkId: string) {
    return applicationsRepository.findById(id, clerkId);
  },

  async getStatusMap(
    clerkId: string,
  ): Promise<Record<string, Application["status"]>> {
    const rows = await applicationsRepository.findStatusMap(clerkId);
    return Object.fromEntries(rows.map((r) => [r.jobId, r.status]));
  },

  async create(
    clerkId: string,
    data: {
      jobId: string;
      status?: Application["status"];
      appliedDate?: string;
      notes?: string;
      resumeVersion?: string;
      referralName?: string;
      contactUrl?: string;
      referralStatus?: ReferralStatus;
      outreachNotes?: string;
    },
  ) {
    const job = await jobsRepository.findById(data.jobId);
    if (!job) throw new Error(`Job "${data.jobId}" not found`);

    const existing = await applicationsRepository.findByJobId(
      clerkId,
      data.jobId,
    );
    if (existing) throw new Error("You have already applied to this job");

    const status = data.status ?? "saved";
    // One-click Apply sends appliedDate explicitly, but default it anyway so an
    // "applied" row can never land with a null date and sort to the bottom.
    const appliedDate = data.appliedDate
      ? new Date(data.appliedDate)
      : status === "applied"
        ? new Date()
        : undefined;

    return applicationsRepository.create({
      clerkId,
      jobId: data.jobId,
      status,
      appliedDate,
      notes: data.notes,
      resumeVersion: data.resumeVersion,
      referralName: data.referralName,
      contactUrl: data.contactUrl,
      // Omitted rather than defaulted to "none" in code: the column's own
      // NOT NULL DEFAULT does that, in one place.
      referralStatus: data.referralStatus,
      outreachNotes: data.outreachNotes,
    });
  },

  async update(
    id: string,
    clerkId: string,
    data: {
      status?: Application["status"];
      notes?: Clearable<string>;
      resumeVersion?: Clearable<string>;
      referralName?: Clearable<string>;
      contactUrl?: Clearable<string>;
      referralStatus?: ReferralStatus;
      outreachNotes?: Clearable<string>;
      followUpDate?: Clearable<string>;
      appliedDate?: Clearable<string>;
      offerAmount?: Clearable<number>;
    },
  ) {
    const existing = await applicationsRepository.findById(id, clerkId);
    if (!existing) return null;

    return applicationsRepository.update(id, clerkId, {
      ...data,
      followUpDate: toDate(data.followUpDate),
      appliedDate: toDate(data.appliedDate),
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
