/**
 * Slugify a free-text company/employer name into a URL-safe, DB-safe slug.
 * Used by aggregator providers (RemoteOK, Remotive, Adzuna, JSearch) that
 * pull jobs from many different employers not pre-seeded in the DB.
 */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "unknown-company";
}
