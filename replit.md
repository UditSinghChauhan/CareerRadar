# CareerRadar

A "Personal Placement OS" for CS students to track job applications, sync listings, and analyze their placement pipeline.

## Stack

- **Frontend**: React 18 + Vite + Tailwind CSS v4 + Wouter + TanStack Query + Radix UI/shadcn
- **Backend**: Express 5 + Node.js 24 + Pino logging
- **Auth**: Clerk (`@clerk/express` + `@clerk/react`)
- **Database**: PostgreSQL 16 + Drizzle ORM
- **API**: OpenAPI spec in `lib/api-spec/` with Orval codegen

## Monorepo layout

```
artifacts/api-server/   — Express API server (@workspace/api-server)
artifacts/career-radar/ — React + Vite frontend (@workspace/career-radar)
lib/db/                 — Shared Drizzle schema + DB client (@workspace/db)
lib/api-spec/           — OpenAPI spec + Orval codegen (@workspace/api-spec)
```

## Running on Replit

Two workflows must be running:

| Workflow | Command | Port |
|---|---|---|
| API Server | `PORT=8080 pnpm --filter @workspace/api-server run dev` | 8080 |
| CareerRadar Frontend | `PORT=24260 pnpm --filter @workspace/career-radar run dev` | 24260 |

## Required secrets

Set these in Replit Secrets:

- `CLERK_SECRET_KEY` — Clerk backend key (starts with `sk_`)
- `CLERK_PUBLISHABLE_KEY` — Clerk publishable key (starts with `pk_`)
- `VITE_CLERK_PUBLISHABLE_KEY` — Same value as `CLERK_PUBLISHABLE_KEY` (Vite client)

`DATABASE_URL` is provided automatically by Replit.

## First-time database setup

```bash
# 1. Push schema to the database
pnpm --filter @workspace/db run push

# 2. Seed base data (companies, job sources)
pnpm --filter @workspace/api-server run seed
```

## Key development notes

- After editing `lib/*`, run `pnpm run typecheck:libs` before typechecking `api-server`.
- Clerk session cookies handle auth in the browser — never add Bearer tokens to frontend code.
- `vite.config.ts` must use `tailwindcss({ optimize: false })` (not `tailwindcss()`) for Clerk themes to work in production builds.
- The API server's `dev` script does `build && start` — the `start` script alone requires a prebuilt `dist/`.

## User preferences
