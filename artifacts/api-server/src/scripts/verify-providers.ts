/**
 * Provider health audit — CLI entry point.
 *
 *   pnpm --filter @workspace/api-server run verify:providers
 *   pnpm --filter @workspace/api-server run verify:providers -- --write
 *
 * Prints the report; `--write` also saves it to `docs/provider-health.md`.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM providers/verify.ts
 * ─────────────────────────────────────────────────────────
 * The server build is a single esbuild bundle: every imported module is inlined
 * into `dist/index.mjs`, so a top-level `if (import.meta.url === …)` main guard
 * placed in an imported module fires on every server boot. This file is run
 * with tsx and is imported by nothing, so its top-level code is safe.
 *
 * It makes ~60 outbound requests and touches no database — it can be run
 * against any checkout without DATABASE_URL.
 */

import net from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderReport, runVerification } from "../providers/verify";

/**
 * Happy Eyeballs (RFC 8305) for this process only.
 *
 * WHY
 * ────
 * On the maintainer's WSL2 box, `api.lever.co` resolves to three IPv4
 * addresses and three NAT64 IPv6 addresses (64:ff9b::/96). Node picks an
 * address that has no route out and hangs until ETIMEDOUT, so every one of the
 * 20 Lever configs came back as `fetch failed` while `curl` against the same
 * URL returned 200 with 11 postings. Enabling address-family racing makes Node
 * fall back to the address that works, in ~2s.
 *
 * SCOPED TO THIS SCRIPT DELIBERATELY. These are process-global socket defaults.
 * Setting them in the server would change the behaviour of every outbound
 * connection the API makes — provider fetches, Neon, Clerk, Gemini — on an
 * environment (Render) where this failure has never been observed and where the
 * change could not be verified from here. If the same symptom ever shows up in
 * production logs, that is the moment to make it global, with a measurement to
 * justify it.
 */
net.setDefaultAutoSelectFamily(true);
net.setDefaultAutoSelectFamilyAttemptTimeout(1_000);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** src/scripts → api-server → artifacts → repo root */
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const REPORT_PATH = path.join(REPO_ROOT, "docs", "provider-health.md");

async function main(): Promise<void> {
  const write = process.argv.includes("--write");

  process.stderr.write("Auditing every provider config with a live request…\n");
  const started = Date.now();

  const { results, summary } = await runVerification();
  const report = renderReport(results, summary);

  process.stdout.write(report + "\n");

  process.stderr.write(
    `\nProbed ${summary.total} configs in ${Math.round(
      (Date.now() - started) / 1000,
    )}s.\n`,
  );
  for (const [verdict, count] of Object.entries(summary.byVerdict)) {
    process.stderr.write(`  ${verdict}: ${count}\n`);
  }

  if (write) {
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, report + "\n", "utf8");
    process.stderr.write(`\nWrote ${REPORT_PATH}\n`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Audit failed: ${String(err)}\n`);
  process.exitCode = 1;
});
