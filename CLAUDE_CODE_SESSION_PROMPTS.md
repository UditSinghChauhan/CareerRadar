# CareerRadar — Claude Code Session Prompts

One session per phase. One branch per phase. Deploy between phases.

**Division of labour:** Claude Code writes code, runs typechecks, tests, builds, and local DB pushes.
**You** run every `git` command and decide what merges. Every prompt below tells Claude Code not to
touch git.

**Before your first session,** save `UPGRADE.md` and `CAREERRADAR_PHASE0_SETUP.md` to the repo root and
push them. Both files are complete — Phase 1.5 and §2.0 are already integrated, nothing needs pasting
in. Claude Code reads them.

---

## Session 0 — Bootstrap `CLAUDE.md`

Do this once. It creates the file every later prompt depends on, so you don't have to repeat the
constraints ten times.

**You:**
```bash
cd ~/projects/CareerRadar
git checkout main && git pull
git checkout -b chore-claude-md
```

**Paste into Claude Code:**

> Read `UPGRADE.md`, `CAREERRADAR_PHASE0_SETUP.md`, and every file in `.agents/memory/`.
>
> Create `CLAUDE.md` at the repo root. It must contain, in this order:
>
> 1. A two-sentence description of what this repo is and who uses it.
> 2. The full "Hard invariants" list from §1 of `UPGRADE.md` — repo conventions and
>    production-safety rules — condensed but with nothing dropped. Include the legal boundary about
>    Internshala, Unstop, Wellfound, and LinkedIn.
> 3. A "Deployment facts" section: deployed on Render free tier, Neon Postgres, Clerk auth on a
>    development instance, sync driven by env vars, 512MB RAM / 0.1 CPU, ephemeral filesystem,
>    15-minute spin-down.
> 4. A one-line summary of each file in `.agents/memory/`.
> 5. A "Commands" section with the exact verification sequence:
>    `pnpm run typecheck:libs`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run build`.
> 6. A "Never do" list: edit anything under `generated/`; hand-write API types instead of updating
>    `openapi.yaml`; add `Authorization: Bearer` or `getToken()` to frontend code; change
>    `tailwindcss({ optimize: false })` in `vite.config.ts`; drop or rename a DB column; run
>    `drizzle push` against a non-local `DATABASE_URL`; run any `git` command.
>
> Create no other files. Change no other files. Do not run any git command.

**You:**
```bash
git add CLAUDE.md && git commit -m "docs: add CLAUDE.md with repo invariants"
git push -u origin chore-claude-md
# merge the PR, then:
git checkout main && git pull
```

---

## Session 1 — Phase 1: Applications page + one-click apply

The highest-value change in the whole plan.

**You:**
```bash
git checkout -b phase-1-applications
```

**Paste:**

> Read `CLAUDE.md` and follow every constraint in it. Then read Phase 1 in `UPGRADE.md`.
>
> Implement **Phase 1 only** — sections 1.1 through 1.4. Do not implement Phase 1.5 or any later phase.
>
> Before writing any code, list every file you plan to create or modify, with one line on what changes
> in each. Then wait for my confirmation.
>
> Specific reminders for this phase:
> - `GET /api/applications/status-map` must be added to `lib/api-spec/openapi.yaml` first, then the
>   client regenerated. Do not hand-write its types.
> - In the Apply handler, call `window.open()` **synchronously in the click handler before any await**,
>   or popup blockers will swallow it.
> - Do not change the response shape of any existing endpoint.
> - Run `drizzle push` only against my local `DATABASE_URL`. Confirm with me before running it at all.
>
> When done: run `pnpm run typecheck:libs`, then `pnpm run typecheck`, `pnpm run lint`,
> `pnpm run test`, `pnpm run build`. Fix anything that fails. Then list each Phase 1 acceptance
> criterion and state pass or fail.
>
> Do not run any git command.

**You — review the diff for:**
- edits under any `generated/` directory
- `vite.config.ts` touched
- a migration that drops or renames a column
- `Bearer` or `getToken()` in frontend code
- any HTTP client pointed at linkedin.com, internshala.com, unstop.com, wellfound.com
- new dependencies where shadcn / Radix / React Query / recharts would have done

**You — smoke test locally:** sign in → dashboard → click Apply on a job → external tab opens **and**
the application appears on `/applications` → refresh → Applied badge persists on `/jobs` → drag a card
between board columns → refresh, it stayed.

```bash
git add -A
git commit -m "feat(applications): applications page, one-click apply logging, applied-state badges"
git push -u origin phase-1-applications
```

Merge to `main`. After Render deploys, load the live sign-in page and confirm the Clerk UI renders
correctly — that's where a `vite.config.ts` regression shows up.

---

## Session 2 — Phase 1.5: Close stale jobs

Your DB is 2,105 active out of 2,105 total. Nothing ever closes. Fix this before the feed grows further.

**You:**
```bash
git checkout main && git pull && git checkout -b phase-1-5-stale-jobs
```

**Paste:**

> Read `CLAUDE.md` and follow every constraint in it. Then read Phase 1.5 in `UPGRADE.md`.
>
> Implement **Phase 1.5 only**. List the files you plan to touch and wait for my confirmation first.
>
> The two guards in that section are the important part, do not skip either:
> - The last-seen sweep must only run when the provider fetch returned more than zero jobs. A provider
>   erroring or returning an empty array must never close a company's entire catalogue.
> - The backfill must print the count of rows it would close and require explicit confirmation before
>   closing anything. It must be idempotent and safe to re-run.
>
> Add `SYNC_MAX_AGE_DAYS` to `.env.example` with a default of 45.
>
> Write tests covering: a zero-result fetch closes nothing; a fetch missing one previously-seen job
> closes exactly that job; running the sweep twice changes nothing the second time.
>
> Run the full verification sequence from `CLAUDE.md` and report acceptance criteria. Do not run any
> git command.

**You:** after merging and deploying, wait for one sync cycle, then check in Neon:
```sql
select status, count(*) from jobs group by 1;
```
Active should have dropped. If it dropped to near zero, something is wrong — revert and tell me.

---

## Session 3 — Phase 5: Cron sync + provider audit

**You:**
```bash
git checkout main && git pull && git checkout -b phase-5-sync-reliability
```

**Paste:**

> Read `CLAUDE.md` and follow every constraint in it. Then read Phase 5 in `UPGRADE.md`, and section C
> of `CAREERRADAR_PHASE0_SETUP.md` — the revised cron workflow in section C **supersedes** the one
> described in UPGRADE.md §5.1. Use the section C version.
>
> Implement **Phase 5 only**. List files and wait for confirmation first.
>
> Requirements specific to this phase:
> - `POST /api/sync/cron` compares `x-cron-secret` against `process.env.SYNC_CRON_SECRET` using
>   `crypto.timingSafeEqual`. Return 401 immediately if the env var is unset. This route bypasses Clerk
>   deliberately — it is machine-to-machine.
> - The route returns 202 immediately and runs the sync in the background. Do not hold the request open.
> - Add the boot-sync guard: in `schedulerService.start()`, query `provider_sync_logs` for the most
>   recent successful run and skip the run-on-start sync if it was under 2 hours ago.
> - For the provider audit, **actually make the HTTP requests** and report real results. Do not assume
>   or infer any provider's status. Write the findings to `docs/provider-health.md`.
> - Re-test Ashby against `https://api.ashbyhq.com/posting-api/job-board/{jobBoardName}`. If it still
>   returns 401, leave all 14 configs disabled and record that honestly in the report. Do not add
>   browser-session workarounds, cookie forging, or headless browsers for Ashby, Workday, or anything else.
> - Do not flip any config to `enabled: true` without a successful live request returning a non-zero
>   job count, recorded with the count and today's date in that config's `note` field.
>
> Run the full verification sequence and report acceptance criteria. Do not run any git command.

**You — after merge:** add repo secrets in GitHub → Settings → Secrets and variables → Actions:
`CAREERRADAR_URL` = `https://careerradar-34ec.onrender.com`, `SYNC_CRON_SECRET` = the value in Render.
Then Actions → CareerRadar sync → Run workflow. Confirm it succeeds and a `provider_sync_logs` row appears.

---

## Session 4 — Phase 2: Location normalization + relevance engine

The biggest phase. Split it into two sessions.

### Session 4a — location only

**You:**
```bash
git checkout main && git pull && git checkout -b phase-2a-location
```

**Paste:**

> Read `CLAUDE.md` and follow every constraint in it. Then read §2.0 in `UPGRADE.md`.
>
> Implement **§2.0 only** — location normalization. Do not implement §2.1, the seniority classifier;
> that is a separate session. List files and wait for confirmation first.
>
> Context from the live database you must account for: `jobs.country` says 'India' for all 570 RemoteOK
> rows because the schema default silently applies when a provider omits it, and SmartRecruiters sends
> lowercase ISO-2 like 'in' and 'ca'. The column is unreliable. Leave it in place — additive-only rule —
> but stop reading it anywhere.
>
> Real values currently in `jobs.location` that your tests must cover: 'Mumbai, MH',
> 'Mumbai, Maharashtra', 'Mumbai Metropolitan Region', 'Navi Mumbai, MH', 'New Delhi, DL',
> 'New Delhi, Delhi', 'Bengaluru, Karnataka', 'Gurugram, Haryana', 'Noida, Uttar Pradesh', 'IN',
> 'India', 'TG', 'Worldwide', 'Nassau, ', 'Toronto, '.
>
> The unmatched case matters most: an unrecognized location must set `isIndia` to **null**, never false,
> so it stays reviewable rather than silently disappearing from my results.
>
> Backfill all existing rows with the batched idempotent script pattern from §2.2 — batches of 500,
> exposed as an authenticated route as well as a `tsx` script, because of the esbuild CLI-guard
> constraint in `CLAUDE.md`.
>
> Run the full verification sequence and report acceptance criteria. Do not run any git command.

### Session 4b — relevance classifier

**You:**
```bash
git checkout main && git pull && git checkout -b phase-2b-relevance
```

**Paste:**

> Read `CLAUDE.md` and follow every constraint in it. Then read §2.1 through §2.3 in `UPGRADE.md`.
>
> Implement **§2.1, §2.2 and §2.3 only**. §2.0 location normalization is already done — build on it,
> do not redo it. List files and wait for confirmation first.
>
> The classifier must be deterministic rules, not an LLM call. No Gemini in this path.
>
> Write at least 25 unit test cases using real job titles. These three must pass:
> - 'Senior Software Engineer Intern' → internship (the intern signal must beat the seniority signal)
> - 'SDE II' → not_relevant
> - 'Software Development Engineer Intern - 2027' → internship, inferredBatches includes 2027
>
> Add the location signal to the scoring: use `isIndia` and `isRemote` from §2.0, not `jobs.country`.
>
> Include the 'Show everything' escape hatch on the jobs page. The classifier will misclassify things
> and I must be able to see past it.
>
> Run the full verification sequence and report acceptance criteria. Do not run any git command.

**You — after merge, sanity check in Neon:**
```sql
select relevance_track, count(*) from jobs where status='active' group by 1;
select title from jobs where relevance_track='internship' order by relevance_score desc limit 20;
```
Read those 20 titles. If they aren't things you'd actually apply to, the rules need tuning — tell me
what came back.

---

## Session 5 — Phase 3: Daily apply queue

**You:**
```bash
git checkout main && git pull && git checkout -b phase-3-daily-queue
```

**Paste:**

> Read `CLAUDE.md` and follow every constraint in it. Then read Phase 3 in `UPGRADE.md`.
>
> Implement **Phase 3 only**. List files and wait for confirmation first.
>
> The `job_dismissals` table is new — additive, with a unique constraint on `(profileId, jobId)`.
>
> Performance matters here: my instance has 512MB RAM and 0.1 CPU, and the jobs table has 2,000+ rows
> growing. Show me the `EXPLAIN ANALYZE` output for the queue query and add whatever indexes it needs
> to come back under 500ms.
>
> Each queue row must display a plain-language reason for its rank, derived from the priority
> components — for example 'closes in 2 days' or 'posted yesterday'. Return the components from the
> endpoint; do not recompute them in the frontend.
>
> Run the full verification sequence and report acceptance criteria. Do not run any git command.

---

## Session 6 — Phase 4: Quick capture

**You:**
```bash
git checkout main && git pull && git checkout -b phase-4-capture
```

**Paste:**

> Read `CLAUDE.md` and follow every constraint in it. Then read Phase 4 in `UPGRADE.md`.
>
> Implement **Phase 4 only**. List files and wait for confirmation first.
>
> This is the phase where the legal boundary matters most. The whole point of paste-to-parse is that it
> is the legitimate alternative to scraping. The server must never make an HTTP request to
> internshala.com, unstop.com, wellfound.com, linkedin.com, or naukri.com. The user pastes text; the
> server parses what it was given. Leave the three stub providers exactly as they are, including their
> comment blocks explaining why they return empty arrays.
>
> The capture dialog must work fully with `GEMINI_API_KEY` unset — manual entry is the baseline, AI
> parsing is an accelerator on top. Test both paths.
>
> Run the classifier from Phase 2 on every confirmed capture, and set `sourcePlatform` to 'manual'.
>
> Run the full verification sequence and report acceptance criteria. Do not run any git command.

---

## Sessions 7–10 — Remaining phases

Same pattern. Branch, paste, review, commit, push, merge, deploy.

| Session | Branch | Prompt |
|---|---|---|
| 7 | `phase-6-notifications` | "Read `CLAUDE.md`. Implement **Phase 6 only** from `UPGRADE.md`. List files first. The digest endpoint must return 200 and send nothing when `RESEND_API_KEY` is unset. Run the full verification sequence. No git commands." |
| 8 | `phase-7-search-perf` | "Read `CLAUDE.md`. Implement **Phase 7 only** from `UPGRADE.md`. List files first. Company-name search must keep working exactly as it does today — show me a test proving it. Show `EXPLAIN ANALYZE` before and after. Run the full verification sequence. No git commands." |
| 9 | `phase-8-ai-scores` | "Read `CLAUDE.md`. Implement **Phase 8 only** from `UPGRADE.md`. List files first. Prove with a test that viewing the same job twice makes zero Gemini calls. Every page must render with `GEMINI_API_KEY` unset. Run the full verification sequence. No git commands." |
| 10 | `phase-9-polish` | "Read `CLAUDE.md`. Implement **Phase 9 only** from `UPGRADE.md`. List files first. Take fresh screenshots of the current UI for the README — do not reuse the existing ones in `docs/screenshots/`, they are out of date. Run the full verification sequence. No git commands." |

---

## The three-line review you run on every diff

Before every commit:

```bash
git diff --stat
git diff -- '*generated*' 'vite.config.ts' 'lib/db/src/schema/'   # should be empty except intended schema adds
grep -rniE "linkedin\.com|internshala\.com|unstop\.com|wellfound\.com|naukri\.com" --include=*.ts --include=*.tsx artifacts/ lib/
```

The last one should only ever match comments in the three stub providers. If it matches live code,
stop and revert that file.

---

## If a session goes sideways

Claude Code occasionally over-reaches. Recovery:

```bash
git checkout -- .          # discard uncommitted changes
git checkout main          # abandon the branch entirely
git branch -D phase-x-...
```

Nothing is lost — `main` is always your last known-good deployed state. Then restart the session with
a narrower prompt: name the specific files it may touch.

---

## Keep applying while this builds

None of this replaces sending applications today. Amazon's SDE I Intern requisition for the 2027 batch
is rolling, and the tool will not be finished before the cycle peaks.