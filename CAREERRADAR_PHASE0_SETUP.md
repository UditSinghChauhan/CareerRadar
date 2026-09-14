# CareerRadar — Deployment, Environment & Local Setup

**Save this at the repo root as `CAREERRADAR_PHASE0_SETUP.md`.** It is complete — nothing needs to be
pasted in.

Companion files: `UPGRADE.md` (the phased spec) and `CLAUDE_CODE_SESSION_PROMPTS.md` (the per-session
prompts).

Where this contradicts `UPGRADE.md`, **this file wins** — it holds the verified deployment facts.

---

## A. Current deployment state (verified 2026-09-12)

| Thing | State |
|---|---|
| Host | Render, **free tier** |
| URL | `https://careerradar-34ec.onrender.com` |
| Database | **Neon Postgres** — migrated off Render Postgres ✅ |
| Auth | Clerk, **development instance** (`pk_test_` / `sk_test_` keys) |
| Node at build | 24.14.1 (Render default) |
| Runtime | Start command sets `NODE_ENV=production` itself |
| Sync | Enabled and confirmed running — Adzuna and JSearch fired successfully for the first time |
| Jobs in DB | 2,105, all `active` (nothing ever closes — Phase 1.5 fixes this) |

The Neon migration is done. Render's free Postgres expires 30 days after creation with no backups, so
this was the right call and is no longer a risk.

---

## B. Environment variables

### Currently set on Render

`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`,
`GEMINI_API_KEY`, `JSEARCH_API_KEY`, `LOG_LEVEL`, `NIXPACKS_BUILD_CMD`, `NIXPACKS_INSTALL_CMD`,
`NIXPACKS_NODE_VERSION`, `PROVIDER_CONCURRENCY`, `PROVIDER_ENABLED`, `PROVIDER_INTERVAL_MS`,
`PROVIDER_RUN_ON_START`, `SESSION_SECRET`, `SYNC_CRON_SECRET`, `VITE_CLERK_PUBLISHABLE_KEY`

### ⚠️ Never set `NODE_ENV` as a Render environment variable

This already broke one deploy. `vite` is a **devDependency**. With `NODE_ENV=production` set,
`pnpm install` skips devDependencies — and because Render restores a cached `node_modules`, the install
actively *prunes* them. The build then dies with:

```
sh: 1: vite: not found
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @workspace/career-radar@0.0.0 build
```

It is not needed anyway: the start command is
`NODE_ENV=production node --enable-source-maps ./artifacts/api-server/dist/index.mjs`, so production
mode is already set at runtime, which is the only place it matters.

If it ever needs to be set at build time, force dev deps explicitly:

```
npx pnpm@9 install --no-frozen-lockfile --prod=false && npx pnpm@9 --filter @workspace/career-radar run build && npx pnpm@9 --filter @workspace/api-server run build
```

### Small outstanding fix

Append `?sslmode=verify-full` to `DATABASE_URL` (or `&sslmode=verify-full` if it already has query
params). This silences the `pg-connection-string` deprecation warning and locks in current SSL
behaviour before `pg` v9 changes the semantics of `sslmode=require`.

### Inert leftovers — confirmed, leave them

- **`NIXPACKS_BUILD_CMD` / `NIXPACKS_INSTALL_CMD` / `NIXPACKS_NODE_VERSION`** — Nixpacks is Railway's
  builder. The deploy log shows Render picking "Node.js version 24.14.1 (default)", ignoring
  `NIXPACKS_NODE_VERSION` entirely. Render reads `NODE_VERSION`. These three do nothing. Set
  `NODE_VERSION=20` if you want to pin the build to match your local WSL setup.
- **`SESSION_SECRET`** — not referenced anywhere in the codebase. Clerk handles sessions. Leftover from
  the Replit bootstrap.

### Clerk is on a development instance

The deploy log shows Clerk's development-instance telemetry notice, confirming `pk_test_` / `sk_test_`
keys in production. Dev instances have a user cap and aren't intended for production traffic.

Switching to a production instance requires DNS records on a domain you control, which you cannot add
to an `onrender.com` subdomain — you'd need your own domain first. For a single-user tool this is fine.
Know it's there before ever sharing the URL.

---

## C. Free-tier constraints that shape the design

Confirmed Render free-tier behaviour. **These override anything in `UPGRADE.md`.**

**1. Spin-down.** Free web services spin down after 15 minutes of inactivity; the next request takes
roughly 30–60 seconds to wake. The in-process `setInterval` scheduler dies with it. Sync must be
externally triggered.

**2. No cron on free tier.** Render's background workers and cron jobs aren't available on the free plan
at all. GitHub Actions scheduled workflows are the answer, and they're free.

**3. 750 instance hours per workspace per month; spun-down services don't consume them.**
**Do not add a keep-alive ping to defeat the spin-down.** Staying awake 24/7 consumes roughly 744 hours
— essentially the entire monthly allowance — and exhausting it suspends all free web services until the
next calendar month. That would take the app down mid hiring season. Accept the cold start.

**4. Ephemeral filesystem.** Anything written to disk is lost on redeploy, restart, and spin-down. Never
store resume uploads or generated exports locally — keep `resumeUrl` external, stream exports in the
HTTP response.

**5. 512 MB RAM / 0.1 CPU.** Backfill scripts batch at 500 rows and never load a whole table into
memory. Batch AI scoring caps concurrency at 2.

### The cron workflow — use this exact version

This supersedes `UPGRADE.md` §5.1. The first request after a spin-down can take a minute, so a naive
`curl` times out and the job looks broken.

```yaml
# .github/workflows/sync.yml
name: CareerRadar sync
on:
  schedule:
    - cron: "0 */6 * * *"
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Wake the service (cold start tolerated)
        run: |
          curl -sS --max-time 120 --retry 3 --retry-all-errors --retry-delay 20 \
            "${{ secrets.CAREERRADAR_URL }}/api/health" || true

      - name: Trigger sync
        run: |
          curl -sS -X POST \
            --max-time 120 --retry 2 --retry-all-errors --retry-delay 15 \
            -H "x-cron-secret: ${{ secrets.SYNC_CRON_SECRET }}" \
            -H "content-type: application/json" \
            --fail-with-body \
            "${{ secrets.CAREERRADAR_URL }}/api/sync/cron"
```

GitHub repo secrets to add (Settings → Secrets and variables → Actions):
`CAREERRADAR_URL` = `https://careerradar-34ec.onrender.com`, and `SYNC_CRON_SECRET` matching Render.

The endpoint must return **202 immediately** and run the sync in the background.

---

## D. Health checks

Cold start first — the first call will be slow, that's expected.

`/api/health` (and `/api/healthz`) carry the schema drift check: `"schema":"ok"` means every column the code selects exists on Neon; a **503** with `"status":"schema_drift"` lists the missing columns and means the `lib/db/sql/` file for the last schema change has not been applied yet (CLAUDE.md → "Deploying a schema change"). `"schema":"unchecked"` is a 200 — the database could not be reached for the check, which is a connectivity question, not a schema one.

```bash
BASE=https://careerradar-34ec.onrender.com

curl -s --max-time 120 "$BASE/api/health"
curl -s "$BASE/api/sync/status" | jq
curl -s "$BASE/api/jobs?limit=1" | jq '.meta'
curl -s "$BASE/api/providers" | jq
```

Useful queries against Neon:

```sql
-- Platform breakdown and recency
select source_platform, count(*) as jobs, max(created_at) as newest
from jobs group by 1 order by 2 desc;

-- Should stop being 100% active once Phase 1.5 ships
select status, count(*) from jobs group by 1;

-- Rough fresher inventory (superseded by the Phase 2 classifier)
select count(*) from jobs
where status = 'active'
  and title ~* 'intern|graduate|fresher|entry.?level|trainee|sde ?i\b|associate'
  and title !~* 'senior|staff|principal|lead|manager|director|architect|\y(II|III)\y';
```

**Baseline as of 2026-09-12:** 2,105 total / 2,105 active / ~665 fresher-ish. Compare against these.

---

## E. Local setup — WSL + Antigravity + Claude Code

### Put the repo in the Linux filesystem

```bash
cd ~ && mkdir -p projects && cd projects
git clone git@github.com:UditSinghChauhan/CareerRadar.git
```

**Never work out of `/mnt/c/...`.** `pnpm install` is several times slower and Vite's file watching
breaks, so HMR silently stops and you lose an evening thinking your code isn't compiling. If you've
already cloned into the Windows mount, move it.

### Toolchain

```bash
nvm install 20 && nvm use 20 && nvm alias default 20
corepack enable
corepack prepare pnpm@9 --activate
pnpm install
```

### Line endings

`.gitattributes` at the repo root, before your first commit from WSL:

```
* text=auto eol=lf
*.sh text eol=lf
```

Without it you get diffs where every line changed, and CI fails on lint for reasons unrelated to your code.

### Local database — never point at production

The upgrade phases include schema pushes and backfills. Running those against the live DB while
iterating will corrupt real application history.

```bash
docker run -d --name careerradar-db \
  -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=careerradar \
  -p 5432:5432 postgres:16
```

Or create a **branch** in Neon for development — free, and gives you a copy of real data.

```bash
cp .env.example .env
# DATABASE_URL=postgresql://postgres:dev@localhost:5432/careerradar
# PROVIDER_ENABLED=false      ← keep sync OFF locally so you don't burn API quota while developing
# Clerk + Gemini test keys are fine

pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run seed
```

Run it:

```bash
# Terminal 1
pnpm --filter @workspace/api-server run dev     # :8080
# Terminal 2
pnpm --filter @workspace/career-radar run dev   # :5173
```

---

## F. Reviewing what Claude Code produces

Claude Code handles all code, typechecks, tests, builds, and local DB pushes. **You handle every git
command** — every session prompt instructs it not to touch git.

### The three-line review, before every commit

```bash
git diff --stat
git diff -- '*generated*' 'vite.config.ts'
grep -rniE "linkedin\.com|internshala\.com|unstop\.com|wellfound\.com|naukri\.com" \
  --include=*.ts --include=*.tsx artifacts/ lib/
```

The second should be empty. The third should only match comments in the three stub providers — if it
matches live code, revert that file.

### Also check the diff for

- a migration that drops or renames a column
- `Authorization: Bearer` or `getToken()` in frontend code
- new dependencies where shadcn / Radix / React Query / recharts would have done
- deleted comment blocks in `internshala/`, `unstop/`, `wellfound/` providers
- `NODE_ENV` added to any deployment config

### Smoke test before merging

Sign in → dashboard → click Apply on a job → external tab opens **and** it appears on `/applications` →
refresh → Applied badge persists on `/jobs`.

### After Render finishes deploying

Load the live sign-in page and confirm the Clerk UI renders correctly. A broken Clerk theme is the
classic symptom of a `vite.config.ts` regression, and it only appears in production builds.

### If a session goes sideways

```bash
git checkout -- .          # discard uncommitted changes
git checkout main          # abandon the branch
git branch -D phase-x-...
```

Nothing is lost — `main` is always your last known-good deployed state. Restart with a narrower prompt
naming the specific files it may touch.