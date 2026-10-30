# CareerRadar: working agreement

Personal placement OS for an Indian CS student. Live: https://careerradar-34ec.onrender.com
Quality bar: the `saas-quality-standard` skill. Visual source of truth once approved: DESIGN.md.

## Stack
- pnpm workspace. Frontend: `artifacts/career-radar` (React 18, Vite, Wouter, TanStack Query, Radix/shadcn, Tailwind v4).
- Backend: `artifacts/api-server` (Express 5, Node 22, TypeScript 5.9).
- Database: PostgreSQL 16 with Drizzle. Never Prisma.
- Auth: Clerk session cookies. No bearer tokens in browser code.
- Tests: Vitest, PGlite, Playwright.

## Commands, in this order
1. `pnpm install`
2. `pnpm run typecheck:libs`: always first. A stale .tsbuildinfo causes phantom errors.
3. `pnpm run typecheck`
4. `pnpm run lint`
5. `pnpm run test`: api-server 944 tests, career-radar 55 tests.
6. `pnpm run build`
7. `pnpm run test:e2e`: needs a local Postgres and Clerk dev keys. Not runnable on a bare environment.

Requires Node 22+ and pnpm 9+.

## Rules
- The API contract is generated. Edit `lib/api-spec/openapi.yaml`, then run orval. Never edit `generated/`.
- Schema changes are additive only and ship separately from code. A boot-time drift check returns 503 when a column is missing.
- Enforce host-only actions on the server, not only in the UI.
- The relevance classifier and location normalizer are deterministic. No LLM in classification.
- Do not add scrapers for Internshala, Unstop, Wellfound, LinkedIn or Naukri. Their terms prohibit it.
- Secrets live only in the local `.env`. Never paste keys into chat, tests, or committed files.
- E2E tests use test data on a local database only.
- Every bug fix ships with a test that fails before the fix and passes after.

## Known issues
- career-radar runs vitest 3.2.7 and api-server runs vitest 4.1.10. The jest-dom matchers are registered in `artifacts/career-radar/src/test-setup.ts`. Aligning the versions is a separate change.
- README test counts are stale (api-server now reports 944, not 941). Fix in the README pass.

## Git
- Start every task from a fresh main: `git checkout main && git pull --ff-only origin main`, then create a new branch.
- One branch and one PR per task. Never force-push main.
- Commit authorship is the owner's identity. No Co-Authored-By or Claude-Session trailers in commits or PR descriptions.
- Default workflow: stage the named files, write the message to a file, and print the exact `git commit` command for the owner to run.

## Done means
- All commands above pass, with exact results reported.
- UI changes include screenshots at 375, 768 and 1280 px.
- The diff has been self-reviewed for dead code, debug output, and unrelated changes.

## Git
- Start every task from a fresh main: `git checkout main && git pull --ff-only origin main`, then create a task branch (`feat/…`, `fix/…`, `docs/…`).
- Commit and push only task branches. Never push to or merge into main. Each task opens one PR. The owner reviews the diff and merges.
- Before the first commit in a session, run:
  `git config user.name "Udit Singh Chauhan"` and
  `git config user.email "187852344+UditSinghChauhan@users.noreply.github.com"`
- Commits and PR descriptions contain no Co-Authored-By, Claude-Session, or "Generated with" lines.
- Commit messages follow Conventional Commits. Each commit states what changed and why.

## Role and decisions
Act as a senior product designer and principal engineer finishing a portfolio project for recruiters. Priorities, in order: the product works end to end, a first-time visitor understands what it does within seconds, visual quality matches DESIGN.md, then polish.

- Every change states the problem, the evidence (a screenshot, a failing test, an audit finding, or a measured before/after), the fix, and the expected effect.
- Rank findings by impact on a first-time visitor and on a recruiter reading the code. Fix the top findings first. Record the rest as a list in the PR description, not as silent scope creep.
- Do not make a change you cannot justify in one sentence.
- Prefer removing or simplifying over adding.
- Do not invent metrics. If a number is not measured, say so.
- If you are not sure, say what you checked and what remains uncertain.

## Done for a product task
- The check sequence passes, with exact results reported.
- UI changes match DESIGN.md at 375, 768 and 1280 px, in light and dark.
- Every data view has empty, loading, error and success states.
- The PR description lists: problem, evidence, change, what was deliberately left out, and risks.