/**
 * Explicit column lists for the joined reads.
 * ────────────────────────────────────────────
 * The applications and bookmarks reads used to be `db.select()` — a bare select
 * over a three-table join, which returns every column of every table. That makes
 * the API response shape a side effect of the schema: any column added to `jobs`
 * silently enters `/api/applications` and `/api/bookmarks` payloads, whether or
 * not it was ever meant to be public. `lastSeenAt` is internal bookkeeping and
 * would have been the first to leak that way.
 *
 * Listing the columns here makes exposure a deliberate edit instead. Adding a
 * column to `lib/db/src/schema/` now changes nothing about the API until someone
 * adds it below.
 *
 * ORDER MATTERS. These lists are in schema-declaration order, which is the order
 * a bare select produced, so the JSON key order of existing responses is
 * unchanged. Keep new entries in the position the schema declares them.
 */

import {
  applicationsTable,
  bookmarksTable,
  companiesTable,
  jobsTable,
} from "@workspace/db";

export const companyColumns = {
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
} as const;

export const jobColumns = {
  id: jobsTable.id,
  companyId: jobsTable.companyId,
  sourceId: jobsTable.sourceId,
  title: jobsTable.title,
  department: jobsTable.department,
  location: jobsTable.location,
  country: jobsTable.country,
  locationCity: jobsTable.locationCity,
  locationRegion: jobsTable.locationRegion,
  locationCountry: jobsTable.locationCountry,
  locationMetro: jobsTable.locationMetro,
  isIndia: jobsTable.isIndia,
  isRemote: jobsTable.isRemote,
  relevanceTrack: jobsTable.relevanceTrack,
  relevanceScore: jobsTable.relevanceScore,
  isFresherEligible: jobsTable.isFresherEligible,
  seniorityExcluded: jobsTable.seniorityExcluded,
  relevanceSignals: jobsTable.relevanceSignals,
  classifiedAt: jobsTable.classifiedAt,
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
  lastSeenAt: jobsTable.lastSeenAt,
  description: jobsTable.description,
  requirements: jobsTable.requirements,
  benefits: jobsTable.benefits,
  selectionProcess: jobsTable.selectionProcess,
  createdAt: jobsTable.createdAt,
  updatedAt: jobsTable.updatedAt,
} as const;

export const applicationColumns = {
  id: applicationsTable.id,
  clerkId: applicationsTable.clerkId,
  jobId: applicationsTable.jobId,
  status: applicationsTable.status,
  appliedDate: applicationsTable.appliedDate,
  notes: applicationsTable.notes,
  resumeVersion: applicationsTable.resumeVersion,
  referralName: applicationsTable.referralName,
  followUpDate: applicationsTable.followUpDate,
  offerAmount: applicationsTable.offerAmount,
  createdAt: applicationsTable.createdAt,
  updatedAt: applicationsTable.updatedAt,
} as const;

export const bookmarkColumns = {
  id: bookmarksTable.id,
  clerkId: bookmarksTable.clerkId,
  jobId: bookmarksTable.jobId,
  createdAt: bookmarksTable.createdAt,
} as const;
