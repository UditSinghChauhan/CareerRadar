import { and, count, desc, eq } from "drizzle-orm";
import {
  db,
  notificationsTable,
  type InsertNotification,
  type Notification,
} from "@workspace/db";
import { type PaginationParams, buildPaginatedResult } from "../lib/pagination";
import { notificationColumns } from "./columns";

/**
 * What the API returns for a notification. `dedupeKey` is on the row but not in
 * `notificationColumns`, so it never reaches the browser — see ./columns.ts.
 */
export type NotificationView = Omit<Notification, "dedupeKey">;

export interface NotificationFilters {
  unreadOnly?: boolean;
}

export const notificationsRepository = {
  async findAll(
    clerkId: string,
    filters: NotificationFilters,
    pagination: PaginationParams,
  ) {
    const conditions = [eq(notificationsTable.clerkId, clerkId)];
    if (filters.unreadOnly) {
      conditions.push(eq(notificationsTable.isRead, false));
    }
    const where = and(...conditions);
    const offset = (pagination.page - 1) * pagination.limit;

    const [rows, countResult] = await Promise.all([
      db
        .select(notificationColumns)
        .from(notificationsTable)
        .where(where)
        .orderBy(desc(notificationsTable.createdAt))
        .limit(pagination.limit)
        .offset(offset),
      db.select({ value: count() }).from(notificationsTable).where(where),
    ]);

    return buildPaginatedResult(
      rows as NotificationView[],
      Number(countResult[0].value),
      pagination,
    );
  },

  /**
   * The bell's badge. Counts every unread row the user has, independently of
   * whatever page or filter the popover is showing — a badge that only counted
   * the visible page would read "20" forever.
   */
  async countUnread(clerkId: string): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.clerkId, clerkId),
          eq(notificationsTable.isRead, false),
        ),
      );
    return Number(value);
  },

  async findById(
    id: string,
    clerkId: string,
  ): Promise<NotificationView | null> {
    const [row] = await db
      .select(notificationColumns)
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.id, id),
          eq(notificationsTable.clerkId, clerkId),
        ),
      );
    return (row as NotificationView | undefined) ?? null;
  },

  /**
   * Returns the row after the update, or null when the id does not belong to
   * this user — which is the same answer as "does not exist", deliberately, so
   * the endpoint cannot be used to probe for other people's notification ids.
   *
   * Marking an already-read row updates zero columns of meaning and still
   * returns it, so a double click is a no-op rather than a 404.
   */
  async markRead(
    id: string,
    clerkId: string,
  ): Promise<NotificationView | null> {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(
        and(
          eq(notificationsTable.id, id),
          eq(notificationsTable.clerkId, clerkId),
        ),
      );
    return this.findById(id, clerkId);
  },

  /** Number of rows that actually changed from unread to read. */
  async markAllRead(clerkId: string): Promise<number> {
    const rows = await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(
        and(
          eq(notificationsTable.clerkId, clerkId),
          eq(notificationsTable.isRead, false),
        ),
      )
      .returning({ id: notificationsTable.id });
    return rows.length;
  },

  /**
   * "Clear all". Deletes every row belonging to this user and returns the
   * count. Scoped by clerkId in the WHERE, not by a prior read, so there is no
   * window in which it could take out somebody else's rows.
   */
  async deleteAll(clerkId: string): Promise<number> {
    const rows = await db
      .delete(notificationsTable)
      .where(eq(notificationsTable.clerkId, clerkId))
      .returning({ id: notificationsTable.id });
    return rows.length;
  },

  /**
   * Insert-if-new, for the generator.
   *
   * The conflict target is `(clerk_id, dedupe_key)`. Rows whose `dedupeKey` is
   * null never conflict — Postgres treats NULLs in a unique constraint as
   * distinct — so a caller that omits the key always gets a new row, which is
   * what a one-off notification wants.
   *
   * Returns how many rows were actually written, so the generator can report a
   * real number instead of the number it attempted.
   */
  async createMany(rows: InsertNotification[]): Promise<number> {
    if (rows.length === 0) return 0;
    const inserted = await db
      .insert(notificationsTable)
      .values(rows)
      .onConflictDoNothing({
        target: [notificationsTable.clerkId, notificationsTable.dedupeKey],
      })
      .returning({ id: notificationsTable.id });
    return inserted.length;
  },
};
