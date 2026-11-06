/**
 * Seeds a LOCAL database with an invented demo account for the landing
 * page's product captures (scripts/capture-landing.mjs). Every company,
 * title and application here is made up; no person appears anywhere.
 *
 * Refuses to run against anything but localhost: CLAUDE.md, "E2E tests use
 * test data on a local database only".
 *
 *   DATABASE_URL=postgres://…@localhost:5432/careerradar_capture \
 *     pnpm --filter @workspace/api-server exec tsx src/scripts/capture-seed.ts
 *
 * CAPTURE_NEW_USER=1 seeds the same jobs but leaves the demo account as it
 * is a minute after sign-up: a name and an email, no onboarding answer, no
 * applications, bookmarks or notifications. scripts/record-walkthrough.mjs
 * records the first-run journey from there.
 */
import { sql } from "drizzle-orm";
import {
  applicationsTable,
  bookmarksTable,
  companiesTable,
  db,
  jobsTable,
  notificationsTable,
  pool,
  profilesTable,
  settingsTable,
  type InsertJob,
} from "@workspace/db";
import { classifyJob, toRelevanceColumns } from "../relevance/classifier";
import { normalizeLocation, toLocationColumns } from "../relevance/location";
import { CAPTURE_CLERK_ID, postedDaysAgo } from "./capture-seed-id";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw new Error(
    `capture-seed only runs against a local database, not ${url.hostname}`,
  );
}

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);
const daysAhead = (d: number) => new Date(now.getTime() + d * DAY);

// Invented companies. The first ten match the landing's illustrative queue.
const COMPANIES = [
  "Northwind Labs",
  "Tallyfin",
  "Kestrel Cloud",
  "Orbit Retail",
  "Meridian Health",
  "Lumen Logistics",
  "Quill Commerce",
  "Paper Trail",
  "Harbor Systems",
  "Sable Analytics",
  "Cobalt Freight",
  "Juniper Pay",
  "Fernway Travel",
  "Atlas Grid",
  "Pebble Learning",
  "Saffron Foods",
  "Vantage Mobility",
  "Ironleaf Security",
];

const CITIES = [
  "Bengaluru",
  "Hyderabad",
  "Pune",
  "Gurugram",
  "Chennai",
  "Mumbai",
  "Noida",
  "Remote, India",
];

const TITLES: Array<[string, "internship" | "full_time"]> = [
  ["Software Engineer, New Grad", "full_time"],
  ["SDE Intern, Payments", "internship"],
  ["Graduate Engineer, Platform", "full_time"],
  ["Backend Engineer I", "full_time"],
  ["Software Engineer Intern", "internship"],
  ["Associate Software Engineer", "full_time"],
  ["SDE 1, Search", "full_time"],
  ["Frontend Engineer, Early Career", "full_time"],
  ["Software Developer, Graduate", "full_time"],
  ["Data Engineer Intern", "internship"],
  ["Full Stack Engineer, Entry Level", "full_time"],
  ["Mobile Engineer Intern", "internship"],
  ["Site Reliability Engineer, New Grad", "full_time"],
  ["Machine Learning Engineer Intern", "internship"],
  // A few the classifier keeps out of a fresher's queue.
  ["Senior Software Engineer", "full_time"],
  ["Staff Engineer, Infrastructure", "full_time"],
  ["Software Engineer II", "full_time"],
];

function derive(job: InsertJob): InsertJob {
  const location = toLocationColumns(
    normalizeLocation(job.location, job.country, {
      providerRemote: job.workMode === "remote",
    }),
  );
  const relevance = toRelevanceColumns(
    classifyJob({
      title: job.title,
      jobType: job.jobType,
      isIndia: location.isIndia,
      isRemote: location.isRemote,
      deadline: job.deadline,
      postedDate: job.postedDate,
    }),
  );
  return { ...job, ...location, ...relevance };
}

async function main() {
  await db.execute(
    sql`truncate table notifications, bookmarks, applications, job_dismissals, jobs, companies, profiles, settings restart identity cascade`,
  );

  const companies = await db
    .insert(companiesTable)
    .values(
      COMPANIES.map((name) => ({
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        industry: "Technology",
      })),
    )
    .returning({ id: companiesTable.id, name: companiesTable.name });

  // A deterministic spread: every company gets three or four roles.
  const jobs: InsertJob[] = [];
  let n = 0;
  companies.forEach((c, ci) => {
    for (let k = 0; k < 3 + (ci % 2); k++) {
      const [title, jobType] = TITLES[(ci * 3 + k) % TITLES.length]!;
      const city = CITIES[(ci + k) % CITIES.length]!;
      n += 1;
      jobs.push(
        derive({
          companyId: c.id,
          title,
          jobType,
          workMode: city.startsWith("Remote")
            ? "remote"
            : n % 3 === 0
              ? "hybrid"
              : "onsite",
          location: city,
          country: "India",
          status: "active",
          postedDate: daysAgo(postedDaysAgo(n)),
          // Sources rarely publish deadlines. Two here do, so the dashboard's
          // closing-soon card has something to show without the demo
          // pretending deadlines are common.
          deadline: n === 12 || n === 40 ? daysAhead(n === 12 ? 2 : 5) : null,
          sourcePlatform: "greenhouse",
          sourceUrl: `https://example.test/capture/${n}`,
          applyUrl: `https://example.test/capture/${n}/apply`,
          stipend: jobType === "internship" ? 40000 + (n % 5) * 10000 : null,
          salaryMin:
            jobType === "full_time" ? 1200000 + (n % 6) * 200000 : null,
          salaryMax:
            jobType === "full_time" ? 1800000 + (n % 6) * 250000 : null,
          currency: "INR",
          description:
            "Build and ship product features with a small team. Invented posting for a demo account.",
        }),
      );
    }
  });
  const inserted = await db.insert(jobsTable).values(jobs).returning({
    id: jobsTable.id,
    companyId: jobsTable.companyId,
    title: jobsTable.title,
    eligible: jobsTable.isFresherEligible,
  });

  if (process.env.CAPTURE_NEW_USER === "1") {
    await db.insert(profilesTable).values({
      clerkId: CAPTURE_CLERK_ID,
      name: "Demo Student",
      email: "demo@example.test",
      skills: [],
    });
    console.log(`seeded ${inserted.length} jobs and a brand-new account`);
    await pool.end();
    return;
  }

  await db.insert(profilesTable).values({
    clerkId: CAPTURE_CLERK_ID,
    rolePreference: "both",
    preferredLocations: ["anywhere"],
    name: "Demo Student",
    email: "demo@example.test",
    college: "Example Institute of Technology",
    degree: "B.Tech",
    branch: "CSE",
    graduationYear: 2027,
    cgpa: 8.4,
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Java"],
    resumeUrl: "https://example.test/demo-resume.pdf",
    linkedinUrl: "https://example.test/demo-linkedin",
    githubUrl: "https://example.test/demo-github",
  });
  await db.insert(settingsTable).values({
    clerkId: CAPTURE_CLERK_ID,
    dailyApplicationTarget: 10,
    timezone: "Asia/Kolkata",
    theme: "dark",
  });

  // Applications across every board stage, spread over three weeks so the
  // activity chart has a shape.
  const eligible = inserted.filter((j) => j.eligible);
  const stages = [
    "applied",
    "applied",
    "applied",
    "oa_pending",
    "oa_completed",
    "interview_pending",
    "interview_completed",
    "offered",
    "rejected",
    "saved",
    "saved",
    "applied",
    "oa_pending",
  ] as const;
  // Skip the first rows so the queue keeps its strongest roles.
  const applied = eligible.slice(14, 14 + stages.length);
  await db.insert(applicationsTable).values(
    applied.map((job, i) => ({
      clerkId: CAPTURE_CLERK_ID,
      jobId: job.id,
      status: stages[i]!,
      appliedDate: stages[i] === "saved" ? null : daysAgo(2 + i * 1.5),
      referralName: i === 5 ? "Alumni referral" : null,
      referralStatus: i === 5 ? "received" : "none",
      followUpDate: i === 3 ? daysAhead(2) : null,
      notes:
        i === 5
          ? "Two rounds: DSA, then a system design discussion. Revise graphs."
          : null,
    })),
  );

  // Two applications today, so the counter and streak read as in use.
  const today = eligible.slice(30, 32);
  await db.insert(applicationsTable).values(
    today.map((job) => ({
      clerkId: CAPTURE_CLERK_ID,
      jobId: job.id,
      status: "applied" as const,
      appliedDate: new Date(now.getTime() - 60 * 60 * 1000),
    })),
  );

  // Bookmarks make dream companies.
  await db
    .insert(bookmarksTable)
    .values(
      [eligible[0], eligible[4], eligible[9]]
        .filter(Boolean)
        .map((job) => ({ clerkId: CAPTURE_CLERK_ID, jobId: job!.id })),
    );

  await db.insert(notificationsTable).values([
    {
      clerkId: CAPTURE_CLERK_ID,
      type: "deadline_reminder",
      title: "Closes within 24 hours",
      message: `${eligible[2]?.title ?? "A saved role"} closes within 24 hours. You have not applied yet.`,
    },
  ]);

  console.log(
    `seeded ${companies.length} companies, ${inserted.length} jobs (${eligible.length} fresher-eligible), ${applied.length + today.length} applications`,
  );
  await pool.end();
}

void main();
