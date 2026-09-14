/**
 * Provider health audit
 * ──────────────────────
 * Issues one live HTTP request per entry in `providers/config.ts` — including
 * `enabled: false` entries — and reports what actually came back.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE
 * ───────────────────────────────────────
 * Nothing here infers a provider's status. A verdict is only ever produced from
 * a response that was actually received, or from an explicitly recorded reason
 * why no request could be made (no credential available, no public API). The
 * previous version of this file carried a comment asserting Ashby returned 401;
 * that assertion was 15 months stale and wrong, and it kept 13 configs disabled
 * against a working endpoint. Assertions decay, measurements don't.
 *
 * Run it two ways:
 *   POST /api/admin/verify-providers   (authenticated, see routes/admin.ts)
 *   pnpm --filter @workspace/api-server run verify:providers   (CLI, writes the doc)
 *
 * The CLI entry point lives in `src/scripts/verify-providers.ts`, NOT here:
 * this module is imported by the server bundle, and esbuild inlines every
 * module into one file, so an `import.meta.url` main() guard would fire on
 * every server boot.
 */

import { getAllConfigs } from "./config";

/**
 * Generous on purpose. An earlier 12s budget at concurrency 6 reported all five
 * Lever boards as broken; re-probing them one at a time showed four were
 * healthy and one — `api.lever.co/v0/postings/paytm`, 210 postings — simply
 * takes over 10 seconds to answer. A timeout that gets written into a report as
 * "broken" is worse than a slow audit, because the next session acts on it.
 */
const TIMEOUT_MS = 30_000;

/** Concurrent live requests. Low enough that the audit never becomes its own bottleneck. */
const CONCURRENCY = 4;

/**
 * One retry for network-level failures and timeouts only — never for an HTTP
 * status. A 404 is a finding and must be recorded as one; a dropped socket is
 * noise and must not be.
 */
const RETRY_TRANSIENT = true;

export type Verdict =
  /** HTTP 200 and at least one posting. The only verdict that may justify `enabled: true`. */
  | "live"
  /** HTTP 200, zero postings. Board is real; the employer has nothing open. */
  | "empty"
  /** HTTP 404 — the board name/token does not exist. Almost always a stale slug. */
  | "not_found"
  /** HTTP 401/403 — the endpoint exists but refuses anonymous access. */
  | "auth_required"
  /** Any other HTTP error, timeout, or unparseable body. */
  | "error"
  /** HTTP 200, but the response cannot prove the board exists. See probeSmartRecruiters. */
  | "indeterminate"
  /** Provider is scaffolding: no public API exists (Workday, and the no-op ToS stubs). */
  | "no_public_api"
  /** A request was NOT made because the required API key is absent from this environment. */
  | "credentials_unavailable";

export interface VerifyResult {
  companySlug: string;
  providerName: string;
  /** Current `enabled` value in config.ts — so the report can flag disagreements. */
  enabled: boolean;
  /** The URL actually requested, or null when no request was made. */
  url: string | null;
  /** HTTP status received, or null when no request was made. */
  httpStatus: number | null;
  /** Postings counted in the response, or null when no request was made. */
  jobCount: number | null;
  verdict: Verdict;
  /** Error text or the reason no request was issued. */
  detail?: string;
  /** The `note` field from config.ts — why this entry is in the state it is in. */
  configNote?: string;
}

export interface VerifySummary {
  runAt: Date;
  total: number;
  byVerdict: Record<Verdict, number>;
  /** Enabled configs that did not come back `live` or `empty`. */
  enabledButNotWorking: VerifyResult[];
  /** Disabled configs that came back `live` — candidates for enabling. */
  disabledButLive: VerifyResult[];
  totalJobsDiscoverable: number;
}

// ─── Per-provider probes ──────────────────────────────────────────────────────
// Each returns the raw HTTP status and a posting count. They deliberately do
// NOT throw on a non-2xx: a 404 is a result worth recording, not an exception.

interface Probe {
  url: string;
  httpStatus: number | null;
  jobCount: number | null;
  detail?: string;
}

async function getJsonOnce(
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: unknown; detail?: string }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": "CareerRadar/0.2 (job-aggregator; provider health audit)",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    return { status: res.status, body: null };
  }

  try {
    return { status: res.status, body: await res.json() };
  } catch {
    return {
      status: res.status,
      body: null,
      detail: "HTTP 200 but the body was not JSON",
    };
  }
}

async function getJson(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown; detail?: string }> {
  try {
    return await getJsonOnce(url, init);
  } catch (err) {
    if (!RETRY_TRANSIENT) throw err;
    // Transient only. A thrown error here is a dropped socket, a DNS blip or a
    // timeout — never an HTTP status, which getJsonOnce returns rather than
    // throws. Back off briefly and give it exactly one more chance.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    return await getJsonOnce(url, init);
  }
}

function countFrom(body: unknown, key: string): number | null {
  if (body === null || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.length : null;
}

async function probeGreenhouse(token: string): Promise<Probe> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`;
  const { status, body, detail } = await getJson(url);
  return { url, httpStatus: status, jobCount: countFrom(body, "jobs"), detail };
}

async function probeLever(slug: string): Promise<Probe> {
  // No `limit` here: this audit reports how many postings a board carries, and
  // the previous version passed limit=1, which made every live board report 1.
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  const { status, body, detail } = await getJson(url);
  return {
    url,
    httpStatus: status,
    jobCount: Array.isArray(body) ? body.length : null,
    detail,
  };
}

async function probeAshby(board: string): Promise<Probe> {
  // The public job-board feed. The retired POST /posting-public/jobs endpoint
  // still 401s (re-checked 2026-09-14) and is deliberately not probed here.
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`;
  const { status, body, detail } = await getJson(url);
  return { url, httpStatus: status, jobCount: countFrom(body, "jobs"), detail };
}

/**
 * SmartRecruiters has no 404.
 *
 * Measured 2026-09-14: `/v1/companies/ThisCompanyDoesNotExistXyz123/postings`
 * returns HTTP 200 with `{"totalFound":0,"content":[]}` — byte-identical to the
 * response for a real employer with nothing open. So a zero here is NOT evidence
 * that the account exists, and `verdictFor` maps it to `indeterminate` rather
 * than `empty`. Seven configs in config.ts carried the note "SR account exists,
 * 0 postings" on the strength of exactly this response; that inference was never
 * supported by the endpoint.
 *
 * A non-zero count is still proof: only a real board returns postings.
 */
async function probeSmartRecruiters(companyId: string): Promise<Probe> {
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings?limit=1`;
  const { status, body, detail } = await getJson(url);
  // totalFound is the full count; the page limit does not cap it.
  const total =
    body !== null && typeof body === "object"
      ? (body as { totalFound?: number }).totalFound
      : undefined;
  const count = typeof total === "number" ? total : null;
  return {
    url,
    httpStatus: status,
    jobCount: count,
    detail:
      detail ??
      (count === 0
        ? "SmartRecruiters returns 200 with totalFound=0 for non-existent companies too, so this neither confirms nor refutes the board."
        : undefined),
  };
}

async function probeRemoteOk(): Promise<Probe> {
  const url = "https://remoteok.com/api";
  const { status, body, detail } = await getJson(url);
  // The first element is a legal-notice object, not a job.
  const count = Array.isArray(body) ? Math.max(0, body.length - 1) : null;
  return { url, httpStatus: status, jobCount: count, detail };
}

async function probeRemotive(category: string): Promise<Probe> {
  const url = `https://remotive.com/api/remote-jobs?category=${encodeURIComponent(category)}`;
  const { status, body, detail } = await getJson(url);
  return { url, httpStatus: status, jobCount: countFrom(body, "jobs"), detail };
}

async function probeArbeitnow(): Promise<Probe> {
  const url = "https://www.arbeitnow.com/api/job-board-api";
  const { status, body, detail } = await getJson(url);
  return { url, httpStatus: status, jobCount: countFrom(body, "data"), detail };
}

async function probeJobicy(): Promise<Probe> {
  const url = "https://jobicy.com/api/v2/remote-jobs?count=50";
  const { status, body, detail } = await getJson(url);
  return { url, httpStatus: status, jobCount: countFrom(body, "jobs"), detail };
}

async function probeAdzuna(): Promise<Probe | null> {
  const appId = process.env["ADZUNA_APP_ID"];
  const appKey = process.env["ADZUNA_APP_KEY"];
  if (!appId || !appKey) return null;

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    what: "software intern",
    results_per_page: "50",
  });
  const url = `https://api.adzuna.com/v1/api/jobs/in/search/1?${params.toString()}`;
  const { status, body, detail } = await getJson(url);
  return {
    // Never put the credentials in a report that gets committed.
    url: "https://api.adzuna.com/v1/api/jobs/in/search/1?what=software+intern",
    httpStatus: status,
    jobCount: countFrom(body, "results"),
    detail,
  };
}

async function probeJSearch(): Promise<Probe | null> {
  const apiKey = process.env["JSEARCH_API_KEY"];
  if (!apiKey) return null;

  const url =
    "https://jsearch.p.rapidapi.com/search-v2?query=software%20engineering%20intern%20India&country=IN&num_pages=1";
  const { status, body, detail } = await getJson(url, {
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": "jsearch.p.rapidapi.com",
    },
  });
  const jobs =
    body !== null && typeof body === "object"
      ? (body as { data?: { jobs?: unknown[] } }).data?.jobs
      : undefined;
  return {
    url: "https://jsearch.p.rapidapi.com/search-v2?query=…&country=IN",
    httpStatus: status,
    jobCount: Array.isArray(jobs) ? jobs.length : null,
    detail,
  };
}

function verdictFor(probe: Probe, providerName: string): Verdict {
  const { httpStatus, jobCount } = probe;
  if (httpStatus === null) return "error";
  if (httpStatus === 404) return "not_found";
  if (httpStatus === 401 || httpStatus === 403) return "auth_required";
  if (httpStatus < 200 || httpStatus >= 300) return "error";
  if (jobCount === null) return "error";
  if (jobCount > 0) return "live";
  // Zero postings means "board exists, nothing open" on every provider that
  // 404s an unknown board — but not on SmartRecruiters, which 200s everything.
  return providerName === "smartrecruiters" ? "indeterminate" : "empty";
}

type Config = ReturnType<typeof getAllConfigs>[number];

async function verifyOne(cfg: Config): Promise<VerifyResult> {
  const base = {
    companySlug: cfg.companySlug,
    providerName: cfg.providerName,
    enabled: cfg.enabled !== false,
    ...(cfg.note ? { configNote: cfg.note } : {}),
  };

  const noRequest = (verdict: Verdict, detail: string): VerifyResult => ({
    ...base,
    url: null,
    httpStatus: null,
    jobCount: null,
    verdict,
    detail,
  });

  try {
    let probe: Probe | null;

    switch (cfg.providerName) {
      case "greenhouse":
        probe = await probeGreenhouse(cfg.providerId);
        break;
      case "lever":
        probe = await probeLever(cfg.providerId);
        break;
      case "ashby":
        probe = await probeAshby(cfg.providerId);
        break;
      case "smartrecruiters":
        probe = await probeSmartRecruiters(cfg.providerId);
        break;
      case "remoteok":
        probe = await probeRemoteOk();
        break;
      case "remotive":
        probe = await probeRemotive(cfg.providerId);
        break;
      case "arbeitnow":
        probe = await probeArbeitnow();
        break;
      case "jobicy":
        probe = await probeJobicy();
        break;
      case "adzuna":
        probe = await probeAdzuna();
        if (probe === null) {
          return noRequest(
            "credentials_unavailable",
            "ADZUNA_APP_ID / ADZUNA_APP_KEY are not set in this environment — no request was made, and no status is claimed.",
          );
        }
        break;
      case "jsearch":
        probe = await probeJSearch();
        if (probe === null) {
          return noRequest(
            "credentials_unavailable",
            "JSEARCH_API_KEY is not set in this environment — no request was made, and no status is claimed.",
          );
        }
        break;
      case "workday":
        return noRequest(
          "no_public_api",
          "Workday CXS requires browser session cookies. Not probed: the only way to get a 200 is to replay a browser session, which is out of bounds.",
        );
      case "internshala":
      case "unstop":
      case "wellfound":
        return noRequest(
          "no_public_api",
          "Deliberate no-op stub — this site's ToS/robots.txt prohibit automated extraction. Not probed.",
        );
      default:
        return noRequest(
          "no_public_api",
          `No probe implemented for provider "${cfg.providerName}".`,
        );
    }

    return { ...base, ...probe, verdict: verdictFor(probe, cfg.providerName) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ...base,
      url: null,
      httpStatus: null,
      jobCount: null,
      verdict: "error",
      detail: timedOut ? `Timed out after ${TIMEOUT_MS}ms` : msg,
    };
  }
}

/** Bounded-concurrency map. The instance has 0.1 CPU; 60 parallel TLS handshakes is not polite. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

export async function runVerification(): Promise<{
  results: VerifyResult[];
  summary: VerifySummary;
}> {
  const configs = getAllConfigs();
  const results = await mapLimit(configs, CONCURRENCY, verifyOne);

  const byVerdict = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
    return acc;
  }, {});

  const summary: VerifySummary = {
    runAt: new Date(),
    total: results.length,
    byVerdict: byVerdict as Record<Verdict, number>,
    enabledButNotWorking: results.filter(
      (r) =>
        r.enabled &&
        r.verdict !== "live" &&
        r.verdict !== "empty" &&
        r.verdict !== "indeterminate",
    ),
    disabledButLive: results.filter((r) => !r.enabled && r.verdict === "live"),
    totalJobsDiscoverable: results.reduce((s, r) => s + (r.jobCount ?? 0), 0),
  };

  return { results, summary };
}

// ─── Markdown report ──────────────────────────────────────────────────────────

const VERDICT_LABEL: Record<Verdict, string> = {
  live: "✅ live",
  empty: "⚪ empty",
  indeterminate: "❔ indeterminate",
  not_found: "❌ 404",
  auth_required: "🔒 auth required",
  error: "⚠️ error",
  no_public_api: "🚫 no public API",
  credentials_unavailable: "🔑 no credential here",
};

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/\|/g, "\\|");
}

/**
 * Render the audit as the markdown committed to `docs/provider-health.md`, so
 * the run is reviewable in a PR diff rather than living only in a terminal.
 */
export function renderReport(
  results: VerifyResult[],
  summary: VerifySummary,
): string {
  // Local date, not UTC: an audit run at 03:30 IST is "today's" audit to the
  // person reading it, and the dated notes in config.ts use the same calendar.
  const date = summary.runAt.toLocaleDateString("en-CA");
  const lines: string[] = [];

  lines.push("# Provider health audit");
  lines.push("");
  lines.push(
    `Generated **${date}** by \`pnpm --filter @workspace/api-server run verify:providers\`.`,
  );
  lines.push("");
  lines.push(
    "Every row below is a live HTTP request that was actually issued and whose response was actually read.",
    "Rows marked 🚫 or 🔑 were **not** requested, and the reason is stated — no status is inferred for them.",
  );
  lines.push("");

  lines.push("## Totals");
  lines.push("");
  lines.push("| Verdict | Configs |");
  lines.push("| --- | ---: |");
  for (const verdict of Object.keys(VERDICT_LABEL) as Verdict[]) {
    const count = summary.byVerdict[verdict] ?? 0;
    if (count > 0) lines.push(`| ${VERDICT_LABEL[verdict]} | ${count} |`);
  }
  lines.push(`| **Total configs** | **${summary.total}** |`);
  lines.push("");
  lines.push(
    `Postings discoverable across all probed endpoints: **${summary.totalJobsDiscoverable}**.`,
  );
  lines.push("");

  const byProvider = new Map<string, VerifyResult[]>();
  for (const r of results) {
    const list = byProvider.get(r.providerName) ?? [];
    list.push(r);
    byProvider.set(r.providerName, list);
  }

  lines.push("## Results by provider");
  for (const [provider, rows] of [...byProvider.entries()].sort()) {
    lines.push("");
    lines.push(`### ${provider}`);
    lines.push("");
    lines.push("| Company slug | Enabled | HTTP | Jobs | Verdict | Detail |");
    lines.push("| --- | :---: | ---: | ---: | --- | --- |");
    for (const r of rows) {
      lines.push(
        `| \`${r.companySlug}\` | ${r.enabled ? "yes" : "no"} | ${cell(
          r.httpStatus,
        )} | ${cell(r.jobCount)} | ${VERDICT_LABEL[r.verdict]} | ${cell(
          r.detail,
        )} |`,
      );
    }
  }
  lines.push("");

  if (summary.disabledButLive.length > 0) {
    lines.push("## Disabled, but the endpoint returns postings");
    lines.push("");
    lines.push(
      "A live endpoint is not on its own a reason to enable a config. Several of these are",
      "off deliberately because everything they return is scoped to a region this app's user",
      "cannot apply from — read the note before flipping one on.",
    );
    lines.push("");
    for (const r of summary.disabledButLive) {
      lines.push(
        `- \`${r.providerName}:${r.companySlug}\` — ${r.jobCount} postings`,
      );
      if (r.configNote) lines.push(`  - ${r.configNote}`);
    }
    lines.push("");
  }

  if (summary.enabledButNotWorking.length > 0) {
    lines.push("## Enabled but not returning a usable response");
    lines.push("");
    for (const r of summary.enabledButNotWorking) {
      lines.push(
        `- \`${r.providerName}:${r.companySlug}\` — ${VERDICT_LABEL[r.verdict]}${
          r.detail ? ` (${r.detail})` : ""
        }`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
