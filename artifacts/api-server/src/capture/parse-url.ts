/**
 * URL-only capture parsing (Phase 4.1)
 * ─────────────────────────────────────
 * The floor of the capture feature: what can be recovered when the user pastes
 * a link and nothing else, with no Gemini key. Several boards encode the role
 * and employer in the path slug, so a surprising amount survives.
 *
 * This reads the string. It never opens it.
 */

import { detectPlatform, safeParseUrl, type CapturePlatform } from "./platform";

export interface UrlDerivedFields {
  platform: CapturePlatform | null;
  title?: string;
  companyName?: string;
  location?: string;
}

/** Tokens that stay uppercase when a slug is turned back into a title. */
const ACRONYMS = new Set([
  "sde",
  "sd",
  "ui",
  "ux",
  "qa",
  "ml",
  "ai",
  "api",
  "ios",
  "it",
  "hr",
  "sre",
  "bi",
  "aws",
  "gcp",
  "php",
  "css",
  "html",
  "sql",
  "ci",
  "cd",
  "r&d",
  "llm",
  "nlp",
  "cv",
  "qc",
]);

/** Slug words that are noise in a job title. */
const TRAILING_NOISE =
  /^(job|jobs|opening|openings|vacancy|apply|details?|hiring)$/;

/**
 * "software-engineer-intern" → "Software Engineer Intern".
 * Runs of digits that look like a posting id are dropped; a four-digit year is
 * kept, because "…-intern-2027" is exactly the batch signal §2.1 looks for.
 */
export function deslugify(slug: string): string {
  const words = slug
    .replace(/[_+]/g, "-")
    .split("-")
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
    .filter((w) => !/^\d+$/.test(w) || /^(19|20)\d{2}$/.test(w))
    .filter((w) => !TRAILING_NOISE.test(w.toLowerCase()));

  return words
    .map((w) => {
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      // Roman-ish level markers: "i", "ii", "iii".
      if (/^i{1,3}$/.test(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ")
    .trim();
}

/** Strip a trailing numeric posting id, whether hyphenated or glued on. */
function stripTrailingId(slug: string): string {
  return slug.replace(/-?\d{5,}$/, "").replace(/-+$/, "");
}

/** Strip a leading numeric posting id ("1234567-software-engineer"). */
function stripLeadingId(slug: string): string {
  return slug.replace(/^\d{4,}-/, "");
}

/**
 * Split a slug on its "-at-" separator, the shape several boards use to glue
 * the role and the employer together.
 */
function splitAt(slug: string): { role: string; company: string } | null {
  const index = slug.lastIndexOf("-at-");
  if (index <= 0) return null;
  const role = slug.slice(0, index);
  const company = slug.slice(index + "-at-".length);
  if (role.length === 0 || company.length === 0) return null;
  return { role, company };
}

/** Split a slug on "-in-<city>", which Internshala uses before "-at-<company>". */
function splitIn(slug: string): { head: string; location: string } | null {
  const index = slug.lastIndexOf("-in-");
  if (index <= 0) return null;
  const head = slug.slice(0, index);
  const location = slug.slice(index + "-in-".length);
  if (head.length === 0 || location.length === 0) return null;
  return { head, location };
}

/**
 * Everything derivable from the URL alone.
 *
 * Slug shapes handled, all observed on real postings:
 *   linkedin     /jobs/view/<role>-at-<company>-<id>
 *   internshala  /internship/detail/<role>-in-<city>-at-<company><id>
 *   wellfound    /jobs/<id>-<role>          /company/<co>/jobs/<id>-<role>
 *   unstop       /internships/<slug>-<id>   /jobs/<slug>-<id>
 *   naukri       /job-listings-<role>-<company>-<city>-<n>-to-<m>-years-<id>
 *   greenhouse   /<company>/jobs/<id>       lever  /<company>/<uuid>
 * Anything else yields the platform label and nothing more, which is still
 * worth having: the dialog opens with the source filled in.
 */
export function parseCaptureUrl(
  raw: string | null | undefined,
): UrlDerivedFields {
  const platform = detectPlatform(raw);
  const url = safeParseUrl(raw);
  if (!url || !platform) return { platform };

  const segments = url.pathname
    .split("/")
    .map((s) => decodeURIComponent(s).toLowerCase())
    .filter((s) => s.length > 0);

  const result: UrlDerivedFields = { platform };

  const assign = (
    field: "title" | "companyName" | "location",
    slug: string,
  ) => {
    const value = deslugify(slug);
    if (value.length > 0) result[field] = value;
  };

  switch (platform.key) {
    case "linkedin": {
      const viewIndex = segments.indexOf("view");
      const slug = viewIndex >= 0 ? segments[viewIndex + 1] : undefined;
      if (!slug) break;
      const parts = splitAt(stripTrailingId(slug));
      if (parts) {
        assign("title", parts.role);
        assign("companyName", parts.company);
      } else {
        assign("title", stripTrailingId(slug));
      }
      break;
    }

    case "internshala": {
      const slug = segments[segments.length - 1];
      if (!slug) break;
      // The id is glued to the company with no separator, so strip it first.
      const cleaned = stripTrailingId(slug);
      const parts = splitAt(cleaned);
      if (parts) {
        assign("companyName", parts.company);
        const withLocation = splitIn(parts.role);
        if (withLocation) {
          assign("title", withLocation.head);
          assign("location", withLocation.location);
        } else {
          assign("title", parts.role);
        }
      } else {
        const withLocation = splitIn(cleaned);
        if (withLocation) {
          assign("title", withLocation.head);
          assign("location", withLocation.location);
        } else {
          assign("title", cleaned);
        }
      }
      break;
    }

    case "wellfound":
    case "angellist": {
      const jobsIndex = segments.indexOf("jobs");
      const slug = jobsIndex >= 0 ? segments[jobsIndex + 1] : undefined;
      if (slug) assign("title", stripLeadingId(slug));
      // /company/<co>/jobs/<id>-<role> also names the employer.
      const companyIndex = segments.indexOf("company");
      if (companyIndex >= 0 && segments[companyIndex + 1]) {
        assign("companyName", segments[companyIndex + 1]);
      }
      break;
    }

    case "naukri": {
      const slug = segments.find((s) => s.startsWith("job-listings-"));
      if (!slug) break;
      // Everything after the role is boilerplate the board appends: city,
      // an experience band, then the id. Cut at the experience band.
      const body = stripTrailingId(slug.slice("job-listings-".length));
      const cut = body.search(/-\d+-to-\d+-years?/);
      assign("title", cut > 0 ? body.slice(0, cut) : body);
      break;
    }

    case "unstop": {
      const slug = segments[segments.length - 1];
      // Unstop glues the employer into the slug with no separator to split on,
      // so only the title is safe to derive.
      if (slug) assign("title", stripTrailingId(slug));
      break;
    }

    default: {
      // Greenhouse / Lever / Ashby and company career pages put the employer
      // in the first path segment. The title lives behind an id, so leave it.
      const first = segments[0];
      if (first && !/^\d+$/.test(first) && first.length > 1) {
        assign("companyName", first);
      }
      break;
    }
  }

  return result;
}
