/**
 * ILLUSTRATIVE queue for the landing concepts. Not an export.
 *
 * The companies, titles, cities and posted dates are made up for the mockup.
 * Every number and reason line is produced by the API's own scoring code
 * (artifacts/api-server/src/queue/priority.ts), so the rows look exactly as
 * the real component would render that input. No row carries a deadline,
 * matching the README: sources rarely publish one.
 */
import { writeFileSync } from "node:fs";
import {
  deadlineUrgency,
  explainPriority,
  freshness,
  priorityContributions,
  priorityFromComponents,
} from "../../../../../artifacts/api-server/src/queue/priority";

const now = new Date("2026-09-16T03:30:00Z");
const DAY = 86_400_000;

type Seed = {
  title: string;
  company: string;
  city: string;
  track: "internship" | "new_grad" | "early_career";
  workMode: "onsite" | "hybrid" | "remote";
  relevance: number;
  daysAgo: number;
  dream?: boolean;
};

const SEEDS: Seed[] = [
  {
    title: "Software Engineer, New Grad",
    company: "Northwind Labs",
    city: "Bengaluru",
    track: "new_grad",
    workMode: "hybrid",
    relevance: 100,
    daysAgo: 1,
    dream: true,
  },
  {
    title: "SDE Intern, Payments",
    company: "Tallyfin",
    city: "Bengaluru",
    track: "internship",
    workMode: "onsite",
    relevance: 100,
    daysAgo: 1.5,
  },
  {
    title: "Graduate Engineer, Platform",
    company: "Kestrel Cloud",
    city: "Pune",
    track: "new_grad",
    workMode: "hybrid",
    relevance: 100,
    daysAgo: 3,
  },
  {
    title: "Backend Engineer I",
    company: "Orbit Retail",
    city: "Hyderabad",
    track: "new_grad",
    workMode: "onsite",
    relevance: 100,
    daysAgo: 5,
  },
  {
    title: "Software Engineer Intern",
    company: "Meridian Health",
    city: "Gurugram",
    track: "internship",
    workMode: "hybrid",
    relevance: 100,
    daysAgo: 6,
  },
  {
    title: "Associate Software Engineer",
    company: "Lumen Logistics",
    city: "Chennai",
    track: "new_grad",
    workMode: "onsite",
    relevance: 100,
    daysAgo: 8,
  },
  {
    title: "Frontend Engineer, Early Career",
    company: "Paper Trail",
    city: "Remote, India",
    track: "early_career",
    workMode: "remote",
    relevance: 80,
    daysAgo: 2,
  },
  {
    title: "SDE 1, Search",
    company: "Quill Commerce",
    city: "Bengaluru",
    track: "new_grad",
    workMode: "hybrid",
    relevance: 100,
    daysAgo: 11,
  },
  {
    title: "Data Engineer Intern",
    company: "Sable Analytics",
    city: "Mumbai",
    track: "internship",
    workMode: "onsite",
    relevance: 80,
    daysAgo: 4,
  },
  {
    title: "Software Developer, Graduate",
    company: "Harbor Systems",
    city: "Noida",
    track: "new_grad",
    workMode: "onsite",
    relevance: 100,
    daysAgo: 14,
  },
];

const items = SEEDS.map((s, i) => {
  const postedDate = new Date(now.getTime() - s.daysAgo * DAY);
  const components = {
    relevanceScore: s.relevance,
    deadlineUrgency: deadlineUrgency(null, now),
    freshness: freshness(postedDate, now),
    dreamCompanyBoost: s.dream ? 100 : 0,
  };
  return {
    job: {
      id: `illustrative-${i + 1}`,
      companyId: `illustrative-company-${i + 1}`,
      title: s.title,
      location: s.city,
      relevanceTrack: s.track,
      jobType: s.track === "internship" ? "internship" : "full_time",
      workMode: s.workMode,
      status: "active",
      applyUrl: "#illustrative",
      postedDate: postedDate.toISOString(),
      createdAt: postedDate.toISOString(),
      company: {
        id: `illustrative-company-${i + 1}`,
        name: s.company,
        logoUrl: null,
      },
    },
    priority: priorityFromComponents(components),
    components,
    contributions: priorityContributions(components),
    duplicateCount: 1,
    reasons: explainPriority(components, {
      deadline: null,
      postedDate,
      duplicateCount: 1,
      now,
    }),
  };
}).sort((a, b) => b.priority - a.priority);

const queue = {
  illustrative: true,
  note: "Illustrative rows for landing concepts. Scores and reasons come from api-server/src/queue/priority.ts; companies and titles are invented.",
  generatedAt: now.toISOString(),
  queueDay: "2026-09-16",
  limit: 10,
  eligibleCount: 2109,
  distinctCount: 1840,
  progress: {
    appliedToday: 0,
    target: 10,
    streakDays: 0,
    timezone: "Asia/Kolkata",
  },
  weights: {
    relevanceScore: 0.4,
    deadlineUrgency: 0.3,
    freshness: 0.2,
    dreamCompanyBoost: 0.1,
  },
  items,
};

writeFileSync(process.argv[2], JSON.stringify(queue, null, 2));
console.log(
  items
    .map((it, i) => `${i + 1}. ${it.priority} ${it.job.company.name}`)
    .join("\n"),
);
