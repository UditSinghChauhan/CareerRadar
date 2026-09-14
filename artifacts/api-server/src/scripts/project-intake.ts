/**
 * Projected intake — what one full sync would actually fetch.
 *
 *   pnpm --filter @workspace/api-server run project:intake
 *
 * Runs every ENABLED config through its real provider — including
 * `filterCountry`, `isListed` and every other filter the scheduler applies —
 * and reports the per-platform breakdown. It writes nothing: no database, no
 * normalizer, no dedup. It answers one question before a merge, "does enabling
 * these boards take the active table to 3,000 or to 15,000", without having to
 * run a sync against the live table to find out.
 *
 * WHY THIS IS NOT THE SAME AS docs/provider-health.md
 * ────────────────────────────────────────────────────
 * The health audit reports how many postings an endpoint *carries*. This
 * reports how many survive the provider's own filtering and would actually be
 * ingested. For an India-filtered board those differ by a lot: Ashby's Linear
 * board carries 30 postings and contributes 0.
 *
 * Providers needing an API key absent from the environment are listed as
 * unmeasured rather than counted as zero — a missing key is not evidence of
 * zero intake.
 *
 * Run with tsx, not bundled — see the note in verify-providers.ts about the
 * esbuild `import.meta.url` trap.
 */

import net from "node:net";
import { getAllConfigs } from "../providers/config";
import { providerRegistry } from "../providers/registry";
import type { CompanyProviderConfig } from "../providers/types";
import { normalizeLocation } from "../relevance/location";

// See verify-providers.ts for why this is set here and not in the server.
net.setDefaultAutoSelectFamily(true);
net.setDefaultAutoSelectFamilyAttemptTimeout(1_000);

/** Providers that cannot run without a credential, and the env var each needs. */
const CREDENTIALS: Record<string, string[]> = {
  adzuna: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
  jsearch: ["JSEARCH_API_KEY"],
};

interface PlatformTotals {
  configs: number;
  jobs: number;
  internships: number;
  india: number;
  unmeasured: string[];
}

const CONCURRENCY = 4;

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        await fn(items[index] as T);
      }
    }),
  );
}

async function main(): Promise<void> {
  const enabled = getAllConfigs().filter((c) => c.enabled !== false);
  const totals = new Map<string, PlatformTotals>();

  const slotFor = (platform: string): PlatformTotals => {
    let slot = totals.get(platform);
    if (!slot) {
      slot = { configs: 0, jobs: 0, internships: 0, india: 0, unmeasured: [] };
      totals.set(platform, slot);
    }
    return slot;
  };

  process.stderr.write(
    `Fetching ${enabled.length} enabled configs through their real providers…\n`,
  );

  await mapLimit(enabled, CONCURRENCY, async (cfg) => {
    const slot = slotFor(cfg.providerName);
    slot.configs++;

    const missing = (CREDENTIALS[cfg.providerName] ?? []).filter(
      (envVar) => !process.env[envVar],
    );
    if (missing.length > 0) {
      slot.unmeasured.push(`${cfg.companySlug} (needs ${missing.join(", ")})`);
      return;
    }

    const provider = providerRegistry.get(cfg.providerName);
    if (!provider) {
      slot.unmeasured.push(`${cfg.companySlug} (provider not registered)`);
      return;
    }

    try {
      const jobs = await provider.fetchJobs(cfg as CompanyProviderConfig);
      slot.jobs += jobs.length;
      slot.internships += jobs.filter((j) => j.jobType === "internship").length;
      // Measured the way the Jobs page filters it (Phase 2.0), not off the
      // provider's raw country string.
      slot.india += jobs.filter(
        (j) => normalizeLocation(j.location, j.country).isIndia === true,
      ).length;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      slot.unmeasured.push(`${cfg.companySlug} (ERROR: ${msg})`);
    }
  });

  const rows = [...totals.entries()].sort((a, b) => b[1].jobs - a[1].jobs);

  const pad = (value: string | number, width: number) =>
    String(value).padStart(width);

  process.stdout.write(
    "\nplatform          configs    jobs  interns   india  unmeasured\n",
  );
  process.stdout.write("─".repeat(78) + "\n");

  let allJobs = 0;
  let allInterns = 0;
  let allIndia = 0;

  for (const [platform, t] of rows) {
    allJobs += t.jobs;
    allInterns += t.internships;
    allIndia += t.india;

    // A platform where NOTHING could be measured prints "—", never "0".
    // Printing a zero here once made a projection read as "the aggregators
    // contribute nothing", when the truth was "the aggregators were not
    // measured at all" — the opposite conclusion about where the volume is.
    const measuredNothing = t.unmeasured.length === t.configs;
    const cell = (value: number) =>
      measuredNothing ? pad("—", 7) : pad(value, 7);

    process.stdout.write(
      `${platform.padEnd(16)} ${pad(t.configs, 7)} ${cell(t.jobs)} ${
        measuredNothing ? pad("—", 8) : pad(t.internships, 8)
      } ${cell(t.india)}  ${t.unmeasured.join("; ") || "—"}\n`,
    );
  }

  process.stdout.write("─".repeat(78) + "\n");
  process.stdout.write(
    `${"MEASURED".padEnd(16)} ${pad(enabled.length, 7)} ${pad(allJobs, 7)} ${pad(
      allInterns,
      8,
    )} ${pad(allIndia, 7)}\n\n`,
  );

  const unmeasured = rows.filter(([, t]) => t.unmeasured.length > 0);
  if (unmeasured.length > 0) {
    process.stdout.write(
      "⚠ This total is MEASURED PLATFORMS ONLY and is not comparable to a live\n" +
        "  table count, which includes rows from the platforms below.\n\n",
    );
    for (const [platform, t] of unmeasured) {
      process.stdout.write(
        `  NOT MEASURED — ${platform}: ${t.unmeasured.join("; ")}\n`,
      );
    }
    process.stdout.write(
      "\n  Their contribution is unknown, not zero. Supply the credentials and\n" +
        "  re-run, or use `run aggregator:probe` for a per-query breakdown.\n",
    );
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Projection failed: ${String(err)}\n`);
  process.exitCode = 1;
});
