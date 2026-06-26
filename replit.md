# CareerRadar

A personal placement operating system for an Indian Computer Science student tracking Software Engineering internships and fresher placements.

## Run & Operate

- `pnpm --filter @workspace/career-radar run dev` — run the frontend (port assigned by env)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — rebuild lib declarations (run before leaf checks after schema changes)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)
- Required env: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` — auto-provisioned by Clerk

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite + Tailwind CSS v4 + Wouter (routing) + next-themes (dark mode)
- Auth: Clerk (Replit-managed, white-label) via `@clerk/react` (client) + `@clerk/express` (server)
- API: Express 5 with Clerk middleware
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- Build: esbuild (CJS bundle) for server, Vite for frontend
- UI Components: Radix UI + shadcn/ui pattern

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (`profiles.ts`, `settings.ts`)
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod schemas for server validation (do not edit)
- `artifacts/career-radar/src/` — React frontend (App.tsx = router root)
- `artifacts/career-radar/src/index.css` — Tailwind theme tokens (light + dark mode)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/middlewares/` — Clerk proxy + requireAuth middlewares

## Architecture decisions

- **Contract-first OpenAPI**: All endpoints defined in `openapi.yaml` first; hooks and Zod schemas are generated — never hand-written.
- **Auto-provisioning on first login**: `GET /profile` and `GET /settings` create a row if none exists — no separate onboarding step needed.
- **Drizzle ORM (not Prisma)**: The Replit monorepo workspace uses Drizzle end-to-end. Functionally equivalent to Prisma for all CareerRadar use cases.
- **Clerk cookie-based auth on web**: No Bearer tokens in browser code. Clerk session cookies are automatic. `requireAuth` middleware reads `getAuth(req)` from `@clerk/express`.
- **Dark mode via next-themes**: ThemeProvider wraps the app. Settings page controls `theme: light|dark|system` and syncs with the DB.

## Product

CareerRadar answers 5 questions for an Indian CS student:
1. What opportunities opened today?
2. Which am I eligible for?
3. Which close soon?
4. What have I already applied to?
5. What should I do today to maximize placement chances?

**Phase 1 (complete):** Foundation — landing page, Clerk auth, dashboard shell, profile page, settings page, 404, loading skeletons, dark mode.

## User preferences

- Production-quality code only — no placeholders unless clearly marked
- Complete only the requested phase, then stop and explain what was built
- Premium UI inspired by Linear, Vercel, Notion
- No emojis in the UI
- Mobile-first responsive

## Gotchas

- After changing `lib/db/src/schema/`, run `pnpm run typecheck:libs` BEFORE `pnpm --filter @workspace/api-server run typecheck` — stale lib declarations cause false TS2305 errors
- After every `openapi.yaml` change, run codegen before using updated types
- Tailwind v4 + Clerk themes: `tailwindcss({ optimize: false })` in `vite.config.ts` is required — otherwise Clerk UI breaks in prod builds
- `VITE_CLERK_PROXY_URL` is intentionally empty in dev — do not gate on `NODE_ENV`
- Clerk Publishable Key must use `publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)` — never the raw env var

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `.local/skills/clerk-auth/references/setup-and-customization.md` for Clerk wiring details
