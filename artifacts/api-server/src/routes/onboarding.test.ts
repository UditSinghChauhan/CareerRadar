import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";

/**
 * The first minute after sign-up, through the real routes and real SQL
 * (PGlite): a brand-new account has no profile row, answers the one
 * onboarding question with PUT /api/profile, and the very next
 * GET /api/dashboard/today is a full queue of ten, with the roles that match
 * the answer first and a plain reason on every row.
 */
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(),
  // The profile row is created from the Clerk user on first read.
  createClerkClient: () => ({
    users: {
      getUser: async () => ({
        firstName: "New",
        lastName: "Student",
        username: null,
        primaryEmailAddressId: "e1",
        emailAddresses: [{ id: "e1", emailAddress: "new@example.test" }],
      }),
    },
  }),
}));

import { getAuth } from "@clerk/express";
import { companiesTable, db, jobsTable } from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import profileRouter from "./profile";
import dashboardRouter from "./dashboard";

const NEW_USER = "user_brand_new";
const DAY = 24 * 60 * 60 * 1000;

let testDb: TestDb;
let server: Server;
let baseUrl: string;

async function seedJobs() {
  const [co] = await db
    .insert(companiesTable)
    .values({ name: "Invented Co", slug: "invented-co" })
    .returning({ id: companiesTable.id });
  const rows: Array<{
    title: string;
    jobType: "internship" | "full_time";
    metro: string | null;
    city: string | null;
    remote?: boolean;
    score: number;
  }> = [
    // Three internships in Pune: what the new user asks for.
    {
      title: "SDE Intern A",
      jobType: "internship",
      metro: "Pune",
      city: "Pune",
      score: 80,
    },
    {
      title: "SDE Intern B",
      jobType: "internship",
      metro: "Pune",
      city: "Pune",
      score: 75,
    },
    {
      title: "SDE Intern C",
      jobType: "internship",
      metro: null,
      city: null,
      remote: true,
      score: 70,
    },
    // Higher scored, but not what they asked for.
    ...Array.from({ length: 9 }, (_, i) => ({
      title: `Graduate Engineer ${i}`,
      jobType: "full_time" as const,
      metro: "Bengaluru",
      city: "Bengaluru",
      score: 100 - i,
    })),
    {
      title: "Intern, Chennai",
      jobType: "internship",
      metro: "Chennai",
      city: "Chennai",
      score: 99,
    },
  ];
  await db.insert(jobsTable).values(
    rows.map((r, i) => ({
      companyId: co!.id,
      title: r.title,
      jobType: r.jobType,
      workMode: r.remote ? ("remote" as const) : ("onsite" as const),
      status: "active" as const,
      relevanceScore: r.score,
      relevanceTrack: r.jobType === "internship" ? "internship" : "new_grad",
      isFresherEligible: true,
      locationMetro: r.metro,
      locationCity: r.city,
      isRemote: Boolean(r.remote),
      postedDate: new Date(Date.now() - 2 * DAY),
      sourcePlatform: "greenhouse",
      sourceUrl: `https://example.test/job/${i}`,
      applyUrl: "https://example.test/apply",
    })),
  );
}

beforeAll(async () => {
  testDb = await getTestDb();
  const app: Express = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { log: { error: () => void } }).log = {
      error: () => {},
    };
    next();
  });
  app.use("/api", profileRouter);
  app.use("/api", dashboardRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  await truncateAll(testDb);
  vi.mocked(getAuth).mockReturnValue({
    userId: NEW_USER,
  } as unknown as ReturnType<typeof getAuth>);
  await seedJobs();
});

interface ProfileBody {
  rolePreference: string | null;
  preferredLocations: string[];
}
interface QueueBody {
  items: Array<{ job: { title: string }; reasons: string[]; priority: number }>;
}

const put = (body: unknown) =>
  fetch(`${baseUrl}/api/profile`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("onboarding", () => {
  it("a brand-new account has not answered yet", async () => {
    const res = await fetch(`${baseUrl}/api/profile`);
    expect(res.status).toBe(200);
    const profile = (await res.json()) as ProfileBody;
    expect(profile.rolePreference).toBeNull();
    expect(profile.preferredLocations).toEqual([]);
  });

  it("saves the answer in one request", async () => {
    const res = await put({
      rolePreference: "internship",
      preferredLocations: ["Pune", "remote"],
    });
    expect(res.status).toBe(200);
    const profile = (await res.json()) as ProfileBody;
    expect(profile.rolePreference).toBe("internship");
    expect(profile.preferredLocations).toEqual(["Pune", "remote"]);
  });

  it("rejects a role type or a city it does not offer", async () => {
    expect((await put({ rolePreference: "senior" })).status).toBe(400);
    expect((await put({ preferredLocations: ["Atlantis"] })).status).toBe(400);
  });
});

describe("a new user lands on a populated queue", () => {
  it("shows ten roles right after onboarding, the matches first", async () => {
    await put({
      rolePreference: "internship",
      preferredLocations: ["Pune", "remote"],
    });
    const res = await fetch(`${baseUrl}/api/dashboard/today`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as QueueBody;
    const titles = body.items.map(
      (i: { job: { title: string } }) => i.job.title,
    );

    // Full, even though only three roles match exactly.
    expect(body.items).toHaveLength(10);
    expect(titles.slice(0, 3)).toEqual([
      "SDE Intern A",
      "SDE Intern B",
      "SDE Intern C",
    ]);
    // Every row carries at least one human reason.
    for (const item of body.items)
      expect(item.reasons.length).toBeGreaterThan(0);
    // The rows that fill the rest say why they are there anyway.
    const rest = body.items.slice(3) as Array<{
      reasons: string[];
      job: { title: string };
    }>;
    for (const item of rest) {
      expect(
        item.reasons.some((r) =>
          [
            "Full-time, not an internship",
            "In Chennai, outside your cities",
          ].includes(r),
        ),
      ).toBe(true);
    }
  });

  it("is full and in plain priority order when the user chose both and anywhere", async () => {
    await put({ rolePreference: "both", preferredLocations: ["anywhere"] });
    const body = (await (
      await fetch(`${baseUrl}/api/dashboard/today`)
    ).json()) as QueueBody;
    expect(body.items).toHaveLength(10);
    const priorities = body.items.map((i: { priority: number }) => i.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    for (const item of body.items as Array<{ reasons: string[] }>) {
      expect(item.reasons.join(" ")).not.toMatch(/outside your cities|not an/);
    }
  });

  it("is full before onboarding too, so the dashboard is never empty", async () => {
    const body = (await (
      await fetch(`${baseUrl}/api/dashboard/today`)
    ).json()) as QueueBody;
    expect(body.items).toHaveLength(10);
  });
});
