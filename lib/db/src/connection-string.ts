/**
 * Connection-string normalisation.
 * ─────────────────────────────────
 * `pg-connection-string` currently treats the SSL modes `prefer`, `require` and
 * `verify-ca` as aliases for `verify-full`, and warns on every connection that
 * this will change:
 *
 *   SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are
 *   treated as aliases for 'verify-full'. In the next major version
 *   (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt
 *   standard libpq semantics, which have weaker security guarantees.
 *
 * Neon's connection string carries `?sslmode=require`, so the warning fired on
 * every connection the app and every script made.
 *
 * The warning names two ways out. We take the one it recommends for keeping
 * today's behaviour — write `verify-full` explicitly — rather than
 * `uselibpqcompat=true`, which would opt into the weaker libpq semantics. Since
 * these modes are already aliases for `verify-full`, this is a no-op today and
 * pins the behaviour across the pg 9 upgrade instead of silently loosening
 * certificate checking when that lands. Neon presents a certificate from a
 * public CA, so full verification succeeds.
 *
 * Anything we cannot parse is passed through untouched — it is not this
 * function's job to decide that a connection string is invalid.
 */

/** SSL modes that pg currently aliases to `verify-full` and warns about. */
const ALIASED_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

export function normalizeConnectionString(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  const mode = url.searchParams.get("sslmode");
  if (mode === null || !ALIASED_SSL_MODES.has(mode)) return raw;

  // Respect an explicit libpq opt-in: that caller wants the new semantics.
  if (url.searchParams.get("uselibpqcompat") === "true") return raw;

  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
