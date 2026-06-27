/**
 * Company Catalog Routes
 * ───────────────────────
 * Read-only discovery API for CareerRadar's tracked company universe.
 * No authentication required — this is public reference data.
 *
 * GET /api/companies/catalog                    — full catalog (all companies)
 * GET /api/companies/catalog/providers          — list all distinct provider names
 * GET /api/companies/catalog/stats              — aggregate counts by provider / status
 * GET /api/companies/catalog/provider/:provider — companies filtered by ATS provider
 * GET /api/companies/catalog/search?q=<query>   — full-text search across name, industry, roles
 *
 * QUERY PARAMETERS (all routes except /search and /stats)
 * ──────────────────────────────────────────────────────────
 *   active=true|false         filter by isActive flag
 *   verified=true             return only verificationStatus="verified" entries
 *   country=<name>            filter by country (case-insensitive)
 *   hiringCategory=fresher|experienced|both
 *
 * ADDING A NEW COMPANY
 * ─────────────────────
 * All you need to do is add an entry to src/providers/catalog.ts.
 * This route file never needs to change — it reads from the catalog at
 * runtime and reflects every new entry automatically.
 */

import { Router } from "express";
import {
  getCatalog,
  searchCatalog,
  getCatalogProviders,
  getCatalogStats,
  type ProviderName,
  type VerificationStatus,
  type HiringCategory,
} from "../providers/catalog";

const router = Router();

// ─── GET /api/companies/catalog ───────────────────────────────────────────────

router.get("/companies/catalog", (req, res) => {
  const { active, verified, country, hiringCategory } = req.query as Record<string, string | undefined>;

  let isActive: boolean | undefined;
  if (active === "true") isActive = true;
  else if (active === "false") isActive = false;

  let verificationStatus: VerificationStatus | undefined;
  if (verified === "true") verificationStatus = "verified";

  let entries = getCatalog({ isActive, verificationStatus });

  if (country) {
    const c = country.toLowerCase();
    entries = entries.filter((e) => e.country.toLowerCase() === c);
  }

  if (hiringCategory) {
    entries = entries.filter((e) => e.hiringCategory === (hiringCategory as HiringCategory));
  }

  res.json({
    total: entries.length,
    entries,
  });
});

// ─── GET /api/companies/catalog/providers ─────────────────────────────────────

router.get("/companies/catalog/providers", (_req, res) => {
  const providers = getCatalogProviders();

  const withCounts = providers.map((name) => ({
    name,
    count: getCatalog({ provider: name }).length,
    activeCount: getCatalog({ provider: name, isActive: true }).length,
    verifiedCount: getCatalog({ provider: name, verificationStatus: "verified" }).length,
  }));

  res.json({ providers: withCounts });
});

// ─── GET /api/companies/catalog/stats ─────────────────────────────────────────

router.get("/companies/catalog/stats", (_req, res) => {
  res.json(getCatalogStats());
});

// ─── GET /api/companies/catalog/search ────────────────────────────────────────

router.get("/companies/catalog/search", (req, res) => {
  const q = (req.query["q"] as string | undefined) ?? "";

  if (!q.trim()) {
    res.status(400).json({
      error: "Missing query parameter",
      hint: "Use ?q=<search term> — e.g. ?q=fintech or ?q=software engineer",
    });
    return;
  }

  const results = searchCatalog(q);

  res.json({
    query: q,
    total: results.length,
    entries: results,
  });
});

// ─── GET /api/companies/catalog/provider/:provider ────────────────────────────

router.get("/companies/catalog/provider/:provider", (req, res) => {
  const providerName = req.params["provider"] as string;

  const validProviders: ProviderName[] = [
    "greenhouse",
    "lever",
    "ashby",
    "smartrecruiters",
    "workday",
    "custom",
    "unknown",
  ];

  if (!validProviders.includes(providerName as ProviderName)) {
    res.status(400).json({
      error: `Unknown provider "${providerName}"`,
      validProviders,
    });
    return;
  }

  const { active, verified } = req.query as Record<string, string | undefined>;

  let isActive: boolean | undefined;
  if (active === "true") isActive = true;
  else if (active === "false") isActive = false;

  let verificationStatus: VerificationStatus | undefined;
  if (verified === "true") verificationStatus = "verified";

  const entries = getCatalog({
    provider: providerName as ProviderName,
    isActive,
    verificationStatus,
  });

  res.json({
    provider: providerName,
    total: entries.length,
    entries,
  });
});

export default router;
