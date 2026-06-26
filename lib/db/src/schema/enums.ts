import { pgEnum } from "drizzle-orm/pg-core";

export const workModeEnum = pgEnum("work_mode", ["remote", "hybrid", "onsite"]);

export const jobTypeEnum = pgEnum("job_type", ["internship", "full_time"]);

export const jobStatusEnum = pgEnum("job_status", ["active", "closed", "draft"]);

export const applicationStatusEnum = pgEnum("application_status", [
  "saved",
  "applied",
  "oa_pending",
  "oa_completed",
  "interview_pending",
  "interview_completed",
  "offered",
  "rejected",
  "withdrawn",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "deadline_reminder",
  "new_job",
  "status_update",
  "system",
]);

export const companySizeEnum = pgEnum("company_size", [
  "startup",
  "small",
  "medium",
  "large",
  "enterprise",
]);

export const companyTypeEnum = pgEnum("company_type", [
  "product",
  "service",
  "consulting",
  "startup",
]);
