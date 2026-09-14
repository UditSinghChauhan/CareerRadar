/**
 * Aggregator per-query probe — where does the 5.5(A) volume actually come from?
 *
 *   pnpm --filter @workspace/api-server run aggregator:probe
 *
 * `project:intake` reports one number per platform, which is the wrong
 * resolution for judging the query expansion: it cannot distinguish "the
 * queries return little", "the queries return plenty but overlap almost
 * completely", and "pagination stopped after page one". This reports all three,
 * per query.
 *
 * For each of Adzuna and JSearch it prints:
 *
 *   - raw results per query, and how deep pagination actually went before the
 *     provider stopped (short page, error, or budget exhaustion)
 *   - unique-after-dedup per query, in the order the provider runs them
 *   - marginal contribution: how many postings each query added that no EARLIER
 *     query had already produced. This is the number that says whether an extra
 *     query is worth its request, and it is the one a per-query raw count hides.
 *   - the overlap matrix: pairwise shared postings between queries
 *
 * It mirrors the provider's own paging and dedup rules rather than importing
 * them, because the point is to observe those rules from outside. If this and
 * the provider ever disagree on the total, that disagreement is the finding.
 *
 * REQUIRES CREDENTIALS. Without them it prints what it would do and the
 * arithmetic ceiling, and exits 0 — it never fabricates counts.
 *
 * Spends real quota: up to 24 Adzuna requests (of 250/day) and 16 JSearch
 * requests (of 200/MONTH). The JSearch figure is 8% of the monthly allowance,
 * so `--adzuna-only` exists for iterating without burning it.
 *
 * Run with tsx, not bundled — see the esbuild note in verify-providers.ts.
 */

import net from "node:net";

net.setDefaultAutoSelectFamily(true);
net.setDefaultAutoSelectFamilyAttemptTimeout(1_000);

const TIMEOUT_MS = 30_000;

// ─── Mirrors of the provider constants (deliberately duplicated, see header) ──

const ADZUNA_QUERIES = [
  "software engineer intern",
  "SDE intern",
  "software developer fresher",
  "graduate engineer trainee software",
  "entry level software engineer",
  "backend developer intern",
  "full stack intern",
  "SDE 1",
];
const ADZUNA_PAGES = 3;
const ADZUNA_PER_PAGE = 50;

const JSEARCH_QUERIES = [
  "software engineer intern India",
  "SDE intern 2027",
  "software developer fresher India",
  "graduate engineer trainee software",
  "entry level software engineer India",
  "backend developer intern India",
  "full stack intern India",
  "SDE 1 India",
];
const JSEARCH_PAGES = 2;

interface QueryResult {
  query: string;
  /** Raw postings returned across all pages, before any dedup. */
  raw: number;
  /** Distinct ids within this query alone. */
  unique: number;
  /** Ids this query contributed that no earlier query had. */
  marginal: number;
  /** Pages actually requested before stopping. */
  pagesFetched: number;
  /** Why paging stopped. */
  stoppedBecause: "pages-exhausted" | "short-page" | "empty-page" | "error";
  ids: Set<string>;
  error?: string;
}

async function getJson(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "CareerRadar/0.2 (job-aggregator; query probe)",
      Accept: "application/json",
      ...headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return { status: res.status, body: null };
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function probeAdzuna(
  appId: string,
  appKey: string,
): Promise<QueryResult[]> {
  const results: QueryResult[] = [];
  const seenAcrossQueries = new Set<string>();

  for (const query of ADZUNA_QUERIES) {
    const ids = new Set<string>();
    let raw = 0;
    let pagesFetched = 0;
    let stoppedBecause: QueryResult["stoppedBecause"] = "pages-exhausted";
    let error: string | undefined;

    for (let page = 1; page <= ADZUNA_PAGES; page++) {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        what: query,
        category: "it-jobs",
        max_days_old: "30",
        results_per_page: String(ADZUNA_PER_PAGE),
      });
      const url = `https://api.adzuna.com/v1/api/jobs/in/search/${page}?${params}`;

      try {
        const { status, body } = await getJson(url);
        pagesFetched++;
        if (status !== 200 || body === null) {
          stoppedBecause = "error";
          error = `HTTP ${status}`;
          break;
        }
        const page_results =
          (body as { results?: Array<{ id: string }> }).results ?? [];
        raw += page_results.length;
        for (const r of page_results) ids.add(String(r.id));

        if (page_results.length === 0) {
          stoppedBecause = "empty-page";
          break;
        }
        if (page_results.length < ADZUNA_PER_PAGE) {
          stoppedBecause = "short-page";
          break;
        }
      } catch (err) {
        pagesFetched++;
        stoppedBecause = "error";
        error = err instanceof Error ? err.message : String(err);
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    let marginal = 0;
    for (const id of ids) if (!seenAcrossQueries.has(id)) marginal++;
    for (const id of ids) seenAcrossQueries.add(id);

    results.push({
      query,
      raw,
      unique: ids.size,
      marginal,
      pagesFetched,
      stoppedBecause,
      ids,
      ...(error ? { error } : {}),
    });
  }

  return results;
}

async function probeJSearch(apiKey: string): Promise<QueryResult[]> {
  const results: QueryResult[] = [];
  const seenAcrossQueries = new Set<string>();

  for (const query of JSEARCH_QUERIES) {
    const ids = new Set<string>();
    let raw = 0;
    let pagesFetched = 0;
    let stoppedBecause: QueryResult["stoppedBecause"] = "pages-exhausted";
    let error: string | undefined;

    for (let page = 1; page <= JSEARCH_PAGES; page++) {
      const params = new URLSearchParams({
        query,
        country: "IN",
        date_posted: "month",
        page: String(page),
        num_pages: "1",
      });
      const url = `https://jsearch.p.rapidapi.com/search-v2?${params}`;

      try {
        const { status, body } = await getJson(url, {
          "x-rapidapi-key": apiKey,
          "x-rapidapi-host": "jsearch.p.rapidapi.com",
        });
        pagesFetched++;
        if (status !== 200 || body === null) {
          stoppedBecause = "error";
          error = `HTTP ${status}`;
          break;
        }
        const jobs =
          (body as { data?: { jobs?: Array<{ job_id: string }> } }).data
            ?.jobs ?? [];
        raw += jobs.length;
        for (const j of jobs) ids.add(j.job_id);

        if (jobs.length === 0) {
          stoppedBecause = "empty-page";
          break;
        }
      } catch (err) {
        pagesFetched++;
        stoppedBecause = "error";
        error = err instanceof Error ? err.message : String(err);
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    let marginal = 0;
    for (const id of ids) if (!seenAcrossQueries.has(id)) marginal++;
    for (const id of ids) seenAcrossQueries.add(id);

    results.push({
      query,
      raw,
      unique: ids.size,
      marginal,
      pagesFetched,
      stoppedBecause,
      ids,
      ...(error ? { error } : {}),
    });
  }

  return results;
}

function report(label: string, results: QueryResult[]): void {
  const rawTotal = results.reduce((s, r) => s + r.raw, 0);
  const union = new Set<string>();
  for (const r of results) for (const id of r.ids) union.add(id);

  process.stdout.write(`\n══ ${label} ══\n\n`);
  process.stdout.write(
    "query                                  raw  uniq  marginal  pages  stopped\n",
  );
  process.stdout.write("─".repeat(92) + "\n");
  for (const r of results) {
    process.stdout.write(
      `${r.query.padEnd(36)} ${String(r.raw).padStart(5)} ${String(
        r.unique,
      ).padStart(5)} ${String(r.marginal).padStart(9)} ${String(
        r.pagesFetched,
      ).padStart(6)}  ${r.stoppedBecause}${r.error ? ` (${r.error})` : ""}\n`,
    );
  }
  process.stdout.write("─".repeat(92) + "\n");
  process.stdout.write(
    `${"TOTAL".padEnd(36)} ${String(rawTotal).padStart(5)} ${String(
      union.size,
    ).padStart(5)} ${String(union.size).padStart(9)}\n\n`,
  );

  const collapse = rawTotal === 0 ? 0 : 1 - union.size / rawTotal;
  process.stdout.write(
    `Raw postings fetched : ${rawTotal}\n` +
      `Unique after dedup   : ${union.size}\n` +
      `Collapsed by overlap : ${(collapse * 100).toFixed(1)}%\n\n`,
  );

  if (results.length > 1) {
    process.stdout.write("Pairwise overlap (shared postings):\n");
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const a = results[i] as QueryResult;
        const b = results[j] as QueryResult;
        let shared = 0;
        for (const id of a.ids) if (b.ids.has(id)) shared++;
        if (shared > 0) {
          process.stdout.write(
            `  ${shared.toString().padStart(4)}  "${a.query}" ∩ "${b.query}"\n`,
          );
        }
      }
    }
    process.stdout.write("\n");
  }

  const zeroMarginal = results.filter((r) => r.marginal === 0 && r.raw > 0);
  if (zeroMarginal.length > 0) {
    process.stdout.write(
      "Queries that added NOTHING new (candidates to drop, they cost requests):\n",
    );
    for (const r of zeroMarginal)
      process.stdout.write(`  - "${r.query}" (${r.raw} raw, 0 marginal)\n`);
    process.stdout.write("\n");
  }
}

function ceilingNote(): void {
  process.stdout.write(
    "\nNo credentials in this environment — nothing was requested and no counts\n" +
      "are claimed. What the code WOULD do, as arithmetic only:\n\n" +
      `  Adzuna : ${ADZUNA_QUERIES.length} queries x up to ${ADZUNA_PAGES} pages x ${ADZUNA_PER_PAGE}/page\n` +
      `           = up to ${ADZUNA_QUERIES.length * ADZUNA_PAGES} requests, ceiling ${ADZUNA_QUERIES.length * ADZUNA_PAGES * ADZUNA_PER_PAGE} raw postings\n` +
      `           (was 6 queries x 1 page = 6 requests, ceiling 300)\n\n` +
      `  JSearch: ${JSEARCH_QUERIES.length} queries x up to ${JSEARCH_PAGES} pages\n` +
      `           = up to ${JSEARCH_QUERIES.length * JSEARCH_PAGES} requests, ceiling depends on page size (~10/page)\n` +
      `           (was 6 queries x 1 page = 6 requests)\n\n` +
      "  These are CEILINGS, not predictions. The real number is whatever the\n" +
      "  queries return minus whatever dedup collapses, and that is exactly what\n" +
      "  this script measures once the keys are present. Set ADZUNA_APP_ID,\n" +
      "  ADZUNA_APP_KEY and JSEARCH_API_KEY in the root .env and re-run.\n",
  );
}

async function main(): Promise<void> {
  const appId = process.env["ADZUNA_APP_ID"];
  const appKey = process.env["ADZUNA_APP_KEY"];
  const jsearchKey = process.env["JSEARCH_API_KEY"];
  const adzunaOnly = process.argv.includes("--adzuna-only");

  if (!appId && !appKey && !jsearchKey) {
    ceilingNote();
    return;
  }

  if (appId && appKey) {
    report(
      "ADZUNA (api.adzuna.com/v1/api/jobs/in/search)",
      await probeAdzuna(appId, appKey),
    );
  } else {
    process.stdout.write(
      "\nADZUNA: skipped — ADZUNA_APP_ID / ADZUNA_APP_KEY not set. No status claimed.\n",
    );
  }

  if (adzunaOnly) {
    process.stdout.write(
      "\nJSEARCH: skipped by --adzuna-only (preserves the 200/month allowance).\n",
    );
    return;
  }

  if (jsearchKey) {
    report(
      "JSEARCH (jsearch.p.rapidapi.com/search-v2)",
      await probeJSearch(jsearchKey),
    );
  } else {
    process.stdout.write(
      "\nJSEARCH: skipped — JSEARCH_API_KEY not set. No status claimed.\n",
    );
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Probe failed: ${String(err)}\n`);
  process.exitCode = 1;
});
