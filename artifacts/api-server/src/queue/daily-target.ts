/**
 * The daily target counter and streak (Phase 3.3)
 * ───────────────────────────────────────────────
 * "4 / 10 applications today", with a streak, computed from
 * `applications.applied_date`.
 *
 * DAYS ARE THE USER'S DAYS
 * ────────────────────────
 * Every boundary here is evaluated in the timezone from `settings.timezone`
 * (default Asia/Kolkata), not UTC. An application logged at 01:00 IST is
 * 19:30 the previous day in UTC, so a UTC day boundary would show the counter
 * resetting at 05:30 every morning and would break the streak of anyone who
 * applies late at night — which, for a student, is most nights. Postgres does
 * the conversion (`at time zone`) so the bucketing and the comparison happen
 * in one place.
 *
 * ROWS WITH NO `applied_date` DO NOT COUNT. A "saved" application has not
 * been applied to; §3.3's counter is about work done, so only rows carrying a
 * date are counted, and they are counted on the day that date names.
 */

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { applicationsTable, db, settingsTable } from "@workspace/db";

/** §3.3: "Target configurable in settings, default 10." */
export const DEFAULT_DAILY_TARGET = 10;

export interface DailyProgress {
  /** Applications with an applied date falling on today, in `timezone`. */
  appliedToday: number;
  /** From settings; DEFAULT_DAILY_TARGET when the user has no settings row. */
  target: number;
  /**
   * Consecutive days, counting back, on which at least one application was
   * logged. Today counts when it has one; when it does not, the streak is
   * measured from yesterday — a day still in progress has not been missed
   * yet, and resetting the number to 0 every midnight would make it useless.
   */
  streakDays: number;
  /** The IANA zone every boundary above was evaluated in. */
  timezone: string;
}

/**
 * The distinct local dates on which the user logged an application, newest
 * first. Bounded to the last `days` days: a streak longer than that is not
 * information anyone needs, and it keeps the scan small.
 */
async function appliedDates(
  clerkId: string,
  timezone: string,
  days: number,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({
      day: sql<string>`to_char((${applicationsTable.appliedDate} at time zone ${timezone})::date, 'YYYY-MM-DD')`,
    })
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.clerkId, clerkId),
        isNotNull(applicationsTable.appliedDate),
        sql`(${applicationsTable.appliedDate} at time zone ${timezone})::date
              > ((now() at time zone ${timezone})::date - ${days}::int)`,
      ),
    )
    .orderBy(sql`1 desc`);
  return rows.map((r) => r.day);
}

/** Today's local date in `timezone`, as YYYY-MM-DD, straight from Postgres. */
async function localToday(timezone: string): Promise<string> {
  const [row] = await db
    .select({
      today: sql<string>`to_char((now() at time zone ${timezone})::date, 'YYYY-MM-DD')`,
    })
    .from(sql`(select 1) as one`);
  return row!.today;
}

/** YYYY-MM-DD, `n` days before `iso`. Pure; the streak walk uses it. */
export function shiftDay(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The streak, given the set of days that have an application and what today
 * is. Pure, so the boundary behaviour is unit-testable without a database.
 */
export function streakFrom(days: Set<string>, today: string): number {
  // A day still in progress with nothing logged has not broken anything.
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

const STREAK_WINDOW_DAYS = 400;

export async function dailyProgress(clerkId: string): Promise<DailyProgress> {
  const [settings] = await db
    .select({
      target: settingsTable.dailyApplicationTarget,
      timezone: settingsTable.timezone,
    })
    .from(settingsTable)
    .where(eq(settingsTable.clerkId, clerkId));

  const timezone = settings?.timezone ?? "Asia/Kolkata";
  const target = settings?.target ?? DEFAULT_DAILY_TARGET;

  const [today, dates] = await Promise.all([
    localToday(timezone),
    appliedDates(clerkId, timezone, STREAK_WINDOW_DAYS),
  ]);

  const [{ value: appliedToday }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.clerkId, clerkId),
        isNotNull(applicationsTable.appliedDate),
        sql`(${applicationsTable.appliedDate} at time zone ${timezone})::date
              = (now() at time zone ${timezone})::date`,
      ),
    );

  return {
    appliedToday: Number(appliedToday),
    target,
    streakDays: streakFrom(new Set(dates), today),
    timezone,
  };
}
