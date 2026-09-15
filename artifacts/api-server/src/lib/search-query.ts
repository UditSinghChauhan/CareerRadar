/**
 * Turning what the user typed into something safe to hand Postgres.
 * ─────────────────────────────────────────────────────────────────
 * Phase 7 moved job search from `title ILIKE '%q%'` onto the generated
 * `jobs.search_vector` tsvector, which also covers the description,
 * requirements and required skills. Two things had to survive that move:
 *
 *  1. `to_tsquery` is a PARSER. Handing it raw user input is a syntax error
 *     waiting to happen — `to_tsquery('english', 'c++ &')` throws, and a 500
 *     on the Jobs page for typing a stray ampersand is not acceptable. Every
 *     term here is reduced to letters and digits before it is used, so the
 *     string that reaches Postgres can only ever be `term & term & ...`.
 *     (`websearch_to_tsquery` is forgiving by design and needs no such care,
 *     which is why the raw string is safe to pass to it.)
 *
 *  2. Stemming alone loses prefix matches that `ILIKE '%q%'` used to find:
 *     "intern" stems to `intern`, "Internship" to `internship`, and the two do
 *     not match. The prefix query below restores that, so searching "intern"
 *     still finds every internship — which on this project is the single most
 *     common search there is.
 */

/** Below this length a query goes back to `ILIKE`; see `SHORT_QUERY_*` below. */
export const MIN_FTS_LENGTH = 3;

/**
 * Terms shorter than this stay exact in the prefix query. A one-letter `:*`
 * matches most of the table and is worse than useless — "c++" should look for
 * the token `c`, not for everything beginning with "c".
 */
const MIN_PREFIX_LENGTH = 3;

/** Letters and digits only, in the order they were typed. Never empty strings. */
export function searchTerms(raw: string): string[] {
  return raw.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * True when the user is using `websearch_to_tsquery`'s own syntax — a quoted
 * phrase, a `-negation`, or an explicit `or`.
 *
 * This matters because the prefix query below is a flat AND of every word it
 * can see, and it cannot express any of those. OR-ing it alongside a websearch
 * query would therefore UNDO them: `engineer -platform` would come back with
 * the platform rows, because the prefix arm read "platform" as a term to
 * match. When the user reaches for the syntax, they get the syntax, and the
 * prefix arm steps aside.
 */
export function looksLikeWebsearchSyntax(raw: string): boolean {
  if (raw.includes('"')) return true;
  return raw
    .split(/\s+/)
    .some((token) => /^-\S/.test(token) || token.toLowerCase() === "or");
}

/**
 * The `to_tsquery` input that reproduces ILIKE-style prefix matching:
 * `"backend intern"` → `backend:* & intern:*`. Null when the input has no word
 * characters to build from, or when it is a websearch expression whose meaning
 * a flat AND would destroy — in either case the caller omits the arm.
 */
export function prefixTsQuery(raw: string): string | null {
  if (looksLikeWebsearchSyntax(raw)) return null;
  const terms = searchTerms(raw);
  if (terms.length === 0) return null;
  return terms
    .map((t) => (t.length >= MIN_PREFIX_LENGTH ? `${t}:*` : t))
    .join(" & ");
}

/**
 * Whether a query is long enough for full-text search. Below it, one or two
 * characters carry almost no lexical signal and the pre-Phase-7 `ILIKE` path
 * is both simpler and more predictable — UPGRADE.md §7 asks for exactly this
 * fallback.
 */
export function useFullTextSearch(raw: string): boolean {
  return raw.trim().length >= MIN_FTS_LENGTH;
}
