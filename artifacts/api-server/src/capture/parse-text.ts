/**
 * Heuristic JD parsing (Phase 4.1)
 * ─────────────────────────────────
 * The no-API-key path, and the one that has to be good: `GEMINI_API_KEY` is set
 * on Render but not locally, and UPGRADE.md §4.1 is explicit that "the feature
 * must work fully with no API key — manual entry is the floor, AI is the
 * accelerator". Everything below is string work on text the user pasted; no
 * request leaves the process.
 *
 * Two passes, in this order:
 *
 *   1. LABELLED FIELDS. "Stipend: ₹30,000 /month", "Apply by 30 Sep 2026".
 *      Internshala and Unstop pastes are almost entirely label/value pairs.
 *   2. POSITIONAL. LinkedIn's own copy puts the title on line 1 and
 *      "Company · Location · 2 days ago" on line 2, which is worth reading
 *      directly because it is the single most common paste this tool will see.
 *
 * A labelled value always beats a positional guess.
 */

import type { CaptureDraft, CaptureJobType, CaptureWorkMode } from "./types";
import { emptyDraft } from "./types";

/** Cap on what we keep as the description — the column is text, the RAM is 512 MB. */
const MAX_DESCRIPTION = 8000;

// ─── Labels ───────────────────────────────────────────────────────────────────

const LABEL_PATTERNS = {
  title:
    /^(?:job\s*title|role|position|profile|designation|job\s*profile)\s*[:\-–]\s*(.+)$/i,
  companyName:
    /^(?:company|employer|organisation|organization|hiring\s*company)\s*[:\-–]\s*(.+)$/i,
  location:
    /^(?:location|job\s*location|place|city|based\s*in)\s*[:\-–]\s*(.+)$/i,
  skills:
    /^(?:skills?(?:\s*required)?|tech\s*stack|requirements?\s*\(skills\)|key\s*skills)\s*[:\-–]\s*(.+)$/i,
  jobType:
    /^(?:job\s*type|employment\s*type|type|opportunity\s*type)\s*[:\-–]\s*(.+)$/i,
  workMode:
    /^(?:work\s*mode|mode|work\s*type|workplace\s*type)\s*[:\-–]\s*(.+)$/i,
} as const;

// ─── Money ────────────────────────────────────────────────────────────────────

/**
 * A number with either a currency marker or an Indian magnitude unit. Requiring
 * one of the two is what stops "2 years" and "500 employees" being read as pay.
 */
const MONEY =
  /(?:(₹|rs\.?|inr)\s*)?([\d][\d,]*(?:\.\d+)?)\s*(lpa|lakhs?|lacs?|crores?|cr|k)?\s*(?:(?:-|–|—|to)\s*(?:₹|rs\.?|inr)?\s*([\d][\d,]*(?:\.\d+)?)\s*(lpa|lakhs?|lacs?|crores?|cr|k)?)?/gi;

const MONTHLY_MARKER =
  /\/\s*(?:month|mo\b)|per\s*month|a\s*month|monthly|p\.?m\.?\b/i;
const YEARLY_MARKER =
  /\/\s*(?:year|yr\b|annum)|per\s*(?:year|annum)|a\s*year|annually|p\.?a\.?\b/i;

/**
 * Anything at or above this, with no stated period, is read as an annual
 * figure; below it, as a monthly stipend. An intern stipend above ₹1,00,000 a
 * month and a salary below ₹1,00,000 a year are both rare enough that the
 * mistake is cheap — and the user is editing a draft either way.
 */
const ANNUAL_THRESHOLD = 100_000;

function magnitude(unit: string | undefined): number {
  if (!unit) return 1;
  const u = unit.toLowerCase();
  if (u === "k") return 1_000;
  if (u.startsWith("cr")) return 10_000_000;
  return 100_000; // lpa / lakh / lac
}

function toAmount(digits: string, unit: string | undefined): number | null {
  const value = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  const amount = Math.round(value * magnitude(unit));
  return amount > 0 ? amount : null;
}

interface MoneyFields {
  stipend: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
}

/**
 * The first pay figure in the text, split into a monthly stipend or an annual
 * range. The first is taken rather than the largest because JDs quote the role's
 * pay before they quote anything else numeric (bonuses, ESOP bands, revenue).
 */
export function parseMoney(text: string): MoneyFields {
  const result: MoneyFields = {
    stipend: null,
    salaryMin: null,
    salaryMax: null,
  };
  MONEY.lastIndex = 0;

  for (let match = MONEY.exec(text); match; match = MONEY.exec(text)) {
    const [, symbol, lowDigits, lowUnit, highDigits, highUnit] = match;
    // A bare number is not a salary. "12-18 LPA" carries its unit only on the
    // upper bound, so the unit on either end is enough to qualify the pair.
    if (!symbol && !lowUnit && !highUnit) continue;

    const low = toAmount(lowDigits, lowUnit ?? highUnit);
    if (low === null) continue;
    const high = highDigits ? toAmount(highDigits, highUnit ?? lowUnit) : null;

    // The period word sits just after the figure ("₹40,000 /month"), or just
    // before it ("Monthly stipend of ₹40,000").
    const after = text.slice(
      match.index + match[0].length,
      match.index + match[0].length + 40,
    );
    const before = text.slice(Math.max(0, match.index - 40), match.index);
    const window = `${before} ${after}`;

    const unit = (highUnit ?? lowUnit ?? "").toLowerCase();
    const yearlyByUnit =
      unit.startsWith("lpa") ||
      unit.startsWith("lakh") ||
      unit.startsWith("lac") ||
      unit.startsWith("cr");

    let yearly: boolean;
    if (MONTHLY_MARKER.test(window)) yearly = false;
    else if (YEARLY_MARKER.test(window)) yearly = true;
    else if (yearlyByUnit) yearly = true;
    else yearly = Math.max(low, high ?? low) >= ANNUAL_THRESHOLD;

    if (yearly) {
      result.salaryMin = low;
      result.salaryMax = high ?? low;
    } else {
      // One integer column, so a range keeps its upper bound — the headline
      // number, and the one the user compares offers on.
      result.stipend = high ?? low;
    }
    return result;
  }

  return result;
}

// ─── Deadline ─────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const DEADLINE_CUE =
  /(?:apply\s*by|apply\s*before|deadline|last\s*date(?:\s*to\s*apply)?|closes?\s*on|applications?\s*close|registration\s*ends?|valid\s*(?:till|until))\s*[:\-–]?\s*/i;

const MONTH_NAMES = Object.keys(MONTHS).join("|");
const DATE_PATTERNS: RegExp[] = [
  // 2026-09-30
  /(\d{4})-(\d{1,2})-(\d{1,2})/,
  // 30 Sep 2026 / 30th September, 2026
  new RegExp(
    String.raw`(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_NAMES})[a-z]*\.?,?\s+(\d{4})`,
    "i",
  ),
  // Sep 30, 2026 / September 30 2026
  new RegExp(
    String.raw`(${MONTH_NAMES})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})`,
    "i",
  ),
  // 30/09/2026 — day first, the Indian convention these boards use.
  /(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/,
];

/**
 * End of the stated day in UTC, not midnight. `closeExpiredDeadlineJobs` closes
 * a job the instant its deadline passes, and a deadline of "30 September" must
 * not take the row out of the list at the start of the 30th.
 */
function endOfDayUtc(
  year: number,
  monthIndex: number,
  day: number,
): string | null {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, monthIndex, day, 23, 59, 59);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== monthIndex)
    return null;
  return date.toISOString();
}

function matchDate(fragment: string): string | null {
  for (const [index, pattern] of DATE_PATTERNS.entries()) {
    const m = pattern.exec(fragment);
    if (!m) continue;

    if (index === 0) {
      return endOfDayUtc(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    if (index === 1) {
      return endOfDayUtc(
        Number(m[3]),
        MONTHS[m[2].toLowerCase().slice(0, 4)] ??
          MONTHS[m[2].toLowerCase().slice(0, 3)],
        Number(m[1]),
      );
    }
    if (index === 2) {
      return endOfDayUtc(
        Number(m[3]),
        MONTHS[m[1].toLowerCase().slice(0, 4)] ??
          MONTHS[m[1].toLowerCase().slice(0, 3)],
        Number(m[2]),
      );
    }
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return endOfDayUtc(year, Number(m[2]) - 1, Number(m[1]));
  }
  return null;
}

/** A date only counts as a deadline when a cue word introduces it. */
export function parseDeadline(text: string): string | null {
  const cue = DEADLINE_CUE.exec(text);
  if (!cue) return null;
  const fragment = text.slice(
    cue.index + cue[0].length,
    cue.index + cue[0].length + 60,
  );
  return matchDate(fragment);
}

// ─── Skills ───────────────────────────────────────────────────────────────────

/**
 * Matched literally against the pasted text. Deliberately a fixed list rather
 * than "every capitalised word": a draft with three right skills beats one with
 * thirty words of boilerplate the user then has to delete.
 */
const SKILL_TERMS = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "Kotlin",
  "Swift",
  "Go",
  "Golang",
  "Rust",
  "C++",
  "C#",
  "Ruby",
  "PHP",
  "Scala",
  "Dart",
  "SQL",
  "NoSQL",
  "React",
  "React Native",
  "Next.js",
  "Angular",
  "Vue",
  "Svelte",
  "Redux",
  "Node.js",
  "Express",
  "NestJS",
  "Django",
  "Flask",
  "FastAPI",
  "Spring Boot",
  "Spring",
  "Rails",
  "Laravel",
  ".NET",
  "HTML",
  "CSS",
  "Tailwind",
  "SASS",
  "Bootstrap",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "Elasticsearch",
  "DynamoDB",
  "Cassandra",
  "Kafka",
  "RabbitMQ",
  "GraphQL",
  "REST",
  "gRPC",
  "AWS",
  "Azure",
  "GCP",
  "Docker",
  "Kubernetes",
  "Terraform",
  "Jenkins",
  "CI/CD",
  "Git",
  "Linux",
  "Bash",
  "Machine Learning",
  "Deep Learning",
  "TensorFlow",
  "PyTorch",
  "Pandas",
  "NumPy",
  "Scikit-learn",
  "NLP",
  "Computer Vision",
  "LLM",
  "Data Structures",
  "Algorithms",
  "OOP",
  "System Design",
  "Microservices",
  "Android",
  "iOS",
  "Flutter",
  "Figma",
  "Selenium",
  "Jest",
  "Cypress",
] as const;

export function parseSkills(text: string): string[] {
  const found: string[] = [];
  for (const term of SKILL_TERMS) {
    // Escaped so "C++", ".NET" and "Next.js" match literally.
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Word boundaries only where the term starts/ends with a word character —
    // "\bC++\b" would never match, because "+" is not a word character.
    const left = /^\w/.test(term) ? "\\b" : "";
    const right = /\w$/.test(term) ? "\\b" : "";
    if (new RegExp(`${left}${escaped}${right}`, "i").test(text)) {
      found.push(term);
    }
  }
  // "Go" inside "Golang" and "React" inside "React Native" both fire; keep the
  // more specific one only.
  const redundant = new Set<string>();
  if (found.includes("Golang")) redundant.add("Go");
  if (found.includes("React Native")) redundant.add("React");
  return found.filter((s) => !redundant.has(s));
}

// ─── Work mode / job type ─────────────────────────────────────────────────────

export function parseWorkMode(text: string): CaptureWorkMode | null {
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (
    /\b(?:remote|work\s*from\s*home|wfh|anywhere|fully\s*distributed)\b/i.test(
      text,
    )
  ) {
    return "remote";
  }
  if (/\b(?:on-?site|in\s*office|work\s*from\s*office|wfo)\b/i.test(text))
    return "onsite";
  return null;
}

export function parseJobType(text: string): CaptureJobType | null {
  if (
    /\b(?:intern|internship|trainee|apprentice|co-?op|summer\s*analyst)\b/i.test(
      text,
    )
  ) {
    return "internship";
  }
  if (/\b(?:full[\s-]?time|permanent|fte)\b/i.test(text)) return "full_time";
  return null;
}

// ─── Positional pass ──────────────────────────────────────────────────────────

/** Separators LinkedIn and friends use on their "Company · Location · when" line. */
const META_SEPARATOR = /\s*(?:·|•|\||•)\s*/;

/** Line noise that is never a title. */
const NOT_A_TITLE =
  /^(?:apply|save|share|report|about|overview|responsibilities|requirements|qualifications|benefits|easy\s*apply|show\s*more|see\s*more|\d+\s*(?:applicants?|views?))\b/i;

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Best-effort draft from pasted text. Every field may come back null; the
 * dialog renders an editable form either way.
 */
export function parseCaptureText(
  rawText: string | null | undefined,
): CaptureDraft {
  const draft = emptyDraft();
  const text = (rawText ?? "").trim();
  if (text.length === 0) return draft;

  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((l) => l.length > 0);

  // ── Pass 1: labelled fields ───────────────────────────────────────────────
  let labelledSkills: string | null = null;
  let labelledJobType: string | null = null;
  let labelledWorkMode: string | null = null;

  for (const line of lines) {
    for (const [field, pattern] of Object.entries(LABEL_PATTERNS)) {
      const m = pattern.exec(line);
      if (!m) continue;
      const value = m[1].trim();
      if (value.length === 0) continue;
      if (field === "skills") labelledSkills ??= value;
      else if (field === "jobType") labelledJobType ??= value;
      else if (field === "workMode") labelledWorkMode ??= value;
      else if (field === "title") draft.title ??= value;
      else if (field === "companyName") draft.companyName ??= value;
      else if (field === "location") draft.location ??= value;
    }
  }

  // ── Pass 2: positional ────────────────────────────────────────────────────
  // A title has to contain a letter: a line of "₹₹₹" or "—" is decoration, and
  // the dialog should say it could not find a title rather than offer that.
  const firstUsable = lines.find(
    (l) =>
      /[A-Za-z]/.test(l) &&
      !NOT_A_TITLE.test(l) &&
      l.length <= 120 &&
      !/:\s*$/.test(l),
  );
  if (!draft.title && firstUsable && !LABEL_PATTERNS.title.test(firstUsable)) {
    draft.title = firstUsable;
  }

  const metaLine = lines.find((l) => META_SEPARATOR.test(l));
  if (metaLine) {
    const parts = metaLine
      .split(META_SEPARATOR)
      .map(cleanLine)
      .filter((p) => p.length > 0);
    // "Acme Corp · Bengaluru, Karnataka, India · 2 days ago · 40 applicants"
    if (!draft.companyName && parts[0] && parts[0] !== draft.title) {
      draft.companyName = parts[0];
    }
    if (!draft.location && parts[1] && !/ago$|applicants?$/i.test(parts[1])) {
      draft.location = parts[1];
    }
  }

  // "Software Engineer Intern at Acme Corp" — the shape a share link produces.
  if (!draft.companyName && draft.title) {
    const at = /^(.*?)\s+at\s+(.+)$/i.exec(draft.title);
    if (at && at[2].length <= 60) {
      draft.title = at[1].trim();
      draft.companyName = at[2].trim();
    }
  }

  // ── Derived fields ────────────────────────────────────────────────────────
  const money = parseMoney(text);
  draft.stipend = money.stipend;
  draft.salaryMin = money.salaryMin;
  draft.salaryMax = money.salaryMax;

  draft.deadline = parseDeadline(text);
  draft.requiredSkills = labelledSkills
    ? // A labelled list is authoritative; keep the user's own wording.
      labelledSkills
        .split(/[,;/]|\s+and\s+/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 40)
        .slice(0, 20)
    : parseSkills(text);

  // Mode and type read the whole text, because "Remote" is as likely to be a
  // bullet in the body as a labelled field.
  draft.workMode = parseWorkMode(labelledWorkMode ?? "") ?? parseWorkMode(text);
  draft.jobType =
    parseJobType(labelledJobType ?? "") ??
    parseJobType(draft.title ?? "") ??
    parseJobType(text);

  draft.description = text.slice(0, MAX_DESCRIPTION);

  return draft;
}
