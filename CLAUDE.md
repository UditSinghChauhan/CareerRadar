# CLAUDE.md

CareerRadar is a pnpm/TypeScript monorepo that aggregates SDE internship and fresher job postings in India from public ATS and job-board APIs (Greenhouse, Lever, SmartRecruiters, RemoteOK, Remotive, Adzuna, JSearch), normalizes them into Postgres, and lets the user track applications through to offer. It has one primary user — a final-year B.Tech IT student (2027 batch, Delhi NCR) hunting internships right now — and doubles as a portfolio project shown to recruiters, so the bar is "does this reduce time-to-application or prevent a missed deadline", with code quality a close second.

Companion docs: `UPGRADE.md` (phased spec), `CAREERRADAR_PHASE0_SETUP.md` (deployment/environment facts — it wins where the two disagree), `CLAUDE_CODE_SESSION_PROMPTS.md` (per-session prompts).

---

## Hard invariants

Violating any of these breaks the live deployment at `https://careerradar-34ec.onrender.com/`.

### Repo conventions

- **Drizzle ORM only.** Never introduce Prisma. Schema lives in `lib/db/src/schema/`.
- **The API contract is generated, not hand-written.** Pipeline: `lib/api-spec/openapi.yaml` → orval → `lib/api-zod/src/generated/**` and `lib/api-client-react/src/generated/**`. Any new or changed endpoint goes into `openapi.yaml` **first**, then regenerate. Never hand-edit anything under a `generated/` directory — it will be overwritten.
- **Build order after touching `lib/*`:** `pnpm run typecheck:libs` **then** `pnpm --filter @workspace/api-server run typecheck`. Skipping the first produces phantom `TS2305 "no exported member"` errors from stale `.tsbuildinfo`.
- **Migrations:** `pnpm --filter @workspace/db run push`, only ever against a local `DATABASE_URL`.
- **Auth:** browser calls use Clerk **session cookies**. Never add `getToken()`, `setAuthTokenGetter`, or `Authorization: Bearer` to any web/browser code. Debug 401s by checking `clerkMiddleware` ordering and `requireAuth`, not token handling.
- **Vite:** `tailwindcss({ optimize: false })` in `vite.config.ts` must stay. Removing `optimize: false` reorders nested `@layer` imports from `@clerk/themes/*.css` and breaks Clerk UI **in production builds only** — it looks fine in dev, so you will not catch it locally.
- **esbuild:** never put a CLI `main()` guard using `import.meta.url` in a module the server bundle also imports. esbuild inlines everything into one `dist/index.mjs`, so the guard fires for every module. Expose scripts as authenticated API routes, or run them un-bundled with `tsx`.
- **Aggregator providers** (`remoteok`, `remotive`, `adzuna`, `jsearch`) must set `companySlug: slugify(employerName)` **and** `companyName: employerName` on every `ProviderJob`. `normalize()` is async specifically so it can auto-create the `companies` row — do not revert it to a sync `.map`.
- **devDependencies matter at build time.** `vite` is a devDependency. Never set `NODE_ENV=production` as a build-time environment variable — pnpm then skips devDeps and the build fails with `vite: not found`. The start command already sets `NODE_ENV=production` at runtime, which is correct.

### Production-safety rules

- **The database has live data.** Schema changes must be **additive only**: new tables, new nullable columns, new columns with defaults. Never drop or rename a column or enum value. If a value must change meaning, add a new column and backfill.
- **Every new user-facing feature degrades gracefully.** If an env var is missing or an external call fails, the feature hides itself — it never crashes a page. Follow the existing pattern in `ai-matching.service.ts` (`isAIAvailable()` returns false → frontend hides AI UI).
- **Do not change existing API response shapes.** Add fields; never remove or rename them.
- **CI must pass before a phase is done:** `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`.
- **Legal boundary — do not cross it.** `internshala/provider.ts`, `unstop/provider.ts`, and `wellfound/provider.ts` are deliberate no-op stubs because those sites' ToS and robots.txt prohibit automated extraction. Leave them returning `[]`, and leave their explanatory comment blocks intact — those comments are the reason the code is correct, and a future session will re-add a scraper without them. Never add scraping, headless browsers, or proxy fetches for them, or for **LinkedIn** or Naukri. Phase 4 adds the legitimate alternative.
- **Never run `git` commands.** The user handles all commits, pushes, and merges.

---

## Deployment facts

- **Host:** Render, **free tier** — `https://careerradar-34ec.onrender.com`.
- **Database:** **Neon Postgres** (migrated off Render Postgres).
- **Auth:** Clerk on a **development instance** (`pk_test_` / `sk_test_` keys). Dev instances have a user cap; a production instance needs DNS on a domain the user controls, which an `onrender.com` subdomain cannot provide. Fine for a single-user tool — know it before sharing the URL.
- **Sync is driven by env vars:** `PROVIDER_ENABLED`, `PROVIDER_INTERVAL_MS`, `PROVIDER_CONCURRENCY`, `PROVIDER_RUN_ON_START`, plus `SYNC_CRON_SECRET` for the external `POST /api/sync/cron` trigger. No cron on Render's free tier — a GitHub Actions scheduled workflow (`.github/workflows/sync.yml`) wakes the service and fires the trigger.
- **512 MB RAM / 0.1 CPU.** Backfill scripts batch at 500 rows and never load a whole table into memory; batch AI scoring caps concurrency at 2.
- **Ephemeral filesystem.** Anything written to disk is lost on redeploy, restart, and spin-down. Never store resume uploads or generated exports locally — keep `resumeUrl` external and stream exports in the HTTP response.
- **15-minute spin-down.** Free services sleep after 15 minutes idle; the next request takes ~30–60s to wake, and the in-process `setInterval` scheduler dies with it. Tolerate the cold start — **do not add a keep-alive ping**: staying awake 24/7 burns the entire 750 instance-hour monthly allowance and suspends the service mid hiring season.

---

## `.agents/memory/`

- `MEMORY.md` — index of the memory files below, one line each.
- `careerradar-stack.md` — core stack decisions: Drizzle not Prisma, Clerk cookie auth, JIT profile/settings provisioning on first GET, lib rebuild order, Tailwind v4 `optimize: false`, esbuild `import.meta.url` trap, push-then-seed before first server start, and verified live ATS provider status.
- `careerradar-aggregator-providers.md` — why aggregator providers must carry per-job `companySlug`/`companyName`, why `normalize()` is async and auto-creates companies, and the JSearch `/search-v2` endpoint quirk.
- `express5-wildcard.md` — `app.get("*")` throws on init under Express 5; use `/{*splat}` for the SPA catch-all, and use exactly 3× `..` for the production static path.
- `vite-build-vs-serve-env.md` — don't require `PORT`/`BASE_PATH` at build time; gate those checks behind dev/preview or the recursive root `pnpm run build` breaks.

---

## Commands

Full verification sequence, in this order:

```bash
pnpm run typecheck:libs
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Note: the root `package.json` currently defines only `typecheck:libs`, `typecheck`, and `build`. `lint` and `test` are the CI-required steps from `UPGRADE.md` §1 but have no root script yet — `test` exists per-package (`artifacts/api-server`, `artifacts/career-radar` run `vitest run`). Add the root scripts rather than skipping the steps.

Other useful commands:

```bash
pnpm --filter @workspace/db run push            # migrations — LOCAL DATABASE_URL ONLY
pnpm --filter @workspace/api-server run seed
pnpm --filter @workspace/api-server run dev     # :8080
pnpm --filter @workspace/career-radar run dev   # :5173
```

---

## Never do

- Edit anything under a `generated/` directory.
- Hand-write API types instead of updating `lib/api-spec/openapi.yaml` and regenerating.
- Add `Authorization: Bearer` or `getToken()` to frontend code.
- Change `tailwindcss({ optimize: false })` in `vite.config.ts`.
- Drop or rename a database column.
- Run `drizzle push` against a non-local `DATABASE_URL`.
- Run any `git` command.
