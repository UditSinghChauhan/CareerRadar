/**
 * Why could we not connect?
 * ──────────────────────────
 * A failed database connection tells you almost nothing on its own. `ETIMEDOUT`
 * names an address but not why that address was chosen; pg's own
 * `connectionTimeoutMillis` gives the cleaner "timeout expired" but drops the
 * address entirely. Neither says the thing that actually matters when `psql` on
 * the identical URL works: which addresses the host resolves to, and which of
 * them this process can reach.
 *
 * That asymmetry is the whole `pg`-vs-`libpq` difference. libpq walks every
 * A/AAAA record in turn under its own `connect_timeout`; Node resolves through
 * `dns.lookup`, whose ordering and address-family filtering are the C library's
 * business and can differ from what `dig` shows. When one family is a blackhole
 * — common on WSL2, VPNs, and corporate networks that advertise IPv6 without
 * routing it — `psql` succeeds and Node hangs.
 *
 * So on a connection failure the backfill prints this: the resolved addresses in
 * the order this process would try them, and a short reachability probe of each.
 * The probe is TCP only — it proves a route exists, never that credentials work
 * — and every attempt is bounded, because a diagnostic that hangs is worse than
 * no diagnostic at all.
 */

import dns from "node:dns";
import net from "node:net";

/** Per-address budget. Long enough to cross an ocean, short enough to read. */
const PROBE_TIMEOUT_MS = 3_000;

/** Errors that mean "the connection never happened", as opposed to a query or auth failure. */
const CONNECTION_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EPIPE",
]);

/**
 * pg's own connect deadline rejects with a plain `Error("timeout expired")` —
 * no code, no address — so it has to be recognised by message.
 */
const CONNECTION_ERROR_MESSAGES = [
  "timeout expired",
  "Connection terminated due to connection timeout",
  "Connection terminated unexpectedly",
];

function codeOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** Is this failure about reaching the database, rather than about what it said back? */
export function isConnectionFailure(err: unknown): boolean {
  for (let cause: unknown = err, depth = 0; cause && depth < 5; depth++) {
    const code = codeOf(cause);
    if (code !== undefined && CONNECTION_ERROR_CODES.has(code)) return true;

    const message =
      typeof cause === "object" && cause !== null
        ? (cause as { message?: unknown }).message
        : undefined;
    if (
      typeof message === "string" &&
      CONNECTION_ERROR_MESSAGES.some((m) => message.includes(m))
    ) {
      return true;
    }

    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}

export interface AddressProbe {
  address: string;
  family: 4 | 6;
  /** Milliseconds to a completed TCP handshake, or null when it did not complete. */
  connectedInMs: number | null;
  /** Why it did not complete: an errno, or "no answer" when the probe simply ran out. */
  failure?: string;
}

export interface ConnectionDiagnosis {
  host: string;
  port: number;
  /** As `dns.lookup` hands them over — the order this process would actually try. */
  addresses: AddressProbe[];
  /** Set when the name could not be resolved at all. */
  lookupError?: string;
}

/** TCP-connect to one address under a fixed budget. Never throws. */
async function probe(
  address: string,
  family: 4 | 6,
  port: number,
): Promise<AddressProbe> {
  const startedAt = Date.now();
  return new Promise<AddressProbe>((resolve) => {
    const socket = net.connect({ host: address, port, family });
    const done = (result: Omit<AddressProbe, "address" | "family">) => {
      socket.destroy();
      resolve({ address, family, ...result });
    };
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.on("connect", () => done({ connectedInMs: Date.now() - startedAt }));
    socket.on("timeout", () =>
      done({
        connectedInMs: null,
        failure: `no answer in ${PROBE_TIMEOUT_MS}ms`,
      }),
    );
    socket.on("error", (err: NodeJS.ErrnoException) =>
      done({ connectedInMs: null, failure: err.code ?? err.message }),
    );
  });
}

/**
 * Resolve the connection string's host and probe every address it yields.
 *
 * Uses `dns.lookup` rather than `dns.resolve*` on purpose: `lookup` goes through
 * the same system resolver `pg` and `libpq` do, so this reports the addresses
 * that would really be tried, not the ones a DNS query would return.
 */
export async function diagnoseConnection(
  connectionString: string,
): Promise<ConnectionDiagnosis | null> {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "") return null;
  const port = url.port === "" ? 5432 : Number.parseInt(url.port, 10);

  let resolved: dns.LookupAddress[];
  try {
    resolved = await dns.promises.lookup(host, { all: true, verbatim: true });
  } catch (err) {
    return {
      host,
      port,
      addresses: [],
      lookupError: (err as NodeJS.ErrnoException).code ?? String(err),
    };
  }

  const addresses = await Promise.all(
    resolved.map((entry) =>
      probe(entry.address, entry.family === 6 ? 6 : 4, port),
    ),
  );

  return { host, port, addresses };
}

/** The diagnosis as printable lines. Pure, so the formatting is testable. */
export function formatDiagnosis(diagnosis: ConnectionDiagnosis): string {
  const lines = [
    "  Connection target",
    "  ─────────────────",
    `  Host              ${diagnosis.host}:${diagnosis.port}`,
  ];

  if (diagnosis.lookupError !== undefined) {
    lines.push(`  Resolution        FAILED (${diagnosis.lookupError})`);
    lines.push(
      "  The host name does not resolve for this process. Check DATABASE_URL",
      "  for a typo before looking anywhere else.",
    );
    return lines.join("\n");
  }

  lines.push(
    `  Addresses         ${diagnosis.addresses.length} (in the order this process would try them)`,
  );
  for (const entry of diagnosis.addresses) {
    const status =
      entry.connectedInMs === null
        ? `UNREACHABLE — ${entry.failure ?? "unknown"}`
        : `reachable in ${entry.connectedInMs}ms`;
    lines.push(`      IPv${entry.family}  ${entry.address}  ${status}`);
  }

  const reachable = diagnosis.addresses.filter(
    (a) => a.connectedInMs !== null,
  ).length;
  const unreachable = diagnosis.addresses.length - reachable;

  if (reachable === 0 && diagnosis.addresses.length > 0) {
    lines.push(
      "",
      "  No address answered. The database is unreachable from this machine —",
      "  a firewall, a VPN, or a suspended compute, not a bug in this script.",
    );
  } else if (unreachable > 0) {
    lines.push(
      "",
      `  ${unreachable} of ${diagnosis.addresses.length} addresses did not answer, and ${reachable} did.`,
      "  This is the case where psql succeeds and Node hangs: libpq walks every",
      "  address, while a Node client can commit to one. Pin the working family",
      "  in DATABASE_URL by using its address directly, or fix the route.",
    );
  } else {
    lines.push(
      "",
      "  Every address answered on TCP, so the failure was after the connection:",
      "  TLS, authentication, or the database itself. Read the error above.",
    );
  }

  return lines.join("\n");
}
