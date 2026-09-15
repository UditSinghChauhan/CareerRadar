import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Real Postgres (PGlite). These assertions are about per-user scoping and
// about which columns leave the repository — both are properties of the query
// itself, which a mocked `db` cannot exercise.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import { db, notificationsTable } from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { notificationsRepository } from "./notifications.repository";

const MINE = "user_bell_spec";
const THEIRS = "user_someone_else";

const PAGE = { page: 1, limit: 20 };

async function seed(
  clerkId: string,
  overrides: Partial<typeof notificationsTable.$inferInsert> = {},
) {
  const [row] = await db
    .insert(notificationsTable)
    .values({
      clerkId,
      title: "Closes within 3 days",
      message: "SDE Intern at Acme Corp closes within 3 days.",
      type: "deadline_reminder",
      ...overrides,
    })
    .returning();
  return row;
}

describe("notifications repository", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
  });

  it("returns only the caller's own notifications", async () => {
    await seed(MINE, { title: "Mine" });
    await seed(THEIRS, { title: "Theirs" });

    const page = await notificationsRepository.findAll(MINE, {}, PAGE);

    expect(page.data).toHaveLength(1);
    expect(page.data[0].title).toBe("Mine");
    expect(page.meta.total).toBe(1);
  });

  it("never returns the generator's dedupe key to a caller", async () => {
    // dedupeKey is internal bookkeeping. It is on the row and deliberately
    // absent from notificationColumns — this is the assertion that keeps it
    // that way when someone later adds a field to the payload.
    const row = await seed(MINE, { dedupeKey: "deadline:job_1:24h" });
    expect(row.dedupeKey).toBe("deadline:job_1:24h");

    const page = await notificationsRepository.findAll(MINE, {}, PAGE);
    expect(page.data[0]).not.toHaveProperty("dedupeKey");

    const single = await notificationsRepository.findById(row.id, MINE);
    expect(single).not.toHaveProperty("dedupeKey");
  });

  it("orders newest first", async () => {
    await seed(MINE, {
      title: "Older",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    await seed(MINE, {
      title: "Newer",
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
    });

    const page = await notificationsRepository.findAll(MINE, {}, PAGE);
    expect(page.data.map((n) => n.title)).toEqual(["Newer", "Older"]);
  });

  it("filters to unread when asked", async () => {
    await seed(MINE, { title: "Read one", isRead: true });
    await seed(MINE, { title: "Unread one" });

    const page = await notificationsRepository.findAll(
      MINE,
      { unreadOnly: true },
      PAGE,
    );
    expect(page.data.map((n) => n.title)).toEqual(["Unread one"]);
  });

  it("counts every unread row, not just the visible page", async () => {
    // The badge would otherwise read "2" forever on a user with 50 unread
    // notifications and a page size of 2.
    for (let i = 0; i < 5; i++) await seed(MINE, { title: `n${i}` });
    await seed(MINE, { title: "read", isRead: true });
    await seed(THEIRS);

    expect(await notificationsRepository.countUnread(MINE)).toBe(5);

    const page = await notificationsRepository.findAll(
      MINE,
      {},
      {
        page: 1,
        limit: 2,
      },
    );
    expect(page.data).toHaveLength(2);
    expect(await notificationsRepository.countUnread(MINE)).toBe(5);
  });

  describe("markRead", () => {
    it("marks one row read and returns it", async () => {
      const row = await seed(MINE);

      const updated = await notificationsRepository.markRead(row.id, MINE);

      expect(updated?.isRead).toBe(true);
      expect(await notificationsRepository.countUnread(MINE)).toBe(0);
    });

    it("is idempotent — a second click is not an error", async () => {
      const row = await seed(MINE);
      await notificationsRepository.markRead(row.id, MINE);

      const again = await notificationsRepository.markRead(row.id, MINE);

      expect(again?.isRead).toBe(true);
    });

    it("refuses another user's notification, and does not modify it", async () => {
      const theirs = await seed(THEIRS);

      const result = await notificationsRepository.markRead(theirs.id, MINE);

      // "Not found" rather than "forbidden": a distinguishable answer would
      // let anyone probe for other people's notification ids.
      expect(result).toBeNull();
      expect(await notificationsRepository.countUnread(THEIRS)).toBe(1);
    });
  });

  describe("markAllRead", () => {
    it("returns how many rows actually changed", async () => {
      await seed(MINE);
      await seed(MINE);
      await seed(MINE, { isRead: true });

      expect(await notificationsRepository.markAllRead(MINE)).toBe(2);
      // Nothing left to change.
      expect(await notificationsRepository.markAllRead(MINE)).toBe(0);
    });

    it("leaves other users' notifications alone", async () => {
      await seed(MINE);
      await seed(THEIRS);

      await notificationsRepository.markAllRead(MINE);

      expect(await notificationsRepository.countUnread(THEIRS)).toBe(1);
    });
  });

  describe("deleteAll", () => {
    it("removes every one of the caller's rows and returns the count", async () => {
      await seed(MINE);
      await seed(MINE, { isRead: true });

      expect(await notificationsRepository.deleteAll(MINE)).toBe(2);
      expect(
        (await notificationsRepository.findAll(MINE, {}, PAGE)).data,
      ).toHaveLength(0);
    });

    it("leaves other users' rows alone", async () => {
      await seed(MINE);
      await seed(THEIRS);

      await notificationsRepository.deleteAll(MINE);

      expect(
        (await notificationsRepository.findAll(THEIRS, {}, PAGE)).data,
      ).toHaveLength(1);
    });

    it("lets a cleared notification be generated again", async () => {
      // Clearing is not "silence this forever": the dedupe row goes with it, so
      // the next pass that still sees the deadline re-announces it.
      const row = {
        clerkId: MINE,
        title: "Closes within 24 hours",
        message: "x",
        type: "deadline_reminder" as const,
        dedupeKey: "deadline:job_1:24h",
      };
      await notificationsRepository.createMany([row]);
      await notificationsRepository.deleteAll(MINE);

      expect(await notificationsRepository.createMany([row])).toBe(1);
    });
  });

  describe("createMany", () => {
    it("collapses a repeated dedupe key to one row", async () => {
      const row = {
        clerkId: MINE,
        title: "Closes within 24 hours",
        message: "x",
        type: "deadline_reminder" as const,
        dedupeKey: "deadline:job_1:24h",
      };

      expect(await notificationsRepository.createMany([row])).toBe(1);
      expect(await notificationsRepository.createMany([row])).toBe(0);
      expect(
        (await notificationsRepository.findAll(MINE, {}, PAGE)).data,
      ).toHaveLength(1);
    });

    it("lets two users each receive the same dedupe key", async () => {
      // The constraint is (clerk_id, dedupe_key). One person reading about a
      // deadline must not silence it for everyone else.
      const base = {
        title: "Closes within 24 hours",
        message: "x",
        type: "deadline_reminder" as const,
        dedupeKey: "deadline:job_1:24h",
      };

      expect(
        await notificationsRepository.createMany([
          { ...base, clerkId: MINE },
          { ...base, clerkId: THEIRS },
        ]),
      ).toBe(2);
    });

    it("never deduplicates rows that carry no dedupe key", async () => {
      // NULLs are distinct in a unique constraint, which is what keeps a
      // hand-written notification from being collapsed into another one.
      const row = {
        clerkId: MINE,
        title: "System",
        message: "x",
        type: "system" as const,
      };

      expect(await notificationsRepository.createMany([row, row])).toBe(2);
    });

    it("writes nothing, and issues no statement, for an empty list", async () => {
      expect(await notificationsRepository.createMany([])).toBe(0);
    });
  });
});
