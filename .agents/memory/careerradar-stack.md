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
