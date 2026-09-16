# Architecture

How a job posting gets from somebody else's API into the ten rows CareerRadar
asks you to apply to this morning.

```
 provider → normalizer → location → classifier → dedup → upsert
                                                            │
                        staleness sweep ←───────────────────┘
                               │
                        queue ranking → GET /api/dashboard/today
```

Every stage below names the file it lives in. Where a number appears, it was
measured against the live Neon table on the date given, not estimated.

**Scale, 2026-09-16 (production):** 4,995 job rows, 4,512 active, 2,109 of
those fresher-eligible, across 1,513 companies. 13 rows in the entire table
carry an application deadline — a fact that shapes the ranking more than
anything else here.

---

## 1. Provider — `providers/*/provider.ts`

A provider is one class with one job: return `ProviderJob[]` for a
(company, platform) pair. Fourteen are registered in
`providers/registry.ts`; `providers/config.ts` holds 95 company/provider
configs, 47 of them enabled, and the scheduler walks the enabled ones. A
disabled config keeps its `note` explaining why rather than being deleted.

They come in two shapes, and the difference matters later:

| Shape | Providers | Response is |
| --- | --- | --- |
| **ATS** | Greenhouse, Lever, Ashby, SmartRecruiters, Workday | **Authoritative** — the complete list of one employer's open roles |
| **Aggregator** | RemoteOK, Remotive, Adzuna, JSearch, Arbeitnow, Jobicy | **Query-shaped** — a page of search results, never complete |

Three providers — `internshala`, `unstop`, `wellfound` — are deliberate no-op
stubs that return `[]`. Those sites' Terms of Service and `robots.txt` prohibit
automated extraction, so there is no scraper, no headless browser and no proxy
fetch for them, and none for LinkedIn or Naukri either. The comment blocks in
those files are the reason the code is correct and are not to be removed.

Two providers are metered and are rate-limited by
`providers/metered-interval.ts` and `providers/request-budget.ts` rather than by
the scheduler's interval: **Adzuna** (250 requests/day) and **JSearch**
(200 requests/month).

Retries live in `providers/retry.ts`. Failures are recorded, never thrown past
the scheduler — one dead provider must not stop the other 46 configs.

## 2. Normalizer — `providers/normalizer.ts`

Turns a `ProviderJob` into an `InsertJob`, resolving the two foreign keys
(`companyId`, `sourceId`) against caches warmed once per run.

`normalize()` is **async**, and that is load-bearing. Aggregator providers
return postings from employers that were never seeded, so the normalizer
auto-creates the `companies` row on demand — which is why every aggregator
provider must set both `companySlug: slugify(employerName)` **and**
`companyName: employerName` on every job. Concurrent lookups for the same new
slug collapse onto a single insert via an in-flight promise map.

The normalizer does not write jobs. It hands a plain object to stage 5.

## 3. Location — `relevance/location.ts`

Six normalised columns (`locationCity`, `locationRegion`, `country`, `metro`,
`isIndia`, `isRemote`) out of the free-text string each provider emits. Pure
and deterministic, which is what lets the backfill recompute every row on every
run instead of tracking what it has already done.

`jobs.country` is **never** an input here. See
[Decision 2](../README.md#decision-2--the-location-normalizer-and-why-jobscountry-is-unreliable) in the README for why that
column cannot be trusted.

Six rules, in order: remote markers → state abbreviations → city aliases →
metro grouping (NCR, MMR) → country resolution → **unmatched means
`isIndia: null`, never `false`**. A location the module cannot place stays
visible in the "Unknown location" bucket so it can be reviewed. `false` is
reserved for strings that name somewhere else. 282 active rows are in that
bucket today.

## 4. Classifier — `relevance/classifier.ts`

Sorts each posting into `internship` / `new_grad` / `early_career` /
`not_relevant` and scores it 0–100. Deterministic rules, no LLM, for the same
reason as the location normalizer: reproducibility across backfills.

Current distribution over the 4,512 active rows: `not_relevant` 2,403,
`internship` 1,226, `early_career` 500, `new_grad` 383.

The rules and the test strategy are
[Decision 1](../README.md#decision-1--the-relevance-classifier) in the README.

## 5. Dedup — `providers/deduplication.ts`

Decides insert / update / skip against the external identity
`sourcePlatform + sourceUrl`.

- **insert** — that URL is new for this provider
- **update** — the URL exists and `title`, `location`, `workMode`, `deadline`
  or `status` changed
- **skip** — the URL exists and nothing tracked changed

**Every one of those three stamps `lastSeenAt`, including skip.** A skip means
the provider is still listing the posting and simply has not changed it, which
is exactly the evidence stage 7 needs. Treating a skip as "not seen" would
close every unchanged job on the next run. Skips are stamped in one batched
`UPDATE` of 500 rows, so a steady-state pass where nothing changed costs a
single statement.

## 6. Upsert

Writes happen in batches of 500. The instance has 512 MB of RAM and 0.1 CPU;
nothing in the ingestion path ever loads a whole table into memory.

`lastSeenAt` for the whole batch is the run's **start** time, passed in by the
caller, so "seen this run" is a single instant and the sweep's
`lastSeenAt < runStartedAt` comparison cannot race a long batch.

## 7. Staleness sweep — `providers/staleness.ts`

Before this existed, nothing ever closed a job: the normalizer hardcodes
`status: "active"` and dedup only inserts and updates. The table was 2,105
active out of 2,105 total — every expired posting still on the dashboard.

Three sweeps, three different meanings of "dead":

| Sweep | Applies to | Rule |
| --- | --- | --- |
| `closeUnseenJobs` | ATS platforms only | In yesterday's listing, absent from today's → closed |
| `closeStaleAggregatorJobs` | Aggregator platforms | Absence proves nothing; fall back to an age cutoff (`SYNC_MAX_AGE_DAYS`, default 45) |
| `closeExpiredDeadlineJobs` | Any platform | The posting stated a deadline and it has passed |

**The guard.** `closeUnseenJobs` refuses to run unless the provider actually
returned jobs *and* at least one was persisted. A provider that 500s,
rate-limits, changes its response shape or returns `[]` must never be read as
"this company has no open roles" — that single misreading would close a
company's entire catalogue, and the rows cannot be recovered from the upstream
API on the next run. Every skip is logged at INFO with its reason, because a
sweep that silently does nothing is as hard to diagnose as one that wrongly
does everything.

## 8. Queue ranking — `queue/priority.ts`, `queue/daily-queue.repository.ts`

```
priority = relevanceScore * 0.40
         + deadlineUrgency * 0.30
         + freshness * 0.20
         + dreamCompanyBoost * 0.10
```

The weights are declared once, in TypeScript, and `priorityComponentsSql()`
renders them into the query — a formula written once in SQL and once in
TypeScript is a formula that will disagree with itself within a month.
`daily-queue.test.ts` asserts the two agree row-for-row against real Postgres.

Ranking happens **in Postgres**. The eligible set is ~2,100 rows and the queue
returns ten; ordering in JavaScript would mean shipping every row, descriptions
included, to a 512 MB instance on every dashboard load. Two queries, not one:
rank a narrow projection of scalars, then fetch the full joined rows for the
≤10 winners by id, so the heavy `description` column never passes through the
window function.

**Duplicate collapse** happens at rank time by `(company_id, normalised title)`,
keeping the highest-priority instance. Adzuna's `source_url` carries a
per-response session token, so `sourcePlatform + sourceUrl` differs on every
sync pass for what is plainly the same advert — six rows of "Web Developer —
Sadbhav Futuretech Limited", six URLs, one job. Collapsing at read time changes
no stored row, so it cannot merge two postings that only look alike, and
`duplicateCount` comes back with each row so the UI can say "6 identical
listings collapsed" instead of silently hiding five jobs.

**Exclusions:** active, fresher-eligible, no application row of any status
("saved" means you have already seen it), not dismissed. The anti-joins are
`NOT EXISTS` rather than `NOT IN`, so a NULL can never swallow the predicate.

The day-seeded rotation between `priority DESC` and `posted_date DESC, id` is
[Decision 3](../README.md#decision-3--the-queues-day-seeded-rotation) in the README.

---

## What drives the pipeline

`providers/scheduler.ts` walks all 47 enabled configs, sequentially by default
(`PROVIDER_CONCURRENCY` to parallelise), then runs the two global sweeps.

In production **nothing on the host triggers it**. Render's free tier has no
cron and no background workers, and a free web service spins down after 15
minutes idle — taking the in-process `setInterval` with it. The actual
scheduler is `.github/workflows/sync.yml`, a GitHub Actions job at
`0 */6 * * *` that wakes the service (step one, allowed to fail, absorbing the
30–60 second cold start) and then `POST`s `/api/sync/cron` with a shared secret
(step two, which does the work).

A **boot-sync guard** stops that arrangement from burning the metered
allowances: with `PROVIDER_RUN_ON_START=true`, every wake — a page load, a
health check, the cron's own wake-up curl — would otherwise start a full pass.
`decideBootSync()` suppresses the boot sync if a successful run was recorded in
the last two hours. Two hours sits comfortably inside the six-hour cadence, so
the scheduled run is never suppressed by the boot of the instance serving it,
while a burst of wakes collapses to at most one sync. It **fails open**: if the
lookup throws, the sync runs.

Every config run appends a row to `provider_sync_logs` (2,222 rows / 616 kB
after 37 days, ~60 rows a day). That table is the only thing that knows whether
ingestion is working across a spin-down, and it is what
`GET /api/health?detail=1` reads.

## Health and schema drift

The code and the database ship separately: Render deploys code on merge,
nothing deploys schema. Twice the code reached production before its columns
did and every `/api/jobs` request 500'd behind a green health check.

`lib/schema-check.ts` now compares every column the Drizzle schema declares
against `information_schema` at boot and on each health call. A missing column
makes `/api/health` and `/api/healthz` return **503** naming the exact columns
and the migration file, `POST /api/sync/cron` refuses to run, and the sync
workflow's wake step fails instead of swallowing it. An unreachable database is
`"schema": "unchecked"` with a **200** — the check reports drift, never
outages, so a deploy health check cannot flap on a Neon blip.

`?detail=1` adds a `sync` object: last successful sync across all providers,
and per-provider state (`ok` / `stale` / `failing` / `never_run` / `disabled`)
with 24-hour run and row counts. It is opt-in because the default body is what
Render's deploy check and the sync workflow's wake step read, and both of those
hit a cold instance where two extra aggregate queries are latency spent for
nothing. `providers/sync-status.ts` reads `provider_sync_logs` rather than the
in-memory `providers/metrics.ts`, because on a free instance the process
answering a health check is almost always one that booted seconds earlier for
that request — the in-memory counters read zero for a service that is syncing
perfectly well.

```bash
curl -s 'https://careerradar-34ec.onrender.com/api/health?detail=1' | jq '.sync | {lastSyncAt, fresh, providers: [.providers[] | {name, state}]}'
```

## Request path

```
browser ──(Clerk session cookie)──> Express 5 ──> service ──> repository ──> Postgres
```

- **Auth is cookie-based.** `clerkMiddleware` runs before the routers,
  `requireAuth` reads the session. There is no `Authorization: Bearer` header
  and no `getToken()` anywhere in browser code; a 401 is a middleware-ordering
  question, never a token-handling one.
- **The API contract is generated.** `lib/api-spec/openapi.yaml` is the source;
  orval produces Zod validators (`lib/api-zod`) and React Query hooks
  (`lib/api-client-react`). Nothing under a `generated/` directory is
  hand-edited. A new endpoint goes into the YAML first.
- **Repositories list columns explicitly** (`repositories/columns.ts`) rather
  than using a bare `.select()`, so a new schema column does not silently
  appear in an API response.
- **Every feature degrades to nothing.** If `GEMINI_API_KEY` is absent,
  `isAIAvailable()` returns false, the AI endpoints say so and the frontend
  hides the UI; paste-to-parse falls back to deterministic heuristics and the
  dialog tells you it did. A missing env var hides a feature — it never crashes
  a page.

## Search — `lib/search-query.ts`, `repositories/jobs-search.test.ts`

Phase 7 moved job search off `title ILIKE '%q%'` onto a generated
`jobs.search_vector` tsvector covering title, description, requirements and
skills, with server-side pagination.

Two things had to survive the move. `to_tsquery` is a parser, so raw user input
is a syntax error waiting to happen — `to_tsquery('english', 'c++ &')` throws,
and a 500 on the Jobs page for a stray ampersand is not acceptable; every term
is reduced to letters and digits before it reaches Postgres. And stemming alone
loses the prefix matches `ILIKE` used to find: "intern" stems to `intern`,
"Internship" to `internship`, and the two do not match — so a prefix arm is
OR'd in, except when the user is using `websearch_to_tsquery`'s own syntax
(a quoted phrase, a `-negation`, an explicit `or`), where a flat AND of every
word would undo them.

## AI match scores — `services/match-scores.service.ts`, `services/match-scores.batch.ts`

Phase 8. Scoring a profile against a posting costs a Gemini request; the point
of this layer is to make sure each one is spent at most once.

**The cache is a table, not a process.** `getJobMatchScore()` used to sit behind
a 200-entry in-memory LRU, which on a service that spins down after 15 minutes
idle was empty on almost every request. The cache is `job_match_scores` now, one
row per `(profile_id, job_id)`, and it survives restarts. Viewing the same job
twice makes zero outbound calls — the assertion in
`services/match-scores.test.ts` is the number of times the injected `generate`
function ran, not a cache-hit ratio.

**Freshness is a fingerprint, not a timestamp.** A row stores a hash of the two
inputs the recompute rule names — the sorted `skills` array and `resumeUrl` — and
only a mismatch forces a recompute. Comparing `profiles.updated_at` against
`computed_at` instead would invalidate every stored score the moment the user
edited their CGPA, which on today's table is up to 2,100 requests for a change
the prompt does not read.

**The limits were measured, and one of them could not be.** Bursting this
project's own key on 2026-09-16 and reading the `QuotaFailure` detail out of the
429 gave `gemini-3.5-flash-lite` 15 requests/minute and `gemini-3.6-flash` 5;
one real scoring call is 539 prompt + 138 output tokens in about 3.2 seconds.
The per-DAY allowance is not published any more and cannot be observed without
exhausting it, so nothing in the design depends on knowing it. Instead the batch
paces itself to 12 requests/minute (80% of the measured 15), the live path is
capped by `AI_DAILY_BUDGET` counted off `computed_at`, and a 429 is classified
by the quota id the server itself returns: `PerMinute` is waited out,
`PerDay` stops the run.

**Frequency is the lever, not the per-run cap.** This is the Phase 5 JSearch
lesson applied: a 50-job cap protects nothing if the job runs four times a day.
`.github/workflows/ai-batch.yml` runs it once nightly rather than hanging it off
the six-hourly sync, and `runBatchScoringForOwner` clamps each run to whatever is
left of the daily budget so an extra trigger cannot spend a second full batch.

**What it scores is the top of the relevance ranking**, never arbitrary rows: a
request spent on a `not_relevant` posting is one not spent on the internship at
the top of the queue, so the selection filters on `is_fresher_eligible` and
orders by `relevance_score DESC NULLS LAST`.

Nothing in the UI waits on any of it. The Jobs grid reads scores from a separate
`GET /api/ai/match-scores` query and renders cards without it; the apply drawer's
interview-prep block — which leads with `missingSkills` — renders nothing at all
when no key is configured, and never issues its request in that case.

## Testing

| Layer | How |
| --- | --- |
| Pure logic (classifier, location, priority, parsers, buckets) | Vitest unit tests over table-driven cases |
| Anything whose correctness is a property of the emitted SQL (staleness, queue, search, follow-up filter, applications service, sync status) | **PGlite** — real Postgres compiled to WASM, with the DDL generated from `lib/db/src/schema` by drizzle-kit so the test database cannot drift from the real one |
| HTTP shape and status codes | Supertest-style route tests with the service mocked |
| The thing the user actually does | Playwright against both dev servers, signed in through Clerk's ticket strategy |

941 unit tests across 48 files, plus 10 Playwright specs (an eleventh regenerates the
README screenshots and is skipped by default).

The rule the PGlite suites exist to enforce: a mocked `db` can only prove that
a function was called with some object, which is exactly the test that stays
green while the predicate underneath it is wrong. The staleness sweeps are the
only thing between a guard bug and a mass-closed job table, so their tests read
actual rows back out of an actual database.

## Deployment

| | |
| --- | --- |
| Host | Render, free tier — 512 MB / 0.1 CPU, spins down after 15 minutes idle |
| Database | Neon Postgres |
| Auth | Clerk development instance |
| Scheduler | GitHub Actions cron, `0 */6 * * *` |
| Filesystem | **Ephemeral.** Resume URLs are external; exports stream in the HTTP response. Nothing is written to disk. |

There is deliberately **no keep-alive ping**. Staying awake 24/7 burns the
entire 750 instance-hour monthly allowance and suspends the service mid hiring
season, which is a worse failure than a 40-second cold start.

Schema changes ship separately from code and are additive only — new tables,
new nullable columns, new columns with defaults. Nothing is ever dropped or
renamed. Each change carries a dated, idempotent `lib/db/sql/*.sql` file applied
to Neon's direct endpoint before or with the merge; `drizzle-kit push` only ever
points at a local database.

## Further reading

- [`adding-a-source.md`](adding-a-source.md) — adding a provider
- [`provider-health.md`](provider-health.md) — measured provider status
- [`phase-7-search-performance.md`](phase-7-search-performance.md) — the search and pagination work
