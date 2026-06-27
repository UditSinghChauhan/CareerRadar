---
name: CareerRadar stack decisions
description: Key non-obvious architectural choices for CareerRadar that must stay consistent across sessions
---

## Drizzle, not Prisma
User asked for Prisma; environment uses Drizzle ORM end-to-end (lib/db, drizzle-kit push). Do not introduce Prisma — it conflicts with the existing lib/db workspace package.

**Why:** Replit monorepo bootstrap uses Drizzle. Switching to Prisma would require replacing lib/db entirely and breaking the codegen pipeline.

**How to apply:** Use `lib/db/src/schema/` with Drizzle table definitions. Run `pnpm --filter @workspace/db run push` for migrations (dev). Run `pnpm run typecheck:libs` after any schema change before API server typecheck.

## Auto-provisioning profile/settings on first login
GET /profile and GET /settings auto-create the row if it doesn't exist (JIT provisioning). Frontend never needs a separate onboarding/provision endpoint.

**Why:** Simplest UX — user signs in and immediately lands on a working dashboard without extra setup steps.

## Lib rebuild order
After editing any file in `lib/*`, run `pnpm run typecheck:libs` BEFORE running `pnpm --filter @workspace/api-server run typecheck`. Stale `.tsbuildinfo` causes TS2305 "no exported member" false errors on leaf packages.

## Tailwind v4 + Clerk themes
`vite.config.ts` must have `tailwindcss({ optimize: false })` (not `tailwindcss()`). Without this, nested @layer imports from `@clerk/themes/*.css` get reordered in prod builds and Clerk UI renders broken in production.

## Clerk auth — never Bearer tokens on web
Browser API calls use Clerk session cookies automatically. Do not add getToken(), setAuthTokenGetter, or Authorization: Bearer to any web/browser code. Debug 401s by checking clerkMiddleware ordering and requireAuth, not token handling.

## esbuild bundle: import.meta.url guard doesn't work for CLI entry points
When esbuild bundles multiple TS files into a single `dist/index.mjs`, `import.meta.url` for every bundled module becomes the bundle file path — identical to `process.argv[1]`. The common guard `if (import.meta.url === \`file://${process.argv[1]}\`)` fires for ALL imported modules, not just the CLI entry point.

**Why:** esbuild inlines all source into one output file. There is no per-module URL distinction at runtime.

**How to apply:** Never put CLI `main()` guards in modules that are also imported by the server bundle. Expose internal scripts via API routes instead, or run them with `tsx` (un-bundled) directly.

## DB schema + seed must be run before first server start
The server crashes on first run if schema hasn't been pushed. Workflow:
1. `pnpm --filter @workspace/db run push` — creates tables
2. `pnpm --filter @workspace/api-server run seed` — inserts base data
3. Start the workflow

**How to apply:** After any fresh DB or schema reset, always push + seed before restarting the API Server workflow.

## Live ATS provider status (verified 2026-06-27)
Working (376 jobs total): postman/rubrik/thoughtworks (Greenhouse), meesho/cred/dream11 (Lever).
Broken (401): all Ashby companies — Ashby's public posting API requires browser session auth.
Broken (401): all Workday companies — Workday CXS API requires browser session auth.
Broken (404): atlassian/adobe/razorpay slugs + 26 others — moved ATS or invalid slugs.
Companies for ingested slugs must exist in the `companies` DB table or the normalizer logs WARN and drops all their jobs.
