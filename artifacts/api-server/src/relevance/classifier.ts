/**
 * Relevance classifier (Phase 2.1)
 * ─────────────────────────────────
 * Sorts every posting into one of four tracks — internship, new_grad,
 * early_career, not_relevant — and scores it 0–100 for a final-year student
 * hunting SDE internships and fresher roles in India. Deterministic rules,
 * no LLM: the same input always yields the same output, which is what lets
 * the backfill recompute every row on every run.
 *
 * TWO SIGNALS, NEITHER SUFFICIENT ALONE (measured on the live table, 2026-09-15)
 * ──────────────────────────────────────────────────────────────────────────
 *   job_type = 'internship'                          956 active rows
 *   whole-word title match (intern/trainee/…)        913
 *   both                                             875
 *   jobType only, no whole-word title match           81
 *
 * The provider-supplied `jobType` is a signal in its own right — Lever's
 * `commitment`, Ashby's `employmentType` and JSearch's `job_employment_type`
 * carry "Intern" even when the title does not ("Software engineering
 * internAI India"). But 64 of those 81 jobType-only rows are the substring bug
 * in the old `inferJobType`: "Internal Audit Manager", "International Voice
 * Process". So jobType counts as internship UNLESS the title's only "intern"
 * is inside internal/international/internet — then it is echo, not evidence,
 * and is ignored with a signal saying so. Every title regex here is
 * word-bounded for the same reason.
 *
 * PRIORITY
 * ────────
 *   1. A whole-word intern/trainee/apprentice/co-op title → internship, even
 *      when the title also says Senior. "Senior Software Engineer Intern" is
 *      an internship (UPGRADE.md §2.1, non-negotiable).
 *   2. Seniority / level / years in the title, or experienceMin ≥ 2 →
 *      not_relevant, score 0, seniorityExcluded.
 *   3. Untainted provider jobType 'internship' → internship.
 *   4. New-grad markers in the title (fresher, graduate, campus, SDE 1, …) →
 *      new_grad. Fresher markers in the DESCRIPTION count too, but only when
 *      the title names an engineering role — "Office Maid, freshers welcome"
 *      must not become new_grad.
 *   5. No seniority, experience ≤ 2 or unstated, and an engineering role noun
 *      in the title → early_career.
 *   6. Everything else → not_relevant.
 *
 * SCORE (0–100)
 * ─────────────
 * Track base internship 90 / new_grad 85 / early_career 60, then the
 * modifiers from §2.1: isIndia +10, isRemote +5, batch match +10, deadline
 * present +5, posted ≤ 7 days +10, posted > 45 days −20, batch names a year
 * that excludes the user −40 (job text is sloppy — demote, don't exclude).
 *
 * BATCH TEXT IS OFTEN INCLUSIVE OF THE USER (measured on the 71 live rows the
 * −40 hit on 2026-09-15). "2026 freshers & final-year student" names 2026 but
 * is addressed to whoever is in their final year right now — which in
 * September 2026 is the 2027 batch. So, before the −40:
 *   · "final-year student(s)" (not "pre-final") → explicitly addressed,
 *     +15 — above the generic match, because the posting is talking to the
 *     user. Anchored to the calendar: final year = the academic year in
 *     progress, June to May.
 *   · "2025 or later" / "2025 onwards" / "2025+" / "2025 and above" → an
 *     open-ended lower bound; a year at or above it is a match, +10.
 *   · "2025-2028" → a range covers every year in it, not just the ends.
 *   · "pursuing" → current students are welcome; a named year no longer
 *     penalises, but nothing is added either — the word is boilerplate.
 *     Unless the year says "only" ("2026 Graduates Only"): an explicit
 *     restriction beats boilerplate, and the −40 stands.
 * Three modifiers the spec does not list, added so the ranking survives the
 * live data: a title with no engineering role noun −15, an explicitly
 * non-technical title (voice process, BPO, sales, HR, …) −20, and an on-site
 * posting scoped to another country (isIndia false, not remote) −25. Without
 * them "International Process Associate" internships and a Maryland SDE
 * internship both tie an India SDE internship at the 100 cap. isIndia null
 * is never penalised — unknown stays reviewable (§2.0 rule 6).
 * Each modifier that fires is named in `signals`.
 *
 * `isIndia` / `isRemote` are the Phase 2.0 columns. `jobs.country` is never
 * an input here — see relevance/location.ts for why.
 */

export type RelevanceTrack =
  | "internship"
  | "new_grad"
  | "early_career"
  | "not_relevant";

export const RELEVANCE_TRACKS: readonly RelevanceTrack[] = [
  "internship",
  "new_grad",
  "early_career",
  "not_relevant",
] as const;

export interface RelevanceResult {
  track: RelevanceTrack;
  /** 0–100. Always 0 for not_relevant. */
  score: number;
  /** True for every track except not_relevant. */
  isFresherEligible: boolean;
  /** A seniority/level/years marker (or experienceMin ≥ 2) ruled the row out. */
  seniorityExcluded: boolean;
  /** Batch years named in the text (or by the provider), e.g. [2027]. Ranges expanded. */
  inferredBatches: number[];
  /**
   * How the batch text reads for the user's year: matched, explicitly
   * addressed ("final-year students"), open-ended from a floor, neutralised
   * by "pursuing", excluded, or not named / no year to compare against.
   */
  batchVerdict:
    | "match"
    | "final_year"
    | "open_ended"
    | "pursuing"
    | "excluded"
    | "none";
  /** Human-readable reasons, in the order they fired. Shown on hover in the UI. */
  signals: string[];
}

export interface ClassifyJobInput {
  title: string;
  description?: string | null;
  requirements?: string | null;
  experienceMin?: number | null;
  experienceMax?: number | null;
  jobType?: "internship" | "full_time" | null;
  /** Phase 2.0 column. true / false / null = unknown. */
  isIndia?: boolean | null;
  /** Phase 2.0 column. */
  isRemote?: boolean | null;
  /** Batches the provider or the user already attached — unioned into inferredBatches. */
  eligibleBatch?: number[] | null;
  deadline?: Date | string | null;
  postedDate?: Date | string | null;
  /**
   * The user's graduation year. A batch that includes it is +10; one that
   * explicitly excludes it is −40. Omit for a user-agnostic score.
   */
  graduationYear?: number | null;
  /** Injectable clock for the recency modifiers and the batch window. */
  now?: Date;
}

// ─── Patterns (all word-bounded) ──────────────────────────────────────────────

/** Rule 1 — an internship by title. Beats every seniority marker. */
const INTERN_TITLE_RE =
  /\b(interns?|internships?|trainees?|traineeships?|apprentices?|apprenticeships?|co-?op|coop)\b/i;

/**
 * The words the old substring `includes("intern")` was actually matching.
 * A provider jobType of 'internship' on a title whose only "intern" is one of
 * these is the bug echoing back, not a second opinion.
 */
const INTERN_SUBSTRING_TRAP_RE =
  /\b(internal(ly)?|international(ly)?|internet)\b/i;

/** Rule 2 — seniority words. `sr` needs its own alternative: "Sr." has no \b after the dot. */
const SENIORITY_RE =
  /\b(senior|staff|principal|lead|manager|director|architect|head of|vp|chief|cto|ceo|cfo|coo|avp|svp|evp)\b|\bsr\b\.?/i;

/** Roman level II and up, case-sensitive so "iv" in prose never fires. */
const ROMAN_LEVEL_RE = /\b(II|III|IV|V)\b/;

/** "SDE 2", "Engineer-3", "Software Engineer II" — a role noun followed by a level ≥ 2. */
const ROLE_LEVEL_RE =
  /\b(sde|swe|engineer|developer|scientist|analyst|programmer|consultant)\s*[-–]?\s*(ii|iii|iv|v|[2-5])\b/i;

/**
 * "2-4 years", "1 to 3 yrs" — a range; the minimum is what matters. Range
 * first, so "1-3 years" is read as "from 1", not as "3 years".
 */
const YEARS_RANGE_RE =
  /\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i;

/** "2+ years", "4 years" — a single figure. */
const YEARS_SINGLE_RE = /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i;

/**
 * The same two shapes, but only when "experience" is within a few words —
 * for descriptions, where "10 years of building great products" is about
 * the company, not the candidate. Either order: "3+ years of experience" and
 * "experience: 3+ years".
 */
const YEARS_RANGE_EXP_RE =
  /\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+\S+){0,4}?\s+(?:experience|exp)\b|\b(?:experience|exp)\W{0,3}(?:of\s+|in\s+)?(?:\S+\s+){0,3}?(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i;
const YEARS_SINGLE_EXP_RE =
  /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+\S+){0,4}?\s+(?:experience|exp)\b|\b(?:experience|exp)\W{0,3}(?:of\s+|in\s+)?(?:\S+\s+){0,3}?(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/i;

/** Rule 4 — new-grad markers in the title. */
const NEW_GRAD_TITLE_RE =
  /\b(new[ -]?grads?|new[ -]?graduates?|graduates?|campus|freshers?|fresh[ -]graduates?|entry[ -]?level|university|early[ -]?career|associate software|sde\s*-?\s*1|sde\s*-?\s*i|software engineer\s*-?\s*i|software engineer\s*-?\s*1|engineer\s*-?\s*i|junior|jr)\b|\b0\s*-?\s*[12]\s*(years?|yrs?)\b/i;

/** Rule 4 — fresher markers acceptable from the description, gated on a role noun in the title. */
const NEW_GRAD_TEXT_RE =
  /\b(freshers?|fresh[ -]graduates?|recent graduates?|new[ -]?grads?|no (prior )?experience (required|needed|necessary)|0\s*-\s*[12]\s*(years?|yrs?))\b/i;

/** Rule 5 — an engineering role noun. Deliberately does not include bare "analyst" or "executive". */
const ROLE_NOUN_RE =
  /\b(software|engineer(ing)?|developer|dev|sde|swe|sdet|programmer|programming|coding|full[ -]?stack|front[ -]?end|back[ -]?end|mobile|android|ios|flutter|react(js| native)?|angular|vue|node(js)?|python|java|golang|rust|kotlin|swift|typescript|javascript|c\+\+|\.net|dotnet|data (scientist|science|engineer|analyst|analytics)|machine learning|deep learning|ml|ai|nlp|computer vision|devops|sre|cloud|qa|quality assurance|test(ing|er)?|automation|embedded|firmware|systems?|platform|infrastructure|security|cyber|blockchain|web3|database|dba|api|architecture|technical|technology|it)\b/i;

/**
 * Titles that name a plainly non-technical role. Not an exclusion — an
 * "International Voice Process" fresher posting is still a fresher posting —
 * but it must not outrank an SDE internship.
 */
const NON_TECH_RE =
  /\b(voice process|(international|domestic) voice|voice support|chat process|process associate|technical support|tech support|non[- ]voice|bpo|kpo|call cent(er|re)|customer (service|support|care|success)|telecall(er|ing)?|tele[- ]?sales|sales|marketing|recruit(er|ing|ment)?|talent acquisition|hr|human resources|accountant|accounts|audit(or)?|payroll|procurement|admin|receptionist|maid|driver|barber|labou?rer|chef|cook|waiter|nurse|teacher|faculty|tutor|content writ(er|ing)|copywriter|graphic design(er)?|social media|cashier|housekeeping|security guard|annotat(or|ion)|data (entry|rater|labell?ing|labell?er)|rater|transcri(ber|ption))\b/i;

/** Batch inference — §2.1: `\b20(2[5-9])\b`, kept within ±2 of the current year. */
const BATCH_YEAR_RE = /\b20(2[5-9])\b/g;

/** "2025-2028", "2025 to 2027", "2025–27" — a range of batches, every year inclusive. */
const BATCH_RANGE_RE = /\b20(2\d)\s*(?:-|–|to|through)\s*(?:20)?(2\d)\b/gi;

/**
 * An open-ended lower bound: "2025 or later", "2025 onwards", "2025+",
 * "2025 and above", "batch of 2025 or after". The year captured is the floor.
 */
const BATCH_OPEN_RE =
  /\b20(2[5-9])\s*(?:\+|(?:or|and|&)\s+(?:later|above|after|beyond)|onwards?)/gi;

/**
 * Explicitly addressed to students in their final year. "pre-final year"
 * is the batch after, so it is excluded by the lookbehind. Requires a
 * student-ish noun within two words so "final year project" does not fire.
 */
const FINAL_YEAR_RE =
  /(?<!pre[- ])\bfinal[- ]year\s+(?:\w+\s+){0,2}?(?:students?|candidates?|undergrads?|undergraduates?|graduates?|engineering|b\.?\s?tech|be\b|bca|mca|passouts?)/i;

/** "Pursuing B.Tech" — current students welcome. Boilerplate, so it only neutralises. */
const PURSUING_RE = /\bpursuing\b/i;

/**
 * "2026 Graduates Only", "2026 batch only", "only 2025 pass-outs" — an
 * explicit restriction on the year. Boilerplate "currently pursuing a
 * Bachelor's" further down the description does not reopen it. Checked
 * within 40 characters of a batch year on either side.
 */
const BATCH_ONLY_RE =
  /\b20(2[5-9])\b[^.\n]{0,40}?\bonly\b|\bonly\b[^.\n]{0,40}?\b20(2[5-9])\b/i;

/**
 * A year that is part of a calendar date is not a batch. "Walk in interview
 * on 24th Aug 2026" names a day, not a graduating class — and read as a
 * batch it would demote every 2027 candidate by 40. Checked on the text
 * immediately around each match: a month name or a numeric day before it
 * ("Aug 2026", "24/08/2026"), or an ISO date after it ("2026-08-24").
 */
const DATE_BEFORE_RE =
  /(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s*[-–]?\s*|\d{1,2}[/.-]\d{1,2}[/.-]|\b\d{1,2}(?:st|nd|rd|th)?[\s,]+(?:of\s+)?|\b(?!20[2-3]\d\b)\d+\s*\/\s*)$/i;
const DATE_AFTER_RE = /^[/.-]\d{1,2}[/.-]\d{1,2}\b/;

/**
 * A year is only a batch when something batch-shaped is said near it.
 * "© 2026 Dlytica", "Top Employer 2026", "Named a 2025 Gartner Magic
 * Quadrant" all sat in the −40 bucket on the live table (2026-09-15).
 * Checked within 60 characters either side.
 */
const BATCH_CONTEXT_RE =
  /\b(batch(es)?|grads?|graduat\w*|pass[- ]?outs?|passing|passed out|freshers?|class of|interns?|internships?|summer|winter|students?|hiring|eligib\w*|campus|placements?|joining|start\w*|available|cohort|apprentice\w*|trainees?|onwards?|later|above|20(2[5-9])\s*(?:-|–|to|\/|or|and|&)\s*(?:20)?2[5-9])\b/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRACK_BASE: Record<Exclude<RelevanceTrack, "not_relevant">, number> = {
  internship: 90,
  new_grad: 85,
  early_career: 60,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Collapse whitespace and unify dashes so the regexes see one shape. */
function cleanTitle(raw: string): string {
  return raw.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

/**
 * The minimum years of experience a piece of text asks for, or null when it
 * names none. A range ("1-3 years") contributes its low end; a bare figure
 * ("3+ years") contributes itself. The lowest figure in the text wins, since
 * a description that says "0-1 years" and later "5 years for the senior
 * track" is describing an entry-level role.
 */
export function minYearsInText(
  text: string | null | undefined,
  options: {
    /**
     * Only count figures that sit next to the word "experience". On for
     * descriptions; off for titles, which are too short to be about anything
     * else.
     */
    requireExperienceContext?: boolean;
  } = {},
): number | null {
  if (!text) return null;
  const rangeRe = options.requireExperienceContext
    ? YEARS_RANGE_EXP_RE
    : YEARS_RANGE_RE;
  const singleRe = options.requireExperienceContext
    ? YEARS_SINGLE_EXP_RE
    : YEARS_SINGLE_RE;

  let min: number | null = null;
  const consider = (raw: string | undefined) => {
    if (raw === undefined) return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    min = min === null ? n : Math.min(min, n);
  };
  for (const m of text.matchAll(new RegExp(rangeRe.source, "gi"))) {
    // Whichever alternative matched, its low end is the first defined group.
    consider(m.slice(1).find((g) => g !== undefined));
  }
  // Single figures, skipping the ones that were part of a range.
  const stripped = text.replace(new RegExp(YEARS_RANGE_RE.source, "gi"), " ");
  for (const m of stripped.matchAll(new RegExp(singleRe.source, "gi"))) {
    consider(m.slice(1).find((g) => g !== undefined));
  }
  return min;
}

export interface BatchContext {
  /** Every batch year named, ranges expanded, within ±2 of now. */
  batches: number[];
  /** The lowest year named as an open-ended floor ("2025 or later"), or null. */
  openFrom: number | null;
  /** Text addresses current final-year students. */
  finalYear: boolean;
  /** Text says "pursuing" — current students welcome. */
  pursuing: boolean;
  /** A named year carries "only" — an explicit restriction "pursuing" cannot reopen. */
  restricted: boolean;
}

/**
 * The batch that "final-year student" refers to right now: the academic
 * year in progress ends the following calendar year from June onwards. In
 * September 2026 a final-year student graduates in 2027; in March 2027 they
 * still do.
 */
export function finalYearBatch(now: Date): number {
  return now.getMonth() >= 5 ? now.getFullYear() + 1 : now.getFullYear();
}

/** Years named in the text, restricted to the window the spec allows. */
export function inferBatches(
  text: string,
  now: Date,
  extra: number[] | null | undefined = [],
): number[] {
  return inferBatchContext(text, now, extra).batches;
}

/** Everything the batch modifiers need to read from the text. */
export function inferBatchContext(
  text: string,
  now: Date,
  extra: number[] | null | undefined = [],
): BatchContext {
  const year = now.getFullYear();
  const inWindow = (y: number) => Math.abs(y - year) <= 2;
  const found = new Set<number>();

  for (const m of text.matchAll(BATCH_YEAR_RE)) {
    const y = Number(`20${m[1]}`);
    if (!inWindow(y)) continue;
    const before = text.slice(Math.max(0, m.index - 16), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (DATE_BEFORE_RE.test(before) || DATE_AFTER_RE.test(after)) continue;
    const around = text.slice(
      Math.max(0, m.index - 60),
      m.index + m[0].length + 60,
    );
    if (!BATCH_CONTEXT_RE.test(around)) continue;
    found.add(y);
  }
  // "2025-2028" is 2025, 2026, 2027 and 2028 — the single-year pass above
  // only saw the ends.
  for (const m of text.matchAll(BATCH_RANGE_RE)) {
    const from = Number(`20${m[1]}`);
    const to = Number(`20${m[2]}`);
    if (to < from || to - from > 6) continue;
    for (let y = from; y <= to; y += 1) if (inWindow(y)) found.add(y);
  }
  for (const y of extra ?? []) {
    if (Number.isInteger(y)) found.add(y);
  }

  let openFrom: number | null = null;
  for (const m of text.matchAll(BATCH_OPEN_RE)) {
    const y = Number(`20${m[1]}`);
    if (openFrom === null || y < openFrom) openFrom = y;
  }

  return {
    batches: [...found].sort((a, b) => a - b),
    openFrom,
    finalYear: FINAL_YEAR_RE.test(text),
    pursuing: PURSUING_RE.test(text),
    restricted: BATCH_ONLY_RE.test(text),
  };
}

// ─── The classifier ───────────────────────────────────────────────────────────

export function classifyJob(input: ClassifyJobInput): RelevanceResult {
  const now = input.now ?? new Date();
  const title = cleanTitle(input.title ?? "");
  const body = [input.description ?? "", input.requirements ?? ""]
    .filter((s) => s.length > 0)
    .join("\n");
  const signals: string[] = [];

  const batch = inferBatchContext(
    `${title}\n${body}`,
    now,
    input.eligibleBatch,
  );
  const inferredBatches = batch.batches;

  const internTitle = INTERN_TITLE_RE.test(title);
  const seniorityWord = SENIORITY_RE.test(title);
  const romanLevel = ROMAN_LEVEL_RE.test(title);
  const roleLevel = ROLE_LEVEL_RE.test(title);
  const titleMinYears = minYearsInText(title);
  const roleNoun = ROLE_NOUN_RE.test(title);
  const nonTech = NON_TECH_RE.test(title);

  let track: RelevanceTrack;
  let seniorityExcluded = false;

  if (internTitle) {
    // Rule 1. The intern word wins outright — a "Senior Software Engineer
    // Intern" is an internship at a company with senior engineers.
    track = "internship";
    signals.push("title: intern/trainee/apprentice word");
    if (seniorityWord || romanLevel || roleLevel) {
      signals.push("seniority word in title ignored — intern beats senior");
    }
  } else {
    // Rule 2 — hard exclusions. Any one of these is decisive.
    const exclusions: string[] = [];
    if (seniorityWord) exclusions.push("title: seniority word");
    if (romanLevel) exclusions.push("title: level II or above");
    if (roleLevel) exclusions.push("title: role level 2 or above");
    if (titleMinYears !== null && titleMinYears >= 2) {
      exclusions.push(`title: asks for ${titleMinYears}+ years`);
    }
    if (input.experienceMin != null && input.experienceMin >= 2) {
      exclusions.push(`experienceMin ${input.experienceMin} ≥ 2`);
    }

    if (exclusions.length > 0) {
      track = "not_relevant";
      seniorityExcluded = true;
      signals.push(...exclusions);
      if (input.jobType === "internship") {
        signals.push(
          "provider jobType internship ignored — seniority marker in title",
        );
      }
    } else if (input.jobType === "internship") {
      // Rule 3 — the provider says internship and nothing in the title
      // argues. Unless the only "intern" in the title is "internal" /
      // "international", in which case the provider was fooled by the same
      // substring this module refuses to match.
      if (INTERN_SUBSTRING_TRAP_RE.test(title)) {
        track = classifyNonIntern(
          title,
          body,
          input,
          roleNoun,
          nonTech,
          signals,
        );
        signals.push(
          "provider jobType internship ignored — title's only 'intern' is internal/international",
        );
      } else {
        track = "internship";
        signals.push("provider jobType: internship");
      }
    } else {
      track = classifyNonIntern(title, body, input, roleNoun, nonTech, signals);
    }
  }

  if (track === "not_relevant") {
    return {
      track,
      score: 0,
      isFresherEligible: false,
      seniorityExcluded,
      inferredBatches,
      batchVerdict: "none",
      signals,
    };
  }

  // ── Score ──
  let score = TRACK_BASE[track];
  signals.push(`base ${track} ${score}`);

  if (input.isIndia === true) {
    score += 10;
    signals.push("isIndia +10");
  }
  if (input.isRemote === true) {
    score += 5;
    signals.push("isRemote +5");
  }
  if (input.isIndia === false && input.isRemote !== true) {
    // Not in the spec's list. An on-site posting in Maryland is not one the
    // user can take, and without this it ties an India one at the 100 cap.
    // null (unknown) is left alone — rule 6 of §2.0 keeps those reviewable.
    score -= 25;
    signals.push("on-site outside India −25");
  }

  let batchVerdict: RelevanceResult["batchVerdict"] = "none";
  if (inferredBatches.length > 0) {
    signals.push(`batch ${inferredBatches.join("/")} named`);
  }
  if (input.graduationYear != null) {
    const y = input.graduationYear;
    if (batch.finalYear && y === finalYearBatch(now)) {
      // The posting is talking to the user directly. Beats a generic match
      // and beats any year it also names ("2026 freshers & final-year
      // student" names 2026 and means 2027 too).
      score += 15;
      batchVerdict = "final_year";
      signals.push("addressed to final-year students +15");
    } else if (inferredBatches.includes(y)) {
      score += 10;
      batchVerdict = "match";
      signals.push(`batch matches ${y} +10`);
    } else if (batch.openFrom !== null && y >= batch.openFrom) {
      score += 10;
      batchVerdict = "open_ended";
      signals.push(`batch ${batch.openFrom} or later includes ${y} +10`);
    } else if (
      inferredBatches.length > 0 &&
      batch.pursuing &&
      !batch.restricted
    ) {
      batchVerdict = "pursuing";
      signals.push(
        `batch names another year but pursuing students welcome — no penalty`,
      );
    } else if (inferredBatches.length > 0 || batch.openFrom !== null) {
      if (batch.pursuing && batch.restricted) {
        signals.push("batch says only — pursuing does not reopen it");
      }
      // Sloppy job text names one year and means "or thereabouts" often
      // enough that this is a demotion, not an exclusion (§2.1).
      score -= 40;
      batchVerdict = "excluded";
      signals.push(`batch excludes ${y} −40`);
    }
  }

  if (toDate(input.deadline)) {
    score += 5;
    signals.push("deadline present +5");
  }

  const posted = toDate(input.postedDate);
  if (posted) {
    const ageDays = (now.getTime() - posted.getTime()) / DAY_MS;
    if (ageDays <= 7) {
      score += 10;
      signals.push("posted within 7 days +10");
    } else if (ageDays > 45) {
      score -= 20;
      signals.push("posted over 45 days ago −20");
    }
  }

  if (!roleNoun) {
    score -= 15;
    signals.push("no engineering role noun in title −15");
  }
  if (nonTech) {
    score -= 20;
    signals.push("non-technical role in title −20");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    track,
    score,
    isFresherEligible: true,
    seniorityExcluded: false,
    inferredBatches,
    batchVerdict,
    signals,
  };
}

/**
 * Rules 4–6 for a title that is neither an internship nor excluded. Pushes
 * its reasons onto `signals` and returns the track.
 */
function classifyNonIntern(
  title: string,
  body: string,
  input: ClassifyJobInput,
  roleNoun: boolean,
  nonTech: boolean,
  signals: string[],
): RelevanceTrack {
  // Rule 4 — new grad by title.
  if (NEW_GRAD_TITLE_RE.test(title)) {
    signals.push("title: new-grad/fresher/entry-level marker");
    return "new_grad";
  }

  // Rule 4b — new grad by description, only for an engineering title.
  const bodyMinYears = minYearsInText(body, { requireExperienceContext: true });
  if (roleNoun && !nonTech && NEW_GRAD_TEXT_RE.test(body)) {
    // "Freshers welcome" next to "5+ years" is the senior track being
    // described; trust the years.
    if (bodyMinYears === null || bodyMinYears <= 1) {
      signals.push("description: fresher/0-1 years marker");
      return "new_grad";
    }
  }

  // Rule 5 — early career: no seniority (already checked), ≤ 2 years or
  // unstated, and a real engineering role noun.
  if (!roleNoun) {
    signals.push("no engineering role noun in title");
    return "not_relevant";
  }
  if (nonTech) {
    signals.push("non-technical role in title");
    return "not_relevant";
  }
  if (input.experienceMax != null && input.experienceMax > 2) {
    signals.push(`experienceMax ${input.experienceMax} > 2`);
    return "not_relevant";
  }
  if (bodyMinYears !== null && bodyMinYears >= 3) {
    signals.push(`description asks for ${bodyMinYears}+ years`);
    return "not_relevant";
  }

  signals.push(
    input.experienceMax != null
      ? `engineering role, experienceMax ${input.experienceMax} ≤ 2`
      : "engineering role, experience unstated",
  );
  return "early_career";
}

/**
 * The column shape for `jobs`, so the write-time normaliser and the backfill
 * cannot drift. `inferredBatches` is deliberately not persisted: it is not a
 * column the spec adds, `eligibleBatch` belongs to the provider/user, and the
 * batch verdict is already in the score and the signals.
 */
export function toRelevanceColumns(
  r: RelevanceResult,
  classifiedAt: Date = new Date(),
): {
  relevanceTrack: RelevanceTrack;
  relevanceScore: number;
  isFresherEligible: boolean;
  seniorityExcluded: boolean;
  relevanceSignals: string[];
  classifiedAt: Date;
} {
  return {
    relevanceTrack: r.track,
    relevanceScore: r.score,
    isFresherEligible: r.isFresherEligible,
    seniorityExcluded: r.seniorityExcluded,
    relevanceSignals: r.signals,
    classifiedAt,
  };
}
