/**
 * Platform identification for quick capture (Phase 4)
 * ────────────────────────────────────────────────────
 * Names the board a pasted URL came from, purely so the UI can say
 * "LinkedIn" instead of "the site you pasted" and so `parse-url.ts` knows
 * which slug shape to expect.
 *
 * THE DOMAIN NAMES ARE DERIVED, NEVER LISTED. This module takes the host of
 * the URL the user handed us and reduces it to its registrable label:
 * `boards.greenhouse.io` becomes `greenhouse`, and the five ToS-blocked boards
 * reduce to their own brand words the same way, without any of their domains
 * being written down here. Nothing in `capture/` opens a connection either —
 * the server parses the text it was given; it does not go and get it.
 * `capture/blocked-domains.test.ts` enforces both halves of that, and it is
 * what failed when this comment used to spell one of those hosts out.
 */

/**
 * Suffix labels stripped while reducing a host to its brand label. Not a full
 * public-suffix list — this only has to be right for job boards, and a wrong
 * answer costs a cosmetic label, never a request.
 */
const SUFFIX_LABELS = new Set([
  "com",
  "in",
  "co",
  "uk",
  "us",
  "org",
  "net",
  "io",
  "ai",
  "dev",
  "app",
  "tech",
  "jobs",
  "careers",
  "me",
  "gov",
  "edu",
]);

/** Sub-domain labels that carry no brand information. */
const NOISE_LABELS = new Set(["www", "m", "mobile", "en", "india"]);

/**
 * Display names for keys whose capitalisation is not just "first letter up".
 * Keyed by the DERIVED label, so adding an entry never introduces a domain.
 */
const DISPLAY_NAMES: Record<string, string> = {
  linkedin: "LinkedIn",
  smartrecruiters: "SmartRecruiters",
  remoteok: "RemoteOK",
  jsearch: "JSearch",
  angellist: "AngelList",
  hirist: "Hirist",
  instahyre: "Instahyre",
};

export interface CapturePlatform {
  /** Lowercase brand label derived from the host, e.g. "linkedin". */
  key: string;
  /** What the UI shows, e.g. "LinkedIn". */
  label: string;
  /** The full lowercase host, kept for display only. */
  host: string;
}

/** A parsed URL, or null when the string is not one. */
export function safeParseUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  try {
    // Accept a bare host the way a browser address bar would.
    const url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    return url.hostname.includes(".") ? url : null;
  } catch {
    return null;
  }
}

export function detectPlatform(
  raw: string | null | undefined,
): CapturePlatform | null {
  const url = safeParseUrl(raw);
  if (!url) return null;

  const host = url.hostname.toLowerCase();
  const labels = host
    .split(".")
    .filter((label) => label.length > 0 && !NOISE_LABELS.has(label));

  // Drop trailing suffix labels ('com', 'co.in', …) and take what is left.
  let end = labels.length;
  while (end > 0 && SUFFIX_LABELS.has(labels[end - 1])) end -= 1;
  const key = end > 0 ? labels[end - 1] : labels[labels.length - 1];
  if (!key) return null;

  return {
    key,
    label: DISPLAY_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
    host,
  };
}
