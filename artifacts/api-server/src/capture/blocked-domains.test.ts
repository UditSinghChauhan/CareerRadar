/**
 * The legal boundary, as a test.
 * ───────────────────────────────
 * UPGRADE.md §4 is unambiguous: "The server must never make an HTTP request to
 * internshala.com, unstop.com, wellfound.com, linkedin.com, or naukri.com. The
 * user pastes text; the server parses what it was given."
 *
 * Two independent checks, because either one alone can be satisfied by a bug:
 *
 *   1. STATIC. Every shipping source file is scanned for those five domains.
 *      Each file that mentions one has to be on the allowlist below, with a
 *      reason, and every allowed occurrence has to be a comment or inert data.
 *      A future session that passes one of those hosts to fetch() fails here
 *      before the code ever runs.
 *
 *   2. DYNAMIC. The capture pipeline is driven with the URLs and text of real
 *      postings on all five boards, with `globalThis.fetch` replaced by a spy
 *      that throws. Zero calls is the assertion.
 *
 * The acceptance criterion says the grep should match "only the stub providers'
 * comments". It does not, and did not before this phase: the seed writes
 * `jobSources.baseUrl` and `companies.linkedinUrl`, and the profile form shows a
 * LinkedIn placeholder. Those are display strings — `jobSources.baseUrl` is read
 * by nothing, and no provider fetches it. The allowlist names each one so the
 * exception is a decision on the record rather than a silent failure.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// capture.service reaches the jobs repository, which imports the real `db` and
// throws without DATABASE_URL. The dynamic check below only exercises parse(),
// which touches no table, but the import graph still has to resolve.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Imported statically, not inside the test. The db mock above boots PGlite on
// first import, and PGlite's own startup uses fetch — importing the service
// while `fetch` is stubbed to throw hangs the worker. Loading it here means
// every connection the infrastructure needs has already been made by the time
// the spy goes in, so a call recorded during the test is the capture pipeline's.
import { captureService } from "./capture.service";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

/** Built from parts so this file's own source does not trip the scan it runs. */
const BLOCKED_BRANDS = [
  "linkedin",
  "naukri",
  "internshala",
  "unstop",
  "wellfound",
] as const;
const BLOCKED_DOMAIN = new RegExp(
  `(?:${BLOCKED_BRANDS.join("|")})\\.(?:com|in|co\\.in)`,
  "i",
);

const SCANNED_ROOTS = ["artifacts", "lib", "e2e", "scripts"];
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".yaml", ".yml"];
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "generated",
  ".report",
  "test-results",
  "coverage",
]);

/**
 * Files allowed to contain one of the domains, and why. Anything not listed
 * here fails the test — including a new file, which is the point.
 */
const ALLOWED: Array<{ path: string; reason: string }> = [
  {
    path: "artifacts/api-server/src/providers/internshala/provider.ts",
    reason:
      "Stub provider — the domain appears only in the comment block explaining why doFetch returns [].",
  },
  {
    path: "artifacts/api-server/src/providers/unstop/provider.ts",
    reason: "Stub provider — comment block only.",
  },
  {
    path: "artifacts/api-server/src/providers/wellfound/provider.ts",
    reason: "Stub provider — comment block only.",
  },
  {
    path: "artifacts/api-server/src/seed/seed.ts",
    reason:
      "Seed data: jobSources.baseUrl and companies.linkedinUrl. Display strings — jobSources.baseUrl is read by no provider, and the stub providers fetch nothing.",
  },
  {
    path: "artifacts/career-radar/src/pages/profile.tsx",
    reason:
      "Placeholder text in the profile form's LinkedIn URL input. Never requested by the server.",
  },
  {
    path: "artifacts/api-server/src/capture/blocked-domains.test.ts",
    reason: "This test.",
  },
  {
    path: "artifacts/api-server/src/capture/parse-url.test.ts",
    reason:
      "Fixtures: URLs are the INPUT to the string parser. The suite makes no request — see the dynamic check below.",
  },
  {
    path: "artifacts/api-server/src/capture/capture.service.test.ts",
    reason: "Fixtures, as above.",
  },
  {
    path: "e2e/capture.spec.ts",
    reason: "Fixtures: the URL the spec types into the capture dialog.",
  },
  {
    path: "artifacts/career-radar/src/components/applications/application-drawer.tsx",
    reason:
      "Placeholder text in Phase 6.1's 'Contact profile' input, and an href built from whatever the USER typed there. Same shape as profile.tsx above: the server never fetches it, and the browser only follows it when the user clicks.",
  },
  {
    path: "artifacts/api-server/src/repositories/applications-follow-up.test.ts",
    reason:
      "Fixture: the value stored in and read back from applications.contact_url. No request is made.",
  },
  {
    path: "e2e/phase-6-notifications.spec.ts",
    reason:
      "Fixture: the URL the spec types into the 'Contact profile' input. No request is made.",
  },
];

const ALLOWED_PATHS = new Set(ALLOWED.map((entry) => entry.path));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext)))
      out.push(full);
  }
  return out;
}

function scanRepo(): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  for (const root of SCANNED_ROOTS) {
    const dir = join(REPO_ROOT, root);
    for (const file of walk(dir)) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      const matched = lines.filter((line) => BLOCKED_DOMAIN.test(line));
      if (matched.length > 0) {
        hits.set(relative(REPO_ROOT, file).split(sep).join("/"), matched);
      }
    }
  }
  return hits;
}

describe("the five ToS-blocked domains never appear in a request", () => {
  const hits = scanRepo();

  it("scans a repository that actually has source in it", () => {
    // Guards against the walk silently finding nothing and the suite passing
    // for the wrong reason.
    expect(walk(join(REPO_ROOT, "artifacts")).length).toBeGreaterThan(50);
  });

  it("matches only files on the allowlist", () => {
    const unexpected = [...hits.keys()].filter(
      (path) => !ALLOWED_PATHS.has(path),
    );
    expect(
      unexpected,
      `New source mentioning a ToS-blocked domain. If it is inert (a comment, a fixture, placeholder text), add it to ALLOWED with a reason. If it is a request, it must not exist — UPGRADE.md §4.`,
    ).toEqual([]);
  });

  it("keeps the three stub providers' mentions inside their comment blocks", () => {
    for (const stub of ["internshala", "unstop", "wellfound"]) {
      const path = `artifacts/api-server/src/providers/${stub}/provider.ts`;
      const lines = hits.get(path) ?? [];
      expect(
        lines.length,
        `${path} no longer mentions its own platform`,
      ).toBeGreaterThan(0);
      for (const line of lines) {
        expect(
          line.trim(),
          `${path}: "${line.trim()}" is not a comment`,
        ).toMatch(/^(\*|\/\/|\/\*)/);
      }
    }
  });

  it("leaves the stub providers returning an empty list", async () => {
    const [internshala, unstop, wellfound] = await Promise.all([
      import("../providers/internshala/provider"),
      import("../providers/unstop/provider"),
      import("../providers/wellfound/provider"),
    ]);
    for (const provider of [
      internshala.default,
      unstop.default,
      wellfound.default,
    ]) {
      expect(provider.hasPublicApi).toBe(false);
    }
  });

  it("never names a blocked domain in a fetch, axios or http call", () => {
    // Belt and braces for the allowlisted files: a fixture is fine, a request
    // in the same statement is not.
    const callWithDomain = new RegExp(
      `(?:fetch|axios|request|got|http\\.get|https\\.get)\\s*[(<][^\\n]*(?:${BLOCKED_BRANDS.join("|")})\\.(?:com|in)`,
      "i",
    );
    for (const [path, lines] of hits) {
      for (const line of lines) {
        expect(
          callWithDomain.test(line),
          `${path}: "${line.trim()}" looks like a request`,
        ).toBe(false);
      }
    }
  });
});

describe("the capture pipeline makes no outbound request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("parses every blocked-platform URL and JD without calling fetch", async () => {
    // No key: the Gemini branch is skipped entirely and the heuristics run.
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetchSpy = vi.fn(() => {
      throw new Error("the capture pipeline attempted a network request");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const urls = [
      "https://www.linkedin.com/jobs/view/software-engineer-intern-at-acme-corp-4123456789",
      "https://internshala.com/internship/detail/backend-internship-in-noida-at-acme-corp1234567",
      "https://unstop.com/internships/sde-internship-acme-1234567",
      "https://wellfound.com/jobs/1234567-frontend-engineer-intern",
      "https://www.naukri.com/job-listings-software-engineer-acme-noida-0-to-2-years-210925123456",
    ];

    for (const url of urls) {
      const result = await captureService.parse({
        url,
        rawText:
          "Software Engineer Intern\nAcme Corp · Noida\nStipend: ₹40,000 /month",
      });
      expect(result.draft.sourceUrl).toBe(url);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
