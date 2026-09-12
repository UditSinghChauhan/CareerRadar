# CareerRadar — Upgrade Spec for Claude Code

**Save this at the repo root as `UPGRADE.md`.** It is complete — nothing needs to be pasted in.

Companion files: `CAREERRADAR_PHASE0_SETUP.md` (environment and deployment facts) and
`CLAUDE_CODE_SESSION_PROMPTS.md` (the exact prompt for each session).

Run **one phase per session**, on **one branch per phase**, deploying between phases. Never let a
single session attempt the whole file — the app is live and a forty-file diff is not reviewable.

---

## 0. Context: who this is for

Single primary user: a final-year B.Tech IT student, 2027 graduating batch, based in Delhi NCR, hunting
**SDE internships and fresher roles in India**, aggressively, right now. The Jan–June 2027 six-month
internship cycle and the 2027 fresher cycle are both open and close between now and roughly November 2026.

The app's job is not to look impressive. Its job is to answer, every morning, in under 60 seconds:
**"What do I apply to today, and did I already apply to it?"**

Every feature below is judged against that. If a change does not reduce time-to-application or prevent
a missed deadline, it is out of scope.

Secondary goal: this repo is also a portfolio project shown to recruiters, so code quality, tests, and
the README matter — but never at the cost of shipping the above.

### Verified state of the live database (2026-09-12)

Established by direct query, not assumption. Build against these facts:

| Fact | Value |
|---|---|
| Total jobs | 2,105 |
| Active jobs | 2,105 — **nothing ever closes** |
| Rows passing a crude fresher-title filter | ~665 |
| By platform | remoteok 570, jsearch 542, greenhouse 504, adzuna 189, smartrecruiters 164, lever 93, remotive 30, LinkedIn 11, Unstop 2 |
| Companies | ~998 |
| `jobs.country` | **Unreliable.** Reads 'India' for all 570 RemoteOK rows because the schema default silently applies when a provider omits the field. SmartRecruiters sends lowercase ISO-2 ('in', 'ca'). Do not filter on this column. |
| `jobs.location` | Free text, unnormalized. Same city appears as 'Mumbai, MH', 'Mumbai, Maharashtra', 'Mumbai Metropolitan Region'. Also bare 'IN', 'TG', 'Worldwide'. |
| Location skew | Genuinely India-heavy. Top-20 locations are almost all Indian cities. |

---

## 1. Hard invariants — read before touching anything

Violating any of these breaks the live deployment at `https://careerradar-34ec.onrender.com/`.

### Repo conventions

- **Drizzle ORM only.** Never introduce Prisma. Schema lives in `lib/db/src/schema/`.
- **The API contract is generated, not hand-written.** The pipeline is
  `lib/api-spec/openapi.yaml` → orval → `lib/api-zod/src/generated/**` and
  `lib/api-client-react/src/generated/**`. **Any new or changed endpoint goes into `openapi.yaml`
  first**, then regenerate. Never hand-edit anything under a `generated/` directory — it will be
  overwritten.
- **Build order after touching `lib/*`:** `pnpm run typecheck:libs` **then**
  `pnpm --filter @workspace/api-server run typecheck`. Skipping the first produces phantom
  `TS2305 "no exported member"` errors from stale `.tsbuildinfo`.
- **Migrations:** `pnpm --filter @workspace/db run push`. Only ever against a local `DATABASE_URL`.
- **Auth:** browser calls use Clerk **session cookies**. Never add `getToken()`,
  `setAuthTokenGetter`, or `Authorization: Bearer` to any web/browser code. Debug 401s by checking
  `clerkMiddleware` ordering and `requireAuth`, not token handling.
- **Vite:** `tailwindcss({ optimize: false })` in `vite.config.ts` must stay. Removing `optimize: false`
  reorders nested `@layer` imports from `@clerk/themes/*.css` and breaks Clerk UI **in production
  builds only** — it looks fine in dev, so you will not catch it locally.
- **esbuild:** never put a CLI `main()` guard using `import.meta.url` in a module the server bundle also
  imports. esbuild inlines everything into one `dist/index.mjs`, so the guard fires for every module.
  Expose scripts as authenticated API routes, or run them un-bundled with `tsx`.
- **Aggregator providers** (`remoteok`, `remotive`, `adzuna`, `jsearch`) must set
  `companySlug: slugify(employerName)` **and** `companyName: employerName` on every `ProviderJob`.
  `normalize()` is async specifically so it can auto-create the `companies` row. Do not revert it to a
  sync `.map`.
- **devDependencies matter at build time.** `vite` is a devDependency. Never set `NODE_ENV=production`
  as a build-time environment variable — it makes pnpm skip devDeps and the build fails with
  `vite: not found`. The start command already sets `NODE_ENV=production` at runtime, which is correct.

### Production-safety rules

- **The database has live data.** All schema changes must be **additive only**: new tables, new nullable
  columns, new columns with defaults. Never drop or rename a column or enum value. If a value must
  change meaning, add a new column and backfill.
- **Every new user-facing feature degrades gracefully.** If an env var is missing or an external call
  fails, the feature hides itself — it never crashes a page. Follow the existing pattern in
  `ai-matching.service.ts` (`isAIAvailable()` returns false → frontend hides AI UI).
- **Do not change existing API response shapes.** Add fields; never remove or rename them.
- **CI must pass before a phase is done:** `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`,
  `pnpm run build`.
- **Legal boundary — do not cross it.** `internshala/provider.ts`, `unstop/provider.ts`, and
  `wellfound/provider.ts` are deliberate no-op stubs because those sites' ToS and robots.txt prohibit
  automated extraction. **Leave them returning `[]`, and leave their explanatory comment blocks intact**
  — those comments are the reason the code is correct, and a future session will re-add a scraper
  without them. Never add scraping, headless browsers, or proxy fetches for them or for LinkedIn or
  Naukri. Phase 4 adds the legitimate alternative.
- **Never run `git` commands.** The user handles all commits, pushes, and merges.

---

## Phase 1 — Make the tracker actually exist

**Why first:** the applications API, service, and repository are fully implemented, but `App.tsx` has no
`/applications` route. The most valuable feature in the app is currently unreachable, and clicking Apply
on a job leaves no trace.

### 1.1 Applications page

- New page `artifacts/career-radar/src/pages/applications.tsx`, registered in `App.tsx` as a
  `ProtectedRoute` at `/applications`, and added to the sidebar in `components/layout.tsx`.
- Two views, toggled and persisted in `localStorage`:
  - **Board view** — columns matching `applicationStatusEnum`: `saved`, `applied`, `oa_pending`,
    `oa_completed`, `interview_pending`, `interview_completed`, `offered`, `rejected`, `withdrawn`.
    Drag-and-drop between columns issues `PUT /api/applications/:id`, with React Query optimistic
    updates and rollback on error.
  - **Table view** — sortable by company, role, status, applied date, deadline, next-action date. This
    is the view for scanning 100+ rows; make it dense.
- Row/card shows: company logo, role title, status, applied date, deadline (red under 72h), and a
  direct link back to `applyUrl`.
- Bulk actions in table view: multi-select → change status, → delete.
- Empty state links to `/jobs`.

### 1.2 One-click apply that logs itself

The highest-leverage change in this document.

In `components/jobs/job-card.tsx`, replace the bare `<a href={job.applyUrl}>` with an **Apply** button
that:

1. Opens `job.applyUrl` in a new tab (`window.open(url, "_blank", "noopener,noreferrer")`) — call this
   **synchronously in the click handler, before any `await`**, or popup blockers will swallow it.
2. Fires `POST /api/applications` with `{ jobId, status: "applied", appliedAt: now }`.
3. Optimistically flips the card to an **Applied** state with the date.
4. On failure, shows a toast with a Retry action; does not revert the opened tab.

Also add a **Save** action creating `status: "saved"` without opening the tab.

### 1.3 Applied/saved state visible everywhere

The jobs list must never show a clean Apply button for something already applied to.

- Add `GET /api/applications/status-map` returning `Record<jobId, applicationStatus>` for the
  authenticated profile. Add it to `openapi.yaml`, regenerate the client.
- Cache it in React Query with a long `staleTime`; invalidate on any application mutation.
- `job-card.tsx` reads the map and renders one of: **Apply** / **Applied ✓ (date)** / **Saved** /
  current pipeline stage badge.
- Add a jobs filter: `Hide jobs I've applied to` — default **on**.

### 1.4 Application detail drawer

Clicking a row opens a drawer with editable: status, applied date, deadline, next-action date, notes
(free text), and the source URL. Persist via the existing `PUT /api/applications/:id`.

**Acceptance criteria**

- [ ] `/applications` renders in board and table views and survives refresh in the last-used view.
- [ ] Clicking Apply opens the correct external URL *and* the application appears on the board without
      a manual refresh.
- [ ] Reloading `/jobs` shows the Applied badge on that job.
- [ ] Dragging a card between columns persists after refresh.
- [ ] Full verification sequence passes.
- [ ] No existing endpoint's response shape changed.

---

## Phase 1.5 — Close stale jobs

**Why now:** the live DB is 2,105 active out of 2,105 total. `deduplication.ts` only ever inserts and
updates, and `status` is only ever set to `active`. There is no staleness sweep anywhere in the codebase.
Within weeks you will have thousands of dead postings indistinguishable from live ones — which for this
user means wasting mornings clicking through to expired listings. Ship this immediately after Phase 1.

### A. Last-seen sweep — for ATS providers with authoritative listings

- Add nullable `lastSeenAt timestamptz` to `jobs`. Set it on every insert **and** on every skip or
  update in `deduplication.ts` — a skip still means the provider is currently listing that job.
- After a successful provider+company run, close any `active` job with that `sourcePlatform` and
  `companyId` whose `lastSeenAt` predates this run's start.
- **Guard: only run the sweep if the fetch returned more than zero jobs.** A provider erroring or
  returning an empty array must never close that company's entire catalogue. This guard is the whole
  reason the feature is safe.

### B. Age fallback — for aggregators

RemoteOK, Remotive, Adzuna and JSearch do not return stable complete listings, so last-seen is
unreliable for them.

- New env `SYNC_MAX_AGE_DAYS`, default 45, added to `.env.example`.
- After each run, close active jobs from aggregator platforms whose `postedDate` is older than the cutoff.
- Also close any job whose `deadline` has passed, regardless of platform.

### C. Backfill

One-off close of jobs with `postedDate` older than 60 days, so the table starts clean. It must **print
the count it would close and require explicit confirmation** before closing anything. Idempotent and
safe to re-run.

**Acceptance criteria**

- [ ] A zero-result provider fetch closes nothing (test this explicitly).
- [ ] A fetch missing one previously-seen job closes exactly that job.
- [ ] Running the sweep twice changes nothing the second time.
- [ ] Active count drops meaningfully after the backfill — but not to near zero. If it does, the logic
      is wrong.

---

## Phase 5 — Make sync reliable in production

Run this **before** Phase 2. There is no point refining relevance over a feed that only updates when
the user happens to load the page.

**Note:** the cron workflow in **section C of `CAREERRADAR_PHASE0_SETUP.md` supersedes anything here** —
it handles Render's cold starts. Use that version.

### 5.1 External cron trigger

- New route `POST /api/sync/cron`, authenticated by an `x-cron-secret` header compared against
  `process.env.SYNC_CRON_SECRET` using `crypto.timingSafeEqual`. Returns 401 immediately if the env var
  is unset. This route bypasses Clerk deliberately — it is machine-to-machine.
- It kicks off `schedulerService.runAll()` and returns **202 Accepted immediately**. Do not hold the
  request open; a full sync across 35 configs far exceeds any reasonable HTTP timeout.
- `SYNC_CRON_SECRET` added to `.env.example`.
- New workflow `.github/workflows/sync.yml` — copy it from section C of the setup file.
- Keep the in-process scheduler for local development, gated on `PROVIDER_ENABLED`.

### 5.2 Boot-sync guard

`PROVIDER_RUN_ON_START=true` combined with free-tier instances restarting on wake means several wake-ups
in a row would mean several full syncs in a row, burning Adzuna and JSearch rate limits. In
`schedulerService.start()`, query `provider_sync_logs` for the most recent successful run and skip the
boot sync if it was under 2 hours ago.

### 5.3 Provider health audit

- Script plus authenticated route `POST /api/admin/verify-providers` walking every entry in
  `providers/config.ts` — including `enabled: false` ones — issuing one live request each with a short
  timeout, returning `{ companySlug, providerName, httpStatus, jobCount, verdict }`.
- Write results to `docs/provider-health.md` so the audit is reviewable in a PR.
- **Actually make the requests. Report real results. Never assume or infer a provider's status.**
- Re-test **Ashby** against its documented public posting endpoint
  `https://api.ashbyhq.com/posting-api/job-board/{jobBoardName}` rather than the endpoint that
  previously 401'd. If it still 401s, leave the 14 configs disabled and record that honestly. No
  browser-session workarounds, cookie forging, or headless browsers.
- Same for **Workday**: verify once, honestly, record the outcome.
- For the ~26 slugs returning 404, resolve the current ATS from each company's careers URL and update
  `catalog.ts` and `config.ts`. Any slug you cannot verify stays `enabled: false` with a dated note.
- **Do not flip any config to `enabled: true`** without a successful live request returning a non-zero
  job count, recorded with the count and date in that config's `note` field, matching the existing
  convention.

### 5.4 Expand India coverage

Add and verify Greenhouse / Lever / SmartRecruiters boards for India-heavy employers that hire freshers.
Same verification rule as above.

**Acceptance criteria**

- [ ] Manually triggering the GitHub Action increases the `jobs` count and writes a `provider_sync_logs` row.
- [ ] `POST /api/sync/cron` with a wrong or missing secret returns 401.
- [ ] `docs/provider-health.md` reflects a real run.
- [ ] No config flipped to enabled without recorded verification.

---

## Phase 2 — Location normalization and relevance

Split across two sessions: §2.0 first, then §2.1–2.3.

### 2.0 Location normalization — do this first, as its own session

`jobs.country` is unreliable (see §0). Leave the column in place — additive-only rule — but **stop
reading it anywhere**.

New nullable columns on `jobs`:

```
locationCity      text
locationRegion    text       -- normalized state/province
locationCountry   text       -- uppercase ISO-2, null if unknown
locationMetro     text       -- e.g. 'NCR', 'MMR', 'Bengaluru'
isIndia           boolean    -- nullable: true / false / null = unknown
isRemote          boolean    default false
```

New module `artifacts/api-server/src/relevance/location.ts`:

```ts
export function normalizeLocation(raw?: string | null, providerCountry?: string | null): {
  city?: string; region?: string; country?: string;
  metro?: string; isIndia: boolean | null; isRemote: boolean;
};
```

Rules:

1. **Remote markers** → `isRemote = true`: `/worldwide|remote|anywhere|work from home|wfh/i`.
   Remote alone does **not** set `isIndia` — leave it null unless a country is also present.
2. **State abbreviations** → full name: MH→Maharashtra, DL→Delhi, KA→Karnataka, TG/TS→Telangana,
   TN→Tamil Nadu, UP→Uttar Pradesh, HR→Haryana, GJ→Gujarat, MP→Madhya Pradesh, WB→West Bengal,
   RJ→Rajasthan, PB→Punjab, KL→Kerala, AP→Andhra Pradesh.
3. **City aliases:** Bangalore→Bengaluru, Gurgaon→Gurugram, Bombay→Mumbai, Calcutta→Kolkata,
   Madras→Chennai, Trivandrum→Thiruvananthapuram.
4. **Metro grouping** — the rule that matters most for daily use, since the user is in NCR:
   - `NCR` = Delhi, New Delhi, Noida, Greater Noida, Gurugram, Faridabad, Ghaziabad
   - `MMR` = Mumbai, Navi Mumbai, Thane, Mumbai Metropolitan Region
   - everything else maps to its own city name
5. **Bare country tokens:** 'IN' / 'India' / 'in' → country 'IN', `isIndia` true, city null.
6. **Unmatched → `isIndia = null`, never false.** An unknown location must stay reviewable, not
   silently disappear. Surface it as an 'Unknown location' filter bucket.

Apply in `normalizer.ts` at write time. Backfill all 2,105 existing rows using the batched idempotent
script pattern from §2.2.

Jobs page gains filters: India only / Remote / metro multi-select, defaulting to
NCR + Bengaluru + Hyderabad + Pune + Remote.

**Tests must cover these real values from the live DB:** 'Mumbai, MH', 'Mumbai, Maharashtra',
'Mumbai Metropolitan Region', 'Navi Mumbai, MH' (all → metro MMR); 'New Delhi, DL', 'New Delhi, Delhi'
(both → NCR); 'Bengaluru, Karnataka'; 'Gurugram, Haryana'; 'Noida, Uttar Pradesh'; 'IN'; 'India'; 'TG'
(→ Telangana); 'Worldwide' (→ isRemote true, isIndia null); 'Nassau, '; 'Toronto, '; and an
unrecognized string returning `isIndia: null` rather than false.

### 2.1 Relevance classifier

**Deterministic rules, not an LLM call.** Gemini would be slow, costly, and non-reproducible here.

New file `artifacts/api-server/src/relevance/classifier.ts`:

```ts
export type RelevanceTrack = "internship" | "new_grad" | "early_career" | "not_relevant";

export interface RelevanceResult {
  track: RelevanceTrack;
  score: number;             // 0-100
  isFresherEligible: boolean;
  inferredBatches: number[]; // e.g. [2027]
  signals: string[];         // human-readable reasons, shown in the UI for debugging
}

export function classifyJob(input: {
  title: string;
  description?: string | null;
  requirements?: string | null;
  experienceMin?: number | null;
  experienceMax?: number | null;
  jobType?: "internship" | "full_time";
  isIndia?: boolean | null;
  isRemote?: boolean;
}): RelevanceResult;
```

Rules, in priority order:

1. **Hard exclusions** → `not_relevant`, score 0. Title matches
   `senior|sr\.?|staff|principal|lead|manager|director|architect|head of|vp |chief`, or `\b(II|III|IV)\b`,
   or `\b[3-9]\+?\s*(years|yrs)`. Also exclude if `experienceMin >= 2`.
2. **Internship** → title matches `intern|internship|trainee|apprentice|co-?op`, or `jobType === "internship"`.
3. **New grad** → matches `new grad|graduate|campus|fresher|entry.?level|university|early career|
   associate software|sde ?-? ?1|sde ?i\b|software engineer i\b|\b0-?[12]\s*(years|yrs)`.
4. **Early career** → no seniority signal, `experienceMax <= 2` or unspecified, and the title contains a
   recognised engineering role noun.
5. Everything else → `not_relevant`.

**Batch inference:** regex `\b20(2[5-9])\b` over title and description, keep years within ±2 of the
current year, write to `inferredBatches`. If a job explicitly names a batch excluding the user's
`graduationYear`, drop the score by 40 rather than excluding outright — job text is often sloppy.

**Score composition** (0–100): track base (internship 90 / new_grad 85 / early_career 60), then
`isIndia === true` +10, `isRemote` +5, batch match +10, real `deadline` present +5, posted within 7 days
+10, posted over 45 days ago −20. **Use `isIndia` from §2.0, never `jobs.country`.**

Unit tests: at least 25 real title strings. These three must pass:

- `"Senior Software Engineer Intern"` → **internship** (the intern signal must beat the seniority signal)
- `"SDE II"` → **not_relevant**
- `"Software Development Engineer Intern - 2027"` → **internship**, `inferredBatches` includes 2027

### 2.2 Persist it

Additive columns on `jobs`:

```
relevanceTrack     text
relevanceScore     integer
isFresherEligible  boolean  default false  not null
seniorityExcluded  boolean  default false  not null
relevanceSignals   text[]   default []     not null
classifiedAt       timestamptz
```

Indexes on `is_fresher_eligible`, `relevance_score`, and a composite
`(is_fresher_eligible, status, relevance_score DESC)`.

Hook `classifyJob()` into `providers/normalizer.ts` so every ingested job is classified at write time.

Backfill script `artifacts/api-server/src/scripts/backfill-relevance.ts`, run with `tsx`, batched at 500
rows, idempotent. **Also expose it as an authenticated route** (`POST /api/admin/backfill-relevance`)
because of the esbuild CLI-guard constraint in §1. Never load the whole table into memory — the
instance has 512MB RAM.

### 2.3 Surface it

- `JobFilters` in `jobs.repository.ts` gains `isFresherEligible?`, `relevanceTrack?: string[]`,
  `minRelevanceScore?`, plus the location filters from §2.0. Add the query params to `openapi.yaml`
  and regenerate.
- Jobs page defaults for a signed-in user with `graduationYear` set: fresher-eligible **on**,
  `eligibleBatch` = their graduation year, sorted by `relevanceScore DESC`.
- Job card shows a track badge (`Internship` / `New Grad` / `Early Career`) and, on hover, the
  `relevanceSignals` list so misclassification is debuggable without opening the DB.
- **Add a `Show everything` escape hatch.** The classifier will be wrong sometimes and the user must be
  able to see past it.

**Acceptance criteria**

- [ ] Location tests pass, including the unmatched → null case.
- [ ] `classifier.test.ts` passes with ≥25 cases including the three named above.
- [ ] Both backfills run against a local copy without touching any pre-existing column.
- [ ] Jobs page defaults to fresher-eligible, India/remote, sorted by relevance, for a 2027 profile.
- [ ] Turning filters off restores the previous unfiltered behaviour exactly.

---

## Phase 3 — The daily apply queue

**Why:** the dashboard currently reports history. It should assign work.

### 3.1 Endpoint

`GET /api/dashboard/today?limit=10` → ranked jobs the user has **not** applied to, **not** dismissed,
with `status = "active"`, ordered by:

```
priority =
    relevanceScore   * 0.40
  + deadlineUrgency  * 0.30      // 100 if <72h, 80 if <7d, 40 if <30d, 10 if none
  + freshness        * 0.20      // 100 if posted <48h, decaying to 0 at 30 days
  + dreamCompanyBoost* 0.10      // 100 if in the user's dream list, else 0
```

Return the priority components alongside each job so the UI can explain the ranking. Do not recompute
them in the frontend.

### 3.2 Dismissals

New table `job_dismissals` (`id`, `profileId`, `jobId`, `reason` nullable, `createdAt`), unique on
`(profileId, jobId)`. `POST /api/jobs/:id/dismiss` and `DELETE /api/jobs/:id/dismiss`. Dismissed jobs
are excluded from the queue and from the jobs list unless `Show dismissed` is on.

### 3.3 UI

Replace the top of the dashboard with **Today's Queue**: the ranked list, each row carrying the same
one-click Apply from Phase 1 plus a Dismiss action. Above it, a daily target counter
(`4 / 10 applications today`) with a streak, computed from `applications.appliedAt`. Target configurable
in settings, default 10. Keep the existing stat cards and charts, moved below the queue.

**Acceptance criteria**

- [ ] Applying to a queue item removes it and increments the counter immediately.
- [ ] Dismissing removes it and it does not return after refresh.
- [ ] Each row displays a plain-language reason for its rank.
- [ ] Queue returns in under 500ms with the current table size. Include `EXPLAIN ANALYZE` output and add
      whatever indexes it needs.

---

## Phase 4 — Quick capture for platforms with no API

**Why:** LinkedIn, Internshala, Unstop, Wellfound, Naukri and non-ATS career pages collectively hold most
of the relevant postings, and none can be legally scraped. The answer is to make manual entry take five
seconds instead of two minutes.

**This is the phase where the legal boundary matters most. The server must never make an HTTP request to
internshala.com, unstop.com, wellfound.com, linkedin.com, or naukri.com.** The user pastes text; the
server parses what it was given. Keep the three stub providers and their comment blocks untouched.

### 4.1 Paste-to-parse

- `POST /api/jobs/capture` with `{ url: string, rawText?: string }`.
- If `rawText` is present and `GEMINI_API_KEY` is set, send it to Gemini with a strict JSON-only prompt
  (reuse the fence-stripping `parseResponse` helper from `ai-matching.service.ts`) to extract title,
  company, location, workMode, jobType, stipend/salary, deadline, requiredSkills, description.
- If Gemini is unavailable, derive what it can from the URL and return a mostly-empty draft.
  **The feature must work fully with no API key** — manual entry is the floor, AI is the accelerator.
  Test both paths.
- The response is a **draft**, never a direct insert. The user confirms in a dialog before saving.
- Run the §2.0 location normalizer and the §2.1 classifier on the confirmed job. Set
  `sourcePlatform: "manual"`.

### 4.2 UI

- "Add job" button on `/jobs` opening a dialog: URL field, large paste-the-JD textarea, Parse button,
  then an editable pre-filled form, then Save.
- After save, offer **Save & mark applied** as the primary action — the common case is capturing
  something being applied to right now.

### 4.3 Bookmarklet

- Static page at `/tools/capture` with setup instructions and a draggable bookmarklet link.
- The bookmarklet grabs `location.href` plus `window.getSelection().toString()` and opens
  `/jobs?capture=1&url=...&text=...`, which auto-opens the capture dialog pre-filled.
- Keep the payload under ~1,800 characters; truncate the selection.

**Acceptance criteria**

- [ ] Pasting a real LinkedIn JD produces a draft with title and company correctly filled.
- [ ] The dialog works end-to-end with `GEMINI_API_KEY` unset.
- [ ] The bookmarklet works from a LinkedIn job page in Chrome.
- [ ] A repo-wide grep for those five domains matches only the stub providers' comments.

---

## Phase 6 — Deadlines, follow-ups, referral tracking

**Why:** applications die from missed deadlines and from never following up. Referrals convert far
better than cold applications, and there is currently nowhere to track outreach.

### 6.1 Referral fields

Additive columns on `applications`:

```
followUpAt      timestamptz
contactName     text
contactUrl      text        -- LinkedIn profile
referralStatus  text        -- "none" | "requested" | "received" | "declined"
outreachNotes   text
```

Surfaced in the Phase 1 detail drawer. New `/applications` filter: `Awaiting follow-up`
(`followUpAt <= now` and status not terminal).

### 6.2 Notifications

The `notifications` table and `notificationTypeEnum` exist but have no routes and no UI.

- `routes/notifications.ts`: list, mark-read, mark-all-read.
- Bell icon with unread count in `components/layout.tsx`.
- Generate during sync: `deadline_reminder` at 72h and 24h before a deadline on any saved or applied
  job; `new_job` when a job scores above a threshold against a saved search.

### 6.3 Email digest

- Resend integration. `RESEND_API_KEY` and `DIGEST_TO_EMAIL` in `.env.example`.
- Daily 08:00 IST via a second GitHub Actions cron (`30 2 * * *` UTC) hitting
  `POST /api/notifications/digest` with the same cron-secret pattern: today's queue top 10, deadlines
  inside 3 days, applications with no status change in 7 days.
- **Degrade silently if `RESEND_API_KEY` is unset.** Log and return 200.

---

## Phase 7 — Search and performance

- Generated `tsvector` column on `jobs` over `title`, `description`, `requirements`, `required_skills`,
  with a GIN index. Rewrite the `search` branch of `buildConditions()` to use `websearch_to_tsquery`,
  keeping `ilike` as a fallback for very short queries.
- **Company-name search must keep working exactly as it does today** — include a test proving it. Either
  fold company name into the tsvector source or OR the existing `ilike` with the FTS predicate.
- Debounce the jobs page search input at 300ms.
- `React.memo` on `job-card.tsx`; virtualise the list past 100 rows.
- Composite index for the default sort: `(status, relevance_score DESC, posted_date DESC)`.
- Include `EXPLAIN ANALYZE` before and after.

---

## Phase 8 — Cost-controlled AI

`getJobMatchScore()` calls Gemini live per job with only a 200-entry in-memory LRU that dies on every
restart — and on free tier the instance restarts constantly.

- New table `job_match_scores`: `profileId`, `jobId`, `score`, `summary`, `matchingSkills[]`,
  `missingSkills[]`, `recommendations[]`, `computedAt`. Unique on `(profileId, jobId)`.
- Check the table before calling Gemini. Recompute only if the profile's `skills` or `resumeUrl` changed
  after `computedAt`.
- Nightly batch scoring the top 50 unscored fresher-eligible jobs, concurrency capped at 2, exponential
  backoff on 429.
- Show the score on job cards where present; never block a card's render waiting for it.
- In the apply drawer, show `missingSkills` — the genuinely useful output for interview prep.

**Acceptance criteria**

- [ ] A test proves viewing the same job twice makes zero Gemini calls.
- [ ] Every page renders with `GEMINI_API_KEY` unset.

---

## Phase 9 — Portfolio polish

- Update the README: **fresh screenshots** (the ones in `docs/screenshots/` are out of date), accurate
  feature list, an explanation of the relevance engine — the most interesting technical piece, describe
  the rules and the test strategy — and a short "what I'd do next".
- `docs/architecture.md` with the pipeline: provider → normalizer → location → classifier → dedup →
  upsert → staleness sweep → queue ranking.
- Test coverage on the classifier, the location normalizer, the ranking function, and the applications
  service.
- `/api/health` detail response including provider status and last sync time.

---

## Verification sequence — run at the end of every phase

```bash
pnpm run typecheck:libs
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Then report each acceptance criterion for that phase as pass or fail. Do not claim a phase is complete
with a failing criterion — say which one failed and why.

---

## Execution order

1 → 1.5 → 5 → 2.0 → 2.1–2.3 → 3 → 4 → 6 → 7 → 8 → 9