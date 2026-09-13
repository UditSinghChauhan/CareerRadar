import { describe, it, expect } from "vitest";
import type { Application } from "@workspace/api-client-react";
import { readStoredView, writeStoredView } from "../applications";
import { groupByStatus } from "@/components/applications/application-board";
import { sortApplications } from "@/components/applications/application-table";
import { deadlineUrgency, statusRank } from "@/components/applications/status";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: "app_1",
    clerkId: "user_1",
    jobId: "job_1",
    status: "saved",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as Application;
}

function withJob(
  id: string,
  company: string,
  title: string,
  extra: Partial<Application> = {},
  deadline: string | null = null,
): Application {
  return makeApplication({
    id,
    jobId: `job_${id}`,
    ...extra,
    job: {
      id: `job_${id}`,
      title,
      deadline,
      company: { name: company },
    },
  } as Partial<Application>);
}

// ─── View persistence ─────────────────────────────────────────────────────────

function fakeStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    store,
  };
}

describe("applications view persistence", () => {
  it("defaults to the board view when nothing is stored", () => {
    expect(readStoredView(fakeStorage())).toBe("board");
  });

  it("round-trips the table view through storage", () => {
    const storage = fakeStorage();
    writeStoredView("table", storage);
    expect(readStoredView(storage)).toBe("table");
  });

  it("falls back to board for a corrupted stored value", () => {
    const storage = fakeStorage({
      "careerradar:applications:view": "kanban-deluxe",
    });
    expect(readStoredView(storage)).toBe("board");
  });

  it("does not throw when storage access is blocked", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readStoredView(throwing)).toBe("board");
    expect(() => writeStoredView("table", throwing)).not.toThrow();
  });
});

// ─── Board grouping ───────────────────────────────────────────────────────────

describe("groupByStatus", () => {
  it("creates a bucket for every status, including empty ones", () => {
    const groups = groupByStatus([]);
    expect(Object.keys(groups)).toHaveLength(9);
    expect(groups.offered).toEqual([]);
  });

  it("places each application in its own status column", () => {
    const groups = groupByStatus([
      makeApplication({ id: "a", status: "applied" }),
      makeApplication({ id: "b", status: "offered" }),
      makeApplication({ id: "c", status: "applied" }),
    ]);

    expect(groups.applied.map((a) => a.id)).toEqual(["a", "c"]);
    expect(groups.offered.map((a) => a.id)).toEqual(["b"]);
    expect(groups.rejected).toEqual([]);
  });

  it("parks an unrecognised status in saved rather than dropping the row", () => {
    const groups = groupByStatus([
      makeApplication({ id: "x", status: "ghosted" as Application["status"] }),
    ]);
    expect(groups.saved.map((a) => a.id)).toEqual(["x"]);
  });
});

// ─── Table sorting ────────────────────────────────────────────────────────────

describe("sortApplications", () => {
  const rows = [
    withJob("1", "Zoho", "Backend Intern", {
      appliedDate: "2026-09-03T00:00:00.000Z",
      status: "offered",
    }),
    withJob("2", "Atlassian", "SDE Intern", {
      appliedDate: "2026-09-01T00:00:00.000Z",
      status: "applied",
    }),
    withJob("3", "Meesho", "Frontend Intern", { status: "saved" }),
  ];

  it("sorts by company name ascending and descending", () => {
    expect(
      sortApplications(rows, "company", "asc").map((a) => a.job?.company?.name),
    ).toEqual(["Atlassian", "Meesho", "Zoho"]);
    expect(
      sortApplications(rows, "company", "desc").map(
        (a) => a.job?.company?.name,
      ),
    ).toEqual(["Zoho", "Meesho", "Atlassian"]);
  });

  it("sorts by role title", () => {
    expect(
      sortApplications(rows, "role", "asc").map((a) => a.job?.title),
    ).toEqual(["Backend Intern", "Frontend Intern", "SDE Intern"]);
  });

  it("sorts by status in pipeline order, not alphabetically", () => {
    expect(
      sortApplications(rows, "status", "asc").map((a) => a.status),
    ).toEqual(["saved", "applied", "offered"]);
  });

  it("keeps rows with no applied date last in both directions", () => {
    expect(
      sortApplications(rows, "appliedDate", "asc").map((a) => a.id),
    ).toEqual(["2", "1", "3"]);
    expect(
      sortApplications(rows, "appliedDate", "desc").map((a) => a.id),
    ).toEqual(["1", "2", "3"]);
  });

  it("does not mutate the input array", () => {
    const original = [...rows];
    sortApplications(rows, "company", "desc");
    expect(rows).toEqual(original);
  });
});

// ─── Deadline urgency ─────────────────────────────────────────────────────────

describe("deadlineUrgency", () => {
  const now = Date.parse("2026-09-13T12:00:00.000Z");

  it("reports none when there is no deadline", () => {
    expect(deadlineUrgency(null, now)).toBe("none");
    expect(deadlineUrgency(undefined, now)).toBe("none");
  });

  it("treats anything inside 72h as critical", () => {
    expect(deadlineUrgency("2026-09-14T12:00:00.000Z", now)).toBe("critical");
    expect(deadlineUrgency("2026-09-16T11:00:00.000Z", now)).toBe("critical");
  });

  it("treats just over 72h as soon, not critical", () => {
    expect(deadlineUrgency("2026-09-16T13:00:00.000Z", now)).toBe("soon");
  });

  it("flags past deadlines as expired", () => {
    expect(deadlineUrgency("2026-09-12T12:00:00.000Z", now)).toBe("expired");
  });
});

describe("statusRank", () => {
  it("orders saved before applied before offered", () => {
    expect(statusRank("saved")).toBeLessThan(statusRank("applied"));
    expect(statusRank("applied")).toBeLessThan(statusRank("offered"));
  });

  it("sorts an unknown status to the end", () => {
    expect(statusRank("ghosted")).toBeGreaterThan(statusRank("withdrawn"));
  });
});
