/**
 * Provider Verification Script
 * ─────────────────────────────
 * Runs live HTTP checks against all configured company endpoints and prints
 * a Phase D ingestion recovery report.
 *
 * Usage:
 *   node --loader ts-node/esm src/providers/verify.ts
 *   # or after build:
 *   node dist/providers/verify.mjs
 *
 * Can also be triggered via: GET /api/sync/verify (if wired up)
 */

import { getAllConfigs } from "./config.js";

interface VerifyResult {
  companySlug: string;
  providerName: string;
  enabled: boolean;
  status: "live" | "empty" | "broken" | "auth_required" | "no_public_api" | "skipped";
  jobCount?: number;
  error?: string;
  note?: string;
}

async function checkGreenhouse(slug: string, token: string): Promise<{ count: number }> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`;
  const res = await fetch(url, {
    headers: { "User-Agent": "CareerRadar/0.2", Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const data = (await res.json()) as { jobs?: unknown[]; error?: string };
  if (data.error) throw new Error(data.error);
  return { count: data.jobs?.length ?? 0 };
}

async function checkLever(slug: string, leverSlug: string): Promise<{ count: number }> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(leverSlug)}?mode=json&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "CareerRadar/0.2", Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const data = await res.json();
  if (typeof data === "string" || data?.message) {
    throw new Error(String(data?.message ?? data));
  }
  if (!Array.isArray(data)) throw new Error("Unexpected response shape");
  return { count: data.length };
}

async function checkAshby(slug: string, org: string): Promise<{ count: number }> {
  const res = await fetch("https://api.ashbyhq.com/posting-public/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "CareerRadar/0.2",
      Accept: "application/json",
    },
    body: JSON.stringify({ organizationHostedJobsPageName: org }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const data = (await res.json()) as { results?: unknown[] };
  return { count: data.results?.length ?? 0 };
}

async function checkSmartRecruiters(slug: string, companyId: string): Promise<{ count: number }> {
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings?limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "CareerRadar/0.2", Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const data = (await res.json()) as { totalFound?: number };
  return { count: data.totalFound ?? 0 };
}

async function verifyOne(cfg: ReturnType<typeof getAllConfigs>[0]): Promise<VerifyResult> {
  const base: VerifyResult = {
    companySlug: cfg.companySlug,
    providerName: cfg.providerName,
    enabled: cfg.enabled !== false,
    status: "skipped",
  };

  try {
    let result: { count: number };

    switch (cfg.providerName) {
      case "greenhouse":
        result = await checkGreenhouse(cfg.companySlug, cfg.providerId);
        break;
      case "lever":
        result = await checkLever(cfg.companySlug, cfg.providerId);
        break;
      case "ashby":
        result = await checkAshby(cfg.companySlug, cfg.providerId);
        break;
      case "smartrecruiters":
        result = await checkSmartRecruiters(cfg.companySlug, cfg.providerId);
        break;
      case "workday":
        return { ...base, status: "no_public_api", note: "Workday CXS API requires browser session auth (HTTP 401). hasPublicApi=false." };
      default:
        return { ...base, status: "skipped", note: `Provider "${cfg.providerName}" not checkable via verify script.` };
    }

    if (result.count === 0) {
      return { ...base, status: "empty", jobCount: 0 };
    }
    return { ...base, status: "live", jobCount: result.count };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const httpStatus = (err as { status?: number }).status;
    if (httpStatus === 401 || httpStatus === 403) {
      return { ...base, status: "auth_required", error: msg };
    }
    return { ...base, status: "broken", error: msg };
  }
}

export async function runVerification(): Promise<{
  results: VerifyResult[];
  summary: {
    working: VerifyResult[];
    empty: VerifyResult[];
    broken: VerifyResult[];
    authRequired: VerifyResult[];
    noPublicApi: VerifyResult[];
  };
}> {
  const allConfigs = getAllConfigs();
  const results = await Promise.all(allConfigs.map(verifyOne));

  const working = results.filter((r) => r.status === "live");
  const empty = results.filter((r) => r.status === "empty");
  const broken = results.filter((r) => r.status === "broken");
  const authRequired = results.filter((r) => r.status === "auth_required");
  const noPublicApi = results.filter((r) => r.status === "no_public_api");

  return { results, summary: { working, empty, broken, authRequired, noPublicApi } };
}

// Note: This module is imported by the Express route in routes/sync.ts.
// CLI usage is not supported in the bundled server build because esbuild
// merges all modules into a single file and import.meta.url cannot
// distinguish entry-point from imported module.
// To run a standalone verification, call GET /api/sync/verify instead.
