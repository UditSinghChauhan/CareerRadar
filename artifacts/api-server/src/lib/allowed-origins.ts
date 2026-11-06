import type { CorsOptions } from "cors";

/**
 * ALLOWED_ORIGINS: the browser origins that may call this API, comma
 * separated, e.g.
 *
 *   ALLOWED_ORIGINS=https://careerradar.vercel.app,https://careerradar-34ec.onrender.com
 *
 * The frontend is served as a static site that proxies /api to this service
 * (vercel.json, docs/DEPLOY.md), so requests arrive with the static site's
 * origin and its Clerk session cookie. One list drives both checks:
 *
 *   - CORS: only these origins get Access-Control-Allow-Origin.
 *   - Clerk: a session token is accepted only if it was issued to one of
 *     these origins (its `azp` claim), which is enforced here, on the
 *     server, whatever the browser does.
 *
 * Unset or blank keeps the old behaviour (reflect any origin, no `azp`
 * check), so this code can deploy before the variable is set.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] | null {
  const origins = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => {
      try {
        const url = new URL(s);
        if (url.protocol !== "https:" && url.protocol !== "http:") return [];
        // A path, query or wildcard is a mistake; drop it rather than widen.
        if (url.pathname !== "/" || url.search || url.hash) return [];
        return [url.origin];
      } catch {
        return [];
      }
    });
  return origins.length ? [...new Set(origins)] : null;
}

/** The `origin` option for the cors middleware. */
export function corsOrigin(origins: string[] | null): CorsOptions["origin"] {
  return origins ?? true;
}
