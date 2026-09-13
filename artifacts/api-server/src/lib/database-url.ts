/**
 * Which database is DATABASE_URL pointing at?
 * ────────────────────────────────────────────
 * CareerRadar's deployed database holds live data that the upstream job APIs
 * cannot re-supply, so any script that mutates rows in bulk has to establish
 * where it is aimed *before* it opens a transaction — not discover it from a
 * query that failed halfway through.
 *
 * This module only answers the question. Deciding what to do about the answer
 * belongs to the caller, so that a read-only tool and a destructive one can
 * take the same reading and act differently on it.
 */

/** Hosts that mean "the Postgres on this machine". */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/**
 * The hostname in a connection string, or null when it has none — a bare
 * `postgres:///db` socket URL, or something that is not a URL at all.
 *
 * IPv6 hostnames come back from the URL parser bracketed (`[::1]`); the
 * brackets are URL syntax rather than part of the host, so they are stripped.
 */
export function databaseHost(connectionString: string): string | null {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return null;
  }
  const host = url.hostname;
  if (host === "") return null;
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/**
 * True when the connection string points at this machine.
 *
 * A connection string with no host is treated as local: it is a Unix-socket
 * connection, which cannot reach a hosted database. An unparseable string is
 * NOT treated as local — an unreadable target is not a safe one.
 */
export function isLocalDatabaseUrl(connectionString: string): boolean {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return false;
  }
  if (url.hostname === "") return true;
  const host = databaseHost(connectionString);
  return host !== null && LOCAL_HOSTNAMES.has(host.toLowerCase());
}

/** Host for humans, for use in log and error messages. */
export function describeDatabaseTarget(connectionString: string): string {
  const host = databaseHost(connectionString);
  if (host === null) {
    return isLocalDatabaseUrl(connectionString)
      ? "a local Unix socket"
      : "an unparseable DATABASE_URL";
  }
  return host;
}
