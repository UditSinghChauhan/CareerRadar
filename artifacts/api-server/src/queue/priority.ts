/**
 * Daily-queue priority (Phase 3.1)
 * ─────────────────────────────────
 * One number per job, from four components, exactly as UPGRADE.md §3.1 sets
 * them out:
 *
 *   priority = relevanceScore    * 0.40
 *            + deadlineUrgency   * 0.30
 *            + freshness         * 0.20
 *            + dreamCompanyBoost * 0.10
 *
 * WHY THE WEIGHTS LIVE HERE AND THE SQL IS GENERATED FROM THEM
 * ───────────────────────────────────────────────────────────
 * The ranking has to happen in Postgres: the eligible set is ~1,500 rows and
 * the queue returns ten, so ordering in JavaScript would mean shipping every
 * row (descriptions included) to a 512 MB instance on every dashboard load.
 * But a formula written once in SQL and once in TypeScript is a formula that
 * will disagree with itself within a month. So the constants below are the
 * only definition, `priorityComponentsSql()` renders them into the query, and
 * `priorityFromComponents()` computes the same thing for tests and for the
 * reason strings. `daily-queue.test.ts` asserts the two agree row-for-row
 * against real Postgres.
 *
 * WHAT THE COMPONENTS ACTUALLY SEPARATE — MEASURED, NOT ASSUMED (2026-09-15,
 * live Neon table: 3,845 jobs, 3,386 active, 1,549 active + fresher-eligible)
 * ────────────────────────────────────────────────────────────────────────────
 *   · relevanceScore is SATURATED. 620 of the 1,549 eligible rows score
 *     exactly 100 — the classifier's modifiers cap there. Inside that band
 *     relevance contributes an identical 40.0 to every row and separates
 *     nothing. This is the whole reason the other three components exist.
 *
 *   · deadlineUrgency is INERT ON THIS DATA, and the API says so rather than
 *     hiding it. `deadline` is populated on 13 of 3,845 rows and on ZERO of
 *     the 1,549 eligible ones, because the ATS and aggregator APIs in use
 *     simply do not publish application deadlines. Every queue row therefore
 *     scores the spec's "10 if none" and contributes a constant 3.0. The
 *     component is kept, weighted as specified, and every row's reason string
 *     names the absence — a component that looks like it is working but is
 *     not is worse than one that is visibly idle. It starts doing real work
 *     the moment a provider with deadlines (or Phase 4 manual capture) lands.
 *
 *   · freshness is the ONLY component that separates inside the saturated
 *     band, and it does so genuinely: those 620 rows span 1 to 45 days old,
 *     which spreads their priority from 43.00 to 63.00 across 76 distinct
 *     values. It also moves on its own every day, which is what stops the
 *     queue being the same ten forever: a row at the 48-hour plateau
 *     (freshness 100) loses 0.71 priority per day as it ages, so the top of
 *     the queue turns over without anything being ingested at all.
 *
 *   · dreamCompanyBoost separates only once the user has bookmarks — it is
 *     the one component they control directly.
 *
 * The honest summary: on today's data the ranking is "most relevant first,
 * then newest, then bookmarked companies", and the deadline term is a
 * placeholder waiting for data. The components are returned per row so the UI
 * can show that instead of implying a precision that is not there.
 *
 * THE TIE PROBLEM, AND WHY THERE IS A ROTATION (measured 2026-09-15)
 * ─────────────────────────────────────────────────────────────────
 * The four components above produce a genuine spread ACROSS the eligible set
 * — 163 distinct priorities over 1,549 rows — but almost none AT THE TOP,
 * which is the only part a ten-row queue ever shows. Every one of the top ten
 * scored an identical 63.00: relevance 100 (saturated), deadline 10 (no
 * deadlines exist), freshness 100 (all inside the 48-hour plateau), dream 0
 * (no bookmarks). Fifteen rows tie there.
 *
 * With the spec's ordering alone the tie falls to `posted_date DESC, id`, and
 * that is not a tie-break so much as a freeze. Freshness is a monotone
 * function of `posted_date`, so it can never REORDER two rows — it can only
 * scale the gap between them. Running the real query against the live table
 * with the clock advanced 1, 2, 3, 5, 7 and 14 days returned THE SAME TEN
 * ROWS every time: 100% overlap at every horizon. The ranking contributes
 * exactly zero turnover. Ingestion (30–70 eligible rows a day) does refresh
 * the head in practice, but the consequence still stands: of the 620 rows
 * sitting at relevance 100, the ~610 that are not currently the newest are
 * unreachable forever, despite being exactly as relevant as the ten shown.
 *
 * So `tieBreakSql` below inserts a per-day deterministic shuffle BETWEEN
 * `priority DESC` and the old `posted_date DESC, id`. It is a tie-break, not
 * a reordering: it can only ever change the relative order of rows whose
 * priority is byte-identical, so the spec's ranking is preserved exactly.
 * Seeded by (job id, queue day) so that:
 *   · within a day the queue is stable — refreshing returns the same ten,
 *     which §3.3 requires ("dismissing removes it and it does not return");
 *   · across days the tied block rotates, so the long tail is reachable;
 *   · it needs no stored state, which matters on an instance that restarts
 *     whenever it spins down.
 * The day boundary is the USER'S day, not UTC — see `dailyQueueDay`.
 */

import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

/** §3.1, verbatim. These four are the only definition of the formula. */
export const PRIORITY_WEIGHTS = {
  relevanceScore: 0.4,
  deadlineUrgency: 0.3,
  freshness: 0.2,
  dreamCompanyBoost: 0.1,
} as const;

/** §3.1: "100 if <72h, 80 if <7d, 40 if <30d, 10 if none". */
export const DEADLINE_URGENCY = {
  within72h: 100,
  within7d: 80,
  within30d: 40,
  /** No deadline, a deadline further out than 30 days, or one already past. */
  none: 10,
} as const;

/** §3.1: "100 if posted <48h, decaying to 0 at 30 days". */
export const FRESHNESS = {
  /** Days of full marks before the decay starts. */
  plateauDays: 2,
  /** Days at which freshness reaches 0. */
  zeroDays: 30,
} as const;

export const DREAM_COMPANY_BOOST = 100;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface PriorityComponents {
  /** The stored `relevance_score`, 0–100. 0 when the row was never classified. */
  relevanceScore: number;
  /** 0–100 from `deadline`. See DEADLINE_URGENCY. */
  deadlineUrgency: number;
  /** 0–100 from `posted_date`. See FRESHNESS. */
  freshness: number;
  /** 100 when the job's company is one the user has bookmarked from, else 0. */
  dreamCompanyBoost: number;
}

/** Everything the plain-language reason needs that the numbers do not carry. */
export interface PriorityContext {
  /** Null when the posting published no deadline — the common case. */
  deadline: Date | null;
  /** Null when the provider gave no posted date. */
  postedDate: Date | null;
  /** How many rows collapsed into this one by (company, normalised title). */
  duplicateCount: number;
  now: Date;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Fractional days from `from` up to `now`. Negative when `from` is in the future. */
function ageDays(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / DAY_MS;
}

/** Fractional days from `now` until `until`. Negative once `until` is past. */
function daysUntil(until: Date, now: Date): number {
  return (until.getTime() - now.getTime()) / DAY_MS;
}

/**
 * §3.1's deadline buckets. A deadline already past scores `none` rather than
 * `within72h`: an expired deadline is not urgent, it is gone, and the
 * staleness sweep — not the queue — is what closes those rows.
 */
export function deadlineUrgency(
  deadline: Date | null | undefined,
  now: Date,
): number {
  if (!deadline) return DEADLINE_URGENCY.none;
  const msLeft = deadline.getTime() - now.getTime();
  if (msLeft < 0) return DEADLINE_URGENCY.none;
  if (msLeft < 72 * HOUR_MS) return DEADLINE_URGENCY.within72h;
  if (msLeft < 7 * DAY_MS) return DEADLINE_URGENCY.within7d;
  if (msLeft < 30 * DAY_MS) return DEADLINE_URGENCY.within30d;
  return DEADLINE_URGENCY.none;
}

/**
 * §3.1's freshness curve: full marks for the first 48 hours, then straight
 * down to 0 at 30 days.
 *
 * A row with no posted date scores 0 rather than something invented. Only 0
 * of the 1,549 currently eligible rows are in that state, so the fallback
 * costs nothing today; guessing a date would quietly promote rows whose age
 * is unknown.
 */
export function freshness(
  postedDate: Date | null | undefined,
  now: Date,
): number {
  if (!postedDate) return 0;
  const age = ageDays(postedDate, now);
  // A posted date in the future is a provider bug, not extra freshness.
  if (age <= FRESHNESS.plateauDays) return 100;
  if (age >= FRESHNESS.zeroDays) return 0;
  const span = FRESHNESS.zeroDays - FRESHNESS.plateauDays;
  return round2((100 * (FRESHNESS.zeroDays - age)) / span);
}

/** The weighted sum. The one place the four weights are applied in TypeScript. */
export function priorityFromComponents(c: PriorityComponents): number {
  return round2(
    c.relevanceScore * PRIORITY_WEIGHTS.relevanceScore +
      c.deadlineUrgency * PRIORITY_WEIGHTS.deadlineUrgency +
      c.freshness * PRIORITY_WEIGHTS.freshness +
      c.dreamCompanyBoost * PRIORITY_WEIGHTS.dreamCompanyBoost,
  );
}

/** The weighted contribution of each component, for the UI's breakdown. */
export function priorityContributions(
  c: PriorityComponents,
): PriorityComponents {
  return {
    relevanceScore: round2(c.relevanceScore * PRIORITY_WEIGHTS.relevanceScore),
    deadlineUrgency: round2(
      c.deadlineUrgency * PRIORITY_WEIGHTS.deadlineUrgency,
    ),
    freshness: round2(c.freshness * PRIORITY_WEIGHTS.freshness),
    dreamCompanyBoost: round2(
      c.dreamCompanyBoost * PRIORITY_WEIGHTS.dreamCompanyBoost,
    ),
  };
}

/**
 * One sentence per component, in weight order, saying what it contributed and
 * why — §3.3's "plain-language reason for its rank". Computed here, never in
 * the frontend, so the explanation and the ordering come from the same code.
 *
 * Components that did nothing still get a line. "No deadline published" is
 * the single most important thing this list says on today's data: without it
 * the user would read a 3.0 deadline contribution as a real signal.
 */
export function explainPriority(
  c: PriorityComponents,
  ctx: PriorityContext,
): string[] {
  const reasons: string[] = [];

  reasons.push(
    c.relevanceScore >= 100
      ? "Relevance 100/100 — top of the classifier's band, shared with hundreds of others, so the terms below decide the order"
      : `Relevance ${c.relevanceScore}/100`,
  );

  if (!ctx.deadline) {
    reasons.push(
      "No deadline published by the source — every row scores the same 10 here, so this term is not separating anything",
    );
  } else if (c.deadlineUrgency === DEADLINE_URGENCY.none) {
    const past = ctx.deadline.getTime() < ctx.now.getTime();
    reasons.push(
      past
        ? "Deadline has already passed"
        : "Deadline is more than 30 days out",
    );
  } else {
    const daysLeft = Math.max(0, Math.ceil(daysUntil(ctx.deadline, ctx.now)));
    reasons.push(
      c.deadlineUrgency === DEADLINE_URGENCY.within72h
        ? "Closes within 72 hours"
        : c.deadlineUrgency === DEADLINE_URGENCY.within7d
          ? `Closes in ${daysLeft} days`
          : `Closes in about ${daysLeft} days`,
    );
  }

  if (!ctx.postedDate) {
    reasons.push("No posted date from the source — scored as not fresh");
  } else {
    const age = ageDays(ctx.postedDate, ctx.now);
    reasons.push(
      age <= FRESHNESS.plateauDays
        ? "Posted in the last 48 hours"
        : age >= FRESHNESS.zeroDays
          ? `Posted ${Math.round(age)} days ago — past the 30-day freshness window`
          : `Posted ${Math.round(age)} days ago (freshness ${Math.round(c.freshness)}/100)`,
    );
  }

  if (c.dreamCompanyBoost > 0) {
    reasons.push("You have bookmarked a role at this company");
  }

  if (ctx.duplicateCount > 1) {
    reasons.push(
      `${ctx.duplicateCount} identical listings from this company collapsed into one`,
    );
  }

  return reasons;
}

// ─── The SQL side of the same formula ────────────────────────────────────────

/**
 * The (company_id, normalised title) dedupe key from §"Duplicates".
 *
 * Lower-cases, then collapses every run of non-alphanumerics to one space and
 * trims. That is what makes "Web Developer", "web developer" and
 * "Web  Developer!" one posting while leaving "Web Developer Internship
 * Ahmedabad" a different one — the goal is to collapse the same ad re-ingested
 * under different URLs, not to merge distinct roles.
 *
 * Kept in lock-step with `normalizedTitleSql()` below; `daily-queue.test.ts`
 * asserts both produce the same key for the same title.
 */
export function normalizeTitleForDedupe(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The Postgres expression for the same key. */
export function normalizedTitleSql(titleColumn: SQL | SQL.Aliased): SQL {
  return sql`btrim(regexp_replace(lower(${titleColumn}), '[^a-z0-9]+', ' ', 'g'))`;
}

/**
 * The date whose rotation a queue request belongs to: `now` rendered as
 * YYYY-MM-DD in `timezone`.
 *
 * The user's day, deliberately. Seeded on the UTC date the shuffle would
 * change at 05:30 every morning in Asia/Kolkata — the middle of the hour
 * someone actually works through — and the ten rows they were partway through
 * applying to would be replaced under them. On the local date it changes at
 * local midnight.
 */
export function dailyQueueDay(now: Date, timezone: string): string {
  try {
    // en-CA gives YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // An unknown zone must not fail the queue; UTC is a correct day, just not
    // the user's preferred one.
    return now.toISOString().slice(0, 10);
  }
}

/**
 * The per-day shuffle key for one row, as a hex string. Exported so
 * `daily-queue.test.ts` can assert Postgres's `md5()` and this agree.
 *
 * md5 is used as a cheap, stable hash with good dispersion, and it is
 * available in both Postgres and Node with no extension. Nothing here is
 * security-sensitive — the input is a job id the user can already see.
 */
export function tieBreakKey(jobId: string, queueDay: string): string {
  return createHash("md5").update(`${jobId}${queueDay}`).digest("hex");
}

/** The Postgres expression for the same key. */
export function tieBreakSql(
  idColumn: SQL | SQL.Aliased,
  queueDay: string,
): SQL<string> {
  return sql<string>`md5(${idColumn}::text || ${queueDay})`;
}

/**
 * The four component expressions and the weighted priority, rendered from the
 * constants at the top of this file. `now` is passed in rather than using
 * `now()` so a single request scores every row against one instant — and so
 * the tests can freeze the clock.
 *
 * `dreamCompanyIds` is an explicit id list rather than a correlated EXISTS
 * over bookmarks: the list is tiny (one row per bookmarked company) and
 * fetching it separately keeps this query a single pass over the jobs index.
 */
export function priorityComponentsSql(args: {
  relevanceScore: SQL | SQL.Aliased;
  deadline: SQL | SQL.Aliased;
  postedDate: SQL | SQL.Aliased;
  companyId: SQL | SQL.Aliased;
  dreamCompanyIds: string[];
  now: Date;
}): {
  relevanceScore: SQL<number>;
  deadlineUrgency: SQL<number>;
  freshness: SQL<number>;
  dreamCompanyBoost: SQL<number>;
  priority: SQL<number>;
} {
  const now = sql`${args.now.toISOString()}::timestamptz`;
  const { within72h, within7d, within30d, none } = DEADLINE_URGENCY;
  const { plateauDays, zeroDays } = FRESHNESS;
  const span = zeroDays - plateauDays;

  const relevanceScore = sql<number>`coalesce(${args.relevanceScore}, 0)::double precision`;

  const deadlineUrgency = sql<number>`(case
    when ${args.deadline} is null then ${none}
    when ${args.deadline} < ${now} then ${none}
    when ${args.deadline} < ${now} + interval '72 hours' then ${within72h}
    when ${args.deadline} < ${now} + interval '7 days' then ${within7d}
    when ${args.deadline} < ${now} + interval '30 days' then ${within30d}
    else ${none}
  end)::double precision`;

  // round(...::numeric, 2) mirrors round2() in TypeScript exactly; without the
  // cast Postgres's round() takes only one argument for double precision.
  const freshness = sql<number>`(case
    when ${args.postedDate} is null then 0
    when extract(epoch from (${now} - ${args.postedDate})) / 86400.0 <= ${plateauDays} then 100
    when extract(epoch from (${now} - ${args.postedDate})) / 86400.0 >= ${zeroDays} then 0
    else round(((100.0 * (${zeroDays} - extract(epoch from (${now} - ${args.postedDate})) / 86400.0)) / ${span})::numeric, 2)
  end)::double precision`;

  const dreamCompanyBoost =
    args.dreamCompanyIds.length > 0
      ? sql<number>`(case when ${args.companyId} in ${args.dreamCompanyIds} then ${DREAM_COMPANY_BOOST} else 0 end)::double precision`
      : sql<number>`0::double precision`;

  const priority = sql<number>`round((
      ${relevanceScore} * ${PRIORITY_WEIGHTS.relevanceScore}
    + ${deadlineUrgency} * ${PRIORITY_WEIGHTS.deadlineUrgency}
    + ${freshness} * ${PRIORITY_WEIGHTS.freshness}
    + ${dreamCompanyBoost} * ${PRIORITY_WEIGHTS.dreamCompanyBoost}
  )::numeric, 2)::double precision`;

  return {
    relevanceScore,
    deadlineUrgency,
    freshness,
    dreamCompanyBoost,
    priority,
  };
}
