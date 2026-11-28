<div align="center">

# CareerRadar

**Ten SDE roles worth applying to, every morning, for Indian CS freshers, each with the reason it made the list.**

[![CI](https://github.com/UditSinghChauhan/CareerRadar/actions/workflows/ci.yml/badge.svg)](https://github.com/UditSinghChauhan/CareerRadar/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black)

[**Live app**](https://careerradar-34ec.onrender.com/) ·
[**Try the read-only demo**](https://careerradar-34ec.onrender.com/demo) ·
[**Walkthrough video**](docs/showcase/walkthrough.mp4) ·
[**Run it locally**](#run-it-locally)

<sub>The demo signs you in to an invented account with no sign-up; the server
refuses every write from it (403 <code>demo_read_only</code>), so nothing you
click can change it. The API sleeps when idle, so the first request can take
up to a minute.</sub>

<a href="docs/showcase/walkthrough.mp4"><img src="docs/showcase/walkthrough-cover.jpg" alt="Today's ten in CareerRadar. Play the one-minute walkthrough" width="900" /></a>

</div>

**At a glance**

- **Problem:** thousands of postings are active at once, about half of them open to a fresher. Nobody can read that every morning, so whatever is at the top of a list is what gets applied to.
- **What it does:** pulls postings from public ATS and job-board APIs, decides which a final-year student can apply to, and hands over ten a day, ranked, with the reason for each. It also tracks every application from saved to offer.
- **Stack:** React 18 + Vite, Express 5 on Node 22, PostgreSQL 16 with Drizzle, Clerk, an OpenAPI-generated contract; Vitest, PGlite and Playwright.

## Contents

- [Today's ten](#todays-ten)
- [What it does](#what-it-does)
- [Run it locally](#run-it-locally)
- [Tech stack and hosting](#tech-stack-and-hosting)
- [Engineering decisions](#engineering-decisions)
- [Architecture](#architecture)
- [What this does not do](#what-this-does-not-do)
- [What I'd do next](#what-id-do-next)

---

## Today's ten

<img src="docs/screenshots/dashboard.png" alt="Today's ten: ranked roles, each with its rank, score, up to three short reasons and an Apply button" width="900" />

The ranking is the product, so every row says why it is there in words a
student reads at a glance: *Closes tomorrow*, *Dream company*, *Posted
yesterday*, *Strong match for interns*. The reasons are built on the server
from the same data that orders the list, so they cannot disagree with it.

**How is this ranked?** sits above the list and answers in plain words: each
role gets a score out of 100 from how well it fits a fresher (40%), how soon
it closes (30%), how recently it was posted (20%) and whether it is at a
company you starred (10%). Because most sources publish no closing date, that
part is often the same for every role, and roles with the same score take
turns from day to day.

<img src="docs/screenshots/daily-queue-reasons.png" alt="The 'How is this ranked?' note: the four parts of the score in plain words" width="900" />

---

## What it does

**Ingestion**

- **14 providers registered, 47 of 95 company/provider configs enabled:**
  Greenhouse, Lever, Ashby, SmartRecruiters and Workday (authoritative
  per-employer listings), plus RemoteOK, Remotive, Adzuna, JSearch, Arbeitnow
  and Jobicy (aggregators). The disabled configs are boards that have gone
  quiet or 404'd; they stay in the table with a note rather than being
  deleted.
- **Sync every six hours, from GitHub Actions**, because Render's free tier has
  no cron and stops the in-process scheduler when the service sleeps. A
  boot-sync guard keeps a burst of cold starts from burning Adzuna's 250
  requests a day and JSearch's 200 a month.
- **Stale-job closing:** three separate sweeps, because "this posting is dead"
  means something different for an ATS (absent from today's complete listing)
  than for an aggregator (older than 45 days). Guarded so a provider outage can
  never be read as "this company closed everything".
- **Location normalization:** six columns out of the free-text string every
  provider emits, with NCR/MMR metro grouping and an explicit "unknown" state.
- **The relevance classifier** sorts every posting into internship /
  new_grad / early_career / not_relevant and scores it 0 to 100.

**Using it**

- **Today's ten:** ten ranked roles a day, duplicates collapsed, dismissals
  respected, a daily target counter, and up to three reasons per row.
- **Applications tracker:** a board of six stages that fits the screen
  (Saved, Applied, Assessment, Interview, Offer, Closed) and a table view,
  with referral/outreach tracking and an "awaiting follow-up" filter.
- **One-click apply:** opens the posting and logs the application in the same
  click, date stamped.
- **Paste-to-parse capture:** paste a job description, get a filled form.
  Works with **no API key**: Gemini is used when `GEMINI_API_KEY` is set, and
  deterministic heuristics otherwise, with the dialog saying which ran.
- **Search:** Postgres full-text over title, description, requirements and
  skills, server-side pagination, saved searches.
- **Notifications:** deadline reminders at 72h and 24h, new-job alerts against
  saved searches, deduplicated so six-hourly passes do not repeat themselves.
- **AI match scores:** a 0 to 100 fit score on the card and, in the application
  drawer, the skills this posting wants that your profile does not show. Scores
  are computed once and stored, so opening the same job again costs nothing;
  a nightly batch scores the top 50 unscored roles by relevance. Optional
  everywhere: with no `GEMINI_API_KEY` the badge and the block are absent.
- **Read-only demo:** `/demo` opens an invented account without sign-up; the
  API answers every write from it with 403 before any route runs.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/jobs.png" alt="Jobs explorer with relevance, location and batch filters" /><p align="center"><em>Jobs: relevance, location and batch filters</em></p></td>
<td width="50%"><img src="docs/screenshots/jobs-relevance.png" alt="A relevance score with the signals that produced it" /><p align="center"><em>Every score shows the signals that produced it</em></p></td>
</tr>
<tr>
<td><img src="docs/screenshots/applications.png" alt="Applications board" /><p align="center"><em>Applications, as a board</em></p></td>
<td><img src="docs/screenshots/applications-table.png" alt="Applications tracker, table view" /><p align="center"><em>…and as a table</em></p></td>
</tr>
<tr>
<td><img src="docs/screenshots/capture.png" alt="Paste-to-parse capture dialog, filled from a pasted description" /><p align="center"><em>Paste-to-parse, no API key required</em></p></td>
<td><img src="docs/screenshots/notifications.png" alt="Notification panel with a deadline reminder" /><p align="center"><em>Deadline reminders</em></p></td>
</tr>
<tr>
<td><img src="docs/screenshots/profile.png" alt="Profile" /><p align="center"><em>Profile: the graduation year drives batch matching</em></p></td>
<td><img src="docs/screenshots/settings.png" alt="Settings" /><p align="center"><em>Settings: appearance, daily target, and what Today's ten puts first</em></p></td>
</tr>
</table>

<details>
<summary>More screenshots</summary>

| | |
| --- | --- |
| Landing | <img src="docs/screenshots/landing.png" width="420" /> |
| Sign in | <img src="docs/screenshots/sign-in.png" width="420" /> |
| Full dashboard | <img src="docs/screenshots/dashboard-full.png" width="420" /> |
| Bookmarklet installer | <img src="docs/screenshots/capture-bookmarklet.png" width="420" /> |

Every company, role and person in them is invented. Regenerate them all
against a throwaway local database (the script refuses any other host):

```bash
createdb careerradar_capture
DATABASE_URL=postgres://localhost:5432/careerradar_capture \
  node scripts/capture-readme.mjs
```

</details>

---

## Run it locally

Needs Node 22+, pnpm 9+, a PostgreSQL 16 database and a free Clerk
development instance.

```bash
git clone https://github.com/UditSinghChauhan/CareerRadar.git
cd CareerRadar
pnpm install
cp .env.example .env          # fill in DATABASE_URL and the Clerk keys

pnpm --filter @workspace/db run push        # schema → local database only
pnpm --filter @workspace/api-server run seed

pnpm --filter @workspace/api-server run dev    # :8080
pnpm --filter @workspace/career-radar run dev  # :5173
```

Interactive API docs at `http://localhost:8080/api/docs`.

### Environment variables

`.env.example` documents each one in full. Everything optional stays optional:
the app runs, and only the feature in the last column goes quiet.

| Variable | | Without it |
| --- | --- | --- |
| `DATABASE_URL` | required | The API does not start. |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | required | The API cannot verify sessions. |
| `VITE_CLERK_PUBLISHABLE_KEY` | required, at build time | The frontend cannot sign anyone in. |
| `SYNC_CRON_SECRET` | required in production | `POST /api/sync/cron` answers 401, so the scheduled sync never runs. |
| `GEMINI_API_KEY` | optional | No AI match scores (the badge and drawer block are hidden); paste-to-parse uses its heuristics. |
| `AI_DAILY_BUDGET` | optional | Gemini is capped at the default 200 requests per rolling 24 hours. |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | optional | The Adzuna provider is skipped; the others run. |
| `JSEARCH_API_KEY` | optional | The JSearch provider is skipped; the others run. |
| `DEMO_CLERK_USER_ID` | optional | `/demo` is off and says so. |
| `ALLOWED_ORIGINS` | optional | The API reflects any origin and skips Clerk's `azp` check. Needed only when the frontend is on another origin ([docs/DEPLOY.md](docs/DEPLOY.md)). |
| `VITE_CLERK_PROXY_URL` | optional | Clerk is reached directly rather than through `/api/__clerk`. |
| `RELEVANCE_GRADUATION_YEAR` | optional | The year comes from the profile; until a profile names one, no batch modifier fires. |
| `PROVIDER_ENABLED` and the other `PROVIDER_*` | optional | The in-process scheduler stays off; the GitHub Actions cron drives sync. |
| Request budgets, notification thresholds, `SYNC_MAX_AGE_DAYS`, `PORT`, `LOG_LEVEL` | optional | Defaults apply (listed in `.env.example`). |

### Verification

```bash
pnpm run typecheck:libs   # always first: a stale .tsbuildinfo causes phantom errors
pnpm run typecheck
pnpm run lint
pnpm run test             # Vitest: 1,005 api-server + 141 career-radar tests (2026-11-28), one package at a time
pnpm run build
pnpm run test:e2e         # 12 Playwright specs, needs a local DB + Clerk dev keys
pnpm run test:landing     # 2 landing specs, against a built landing on :5198
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every pull
request and every push to `main`, in two jobs:

- **Lint, Typecheck, Test & Build** runs the first five commands above.
- **E2E · Playwright (Chromium)** pushes the schema to a fresh PostgreSQL 16
  service, seeds it, and runs `test:e2e`, then `test:landing` against a built
  landing. It signs in to the Clerk development instance with the
  `CLERK_PUBLISHABLE_KEY_TEST` and `CLERK_SECRET_KEY_TEST` secrets. Each spec
  gets one retry in CI and none locally. On a failure, the HTML reports and
  traces are uploaded as the `playwright-report` artifact. A fork's pull
  request has no secrets, so the job is skipped with a notice.

### The walkthrough film

`docs/showcase/walkthrough.mp4` (and `.webm`, with `walkthrough-cover.jpg` as
its 1600×1000 still) is a 66-second, 1440×900 recording of the first-run
journey: landing, sign-up, onboarding, Today's ten, "How is this ranked?",
Apply, the board and a deadline reminder. Every company, role and person in it
is invented. To record it again after a UI change:

```bash
# A throwaway local database; the script refuses any non-local host.
createdb careerradar_capture
DATABASE_URL=postgres://localhost:5432/careerradar_capture \
  node scripts/record-walkthrough.mjs
```

It needs ffmpeg (libx264 and libvpx) and Playwright's Chromium, and no Clerk
keys: Clerk is stubbed, so the sign-up step shows a local stand-in card in the
place of Clerk's, and every screen after it is the real app against the real
API code. It prints the time each step was reached.

---

## Tech stack and hosting

| Layer | |
| --- | --- |
| Frontend | React 18, Vite, Wouter, TanStack Query, Radix UI + shadcn/ui, Tailwind CSS v4 |
| Backend | Express 5, Node 22, TypeScript 5.9 |
| Database | PostgreSQL 16, Drizzle ORM (never Prisma) |
| Auth | Clerk, with **session cookies**; no bearer tokens in browser code |
| AI | Google Gemini, optional everywhere it appears |
| Contract | OpenAPI 3.1 → orval → Zod validators + React Query hooks |
| Tests | Vitest, PGlite (Postgres in WASM), Playwright |
| Hosting | **Render** runs one Express service that serves the built frontend and `/api`. **GitHub Actions** runs CI (lint, typecheck, unit tests, build and both Playwright suites), the six-hourly sync and the nightly AI batch. A split that moves the frontend to Vercel's CDN, so visitors never wait for a sleeping API, is configured (`vercel.json`) and documented in [docs/DEPLOY.md](docs/DEPLOY.md), but is not live yet. |

---

## Engineering decisions

Three pieces where the interesting part is *why*, not *what*. Each has a short
summary; open it for the full reasoning and the measurements behind it.

### Decision 1: the relevance classifier

**`artifacts/api-server/src/relevance/classifier.ts`**

- Deciding "a final-year student can apply to this" is done with deterministic rules and no LLM, so the same input always gives the same score.
- Provider job types and titles disagree; 64 of 81 disagreements on 2026-09-15 were a substring bug ("Internal Audit", "International Voice").
- Rule order is the design, every modifier that fires is named, and every live-data bug became a verbatim test case.

<details>
<summary>The full reasoning</summary>

Sorting thousands of postings (4,512 active on 2026-09-16) into "a final-year
student can apply to this" and "they cannot" is the whole value of the app,
and it is done with **deterministic rules and no LLM**. That is the first
decision, and it was not about cost: the same input must always produce the
same output, because the backfill recomputes every row on every run. A model
that answers slightly differently the second time makes the score meaningless
as a sort key and makes the tests untestable.

**Two signals, neither sufficient.** The provider's `jobType` and the job title
disagree often enough to be interesting. The counts below are the measurement
the rules were built from, over the active table on 2026-09-15 (the table has
since grown; the proportions have not moved):

| | rows |
| --- | --- |
| `job_type = 'internship'` | 956 |
| whole-word title match (`intern`/`trainee`/`apprentice`/`co-op`) | 913 |
| both | 875 |
| **jobType only, no title match** | **81** |

Those 81 are the whole problem in miniature. Some are genuine: Lever's
`commitment`, Ashby's `employmentType` and JSearch's `job_employment_type`
carry "Intern" for titles that do not, like "Software engineering internAI
India". But **64 of the 81 are a substring bug**: the old `inferJobType` used
`title.includes("intern")`, which matched *Internal* Audit Manager and
*International* Voice Process. The provider's jobType was not a second opinion;
it was that bug echoing back.

So: every title regex is word-bounded, and a provider `jobType` of
`internship` is ignored when the title's only "intern" is inside
`internal` / `international` / `internet`, with a signal saying so.

**The rules, in priority order.** Order is the design:

1. A whole-word `intern`/`trainee`/`apprentice`/`co-op` **title** →
   `internship`, even when the title also says Senior. "Senior Software
   Engineer Intern" is an internship at a company that has senior engineers.
2. Seniority, roman level II+, role level 2+, or `experienceMin ≥ 2` →
   `not_relevant`, score 0.
3. Untainted provider `jobType: internship` → `internship`.
4. New-grad markers in the title → `new_grad`. Markers in the *description*
   count too, but only when the title names an engineering role; otherwise
   "Office Maid, freshers welcome" becomes a new-grad SDE opening.
5. No seniority, ≤ 2 years or unstated, engineering role noun → `early_career`.
6. Everything else → `not_relevant`.

**The scoring modifiers that were added to the spec.** The spec's modifiers
(`isIndia +10`, `isRemote +5`, batch match `+10`, deadline `+5`, fresh `+10`,
old `−20`, batch mismatch `−40`) produce a table where "International Process
Associate" internships and a Maryland SDE internship both tie an India SDE
internship at the 100 cap. Three more were added because the ranking has to
survive the real data: no engineering role noun in the title `−15`, an
explicitly non-technical title `−20`, and an on-site posting scoped outside
India `−25`. `isIndia: null` is never penalised; unknown stays reviewable.

**Batch text is usually inclusive of the user, and naive parsing gets this
badly wrong.** The `−40` batch-mismatch penalty fired on 71 live rows. Reading
them one by one:

- *"2026 freshers & final-year students"* names 2026 but is addressed to
  whoever is in their final year **now**, which in September 2026 is the 2027
  batch. `final-year student` is therefore `+15`, above a generic match,
  anchored to the academic calendar (June–May).
- *"2025 or later"*, *"2025 onwards"*, *"2025+"* is an open-ended lower bound,
  not a single year.
- *"2025-2028"* is a range covering every year in it, not just the ends.
- *"pursuing"* means current students are welcome, so a named year stops
  penalising, **unless** the year carries "only" (*"2026 Graduates Only"*),
  where an explicit restriction beats boilerplate.
- *"© 2026 Dlytica"*, *"Top Employer 2026"*, *"Named a 2025 Gartner Magic
  Quadrant"* and *"Walk-in interview on 24th Aug 2026"* are **not batch years
  at all**, and all four were sitting in the `−40` bucket. A year now only
  counts as a batch when something batch-shaped appears within 60 characters,
  and calendar-date context disqualifies it outright.

Every modifier that fires is named in `relevanceSignals`, which is what the
Jobs page shows on hover. The score is never a black box.

**The test strategy** is the reason any of that is safe to change.
`classifier.test.ts` is ~750 lines and none of it mocks anything, because there
is nothing to mock: the classifier is a pure function. The suite is built
around four ideas:

1. **Every rule has a test that fails if the priority order changes.** The
   canonical one is `"Senior Software Engineer Intern" → internship`: it exists
   specifically to break if someone "fixes" the seniority rule to run first.
2. **Every bug found in live data became a case, quoted verbatim.** "Internal
   Audit Manager", "International Voice Process", "© 2026 Dlytica", "Walk in
   interview on 24th Aug 2026", "2026 freshers & final-year student". The
   regression suite *is* the list of things the live table taught us.
3. **Scores are asserted as component arithmetic, not as magic totals.** Tests
   assert which signals fired and that the modifiers sum correctly, so adding a
   modifier does not require rewriting forty expected numbers. A suite that is
   painful to update is a suite that gets weakened.
4. **The clock is injected.** `now` is a parameter, so the recency modifiers
   and the final-year-batch calendar are tested at fixed instants instead of
   being quietly time-dependent.

Beyond the unit suite, `e2e/relevance.spec.ts` drives the real filters in a
browser against real rows, so a classifier change that breaks the Jobs page's
relevance filter fails before it merges.

</details>

### Decision 2: the location normalizer, and why `jobs.country` is unreliable

**`artifacts/api-server/src/relevance/location.ts`**

- The `jobs.country` column has a schema default, so "provider said India" and "provider said nothing" look identical; the normalizer never reads it.
- Location strings are parsed per provider shape, with districts and ambiguous state codes (`TN`) resolved in a second pass.
- A string it cannot place becomes `isIndia: null`, never `false`, so unfamiliar formats stay visible instead of silently disappearing.

<details>
<summary>The full reasoning</summary>

There is a `country` column on `jobs`. The normalizer refuses to read it. That
is worth explaining, because "use the column that already holds the answer" is
the obvious move.

**Why the column cannot be trusted.** Two independent failures:

1. **It has a schema default.** When a provider omits the field, the default
   applies, so every RemoteOK row reads `'India'`, including the ones for
   Toronto and Austin. The column does not distinguish "the provider said
   India" from "the provider said nothing".
2. **Providers that do populate it disagree about format.** SmartRecruiters
   writes lowercase ISO-2. Others write full names. Some write a region.

A column that is *confidently wrong* is worse than one that is empty, because
nothing downstream can tell the two apart. So the only country input the
normalizer accepts is `providerCountry`: the value **this** provider emitted
for **this** job in **this** run, passed in explicitly. The backfill passes
nothing at all, and re-derives everything from the location string.

**What the location string actually looks like** (sampled live, 2026-09-14):

| Provider | Shapes seen |
| --- | --- |
| Adzuna (largest source) | `India` (31%, bare country), `Bangalore, Karnataka`, `Noida, Ghaziabad`, `Palwal, Faridabad`, `Kochi, Ernakulam`, `Devanahalli, Bangalore Rural` |
| SmartRecruiters | `Mumbai, MH`, `New Delhi, DL`, `TG`, `Nassau, ` |
| RemoteOK | `Worldwide`, `Toronto, `, `Remote - US`, `Orem, UT`, `Austin, Austin, Texas, United States`, Arabic script |
| Remotive | `LATAM, Europe, USA, Canada, APAC` |
| Lever | `allLocations` joined, e.g. `Bengaluru, Pune` |

Two consequences fall out of that table. The second token is frequently a
**district**, not a state (`Noida, Ghaziabad`, `Kochi, Ernakulam`), so
districts get their own lookup table rather than being fed to the state
matcher. And `TN` is Tamil Nadu unless the surrounding string has already
established the US, where it is Tennessee, so state abbreviations are resolved
after a first pass over unambiguous tokens rather than in isolation.

**Rule 6 is the one that matters.** A string the module cannot place gets
`isIndia: null`, **never `false`**. `false` is reserved for strings that
actively name somewhere else. 282 active rows sat in that bucket on
2026-09-16, and they stay visible under "Unknown location" so they can be
reviewed by hand. The alternative, defaulting unknown to "not India", silently
deletes exactly the postings whose location format nobody has seen before,
which is the set most likely to contain something new and worth applying to.

Tested the same way as the classifier: pure function, ~670 lines of cases, each
malformed string above quoted verbatim from the source that produced it, plus
`e2e/location.spec.ts` driving the real location filters in a browser.

</details>

### Decision 3: the queue's day-seeded rotation

**`artifacts/api-server/src/queue/priority.ts`**

- On 2026-09-15 the top ten all scored an identical 63.00: relevance saturates at 100 and the deadline component is inert because sources publish no deadlines.
- Ties fell through to `posted_date`, so the same ten rows came back at every horizon tested (1 to 14 days ahead); the rest of the tie was unreachable.
- A per-day `md5(job id, user's local day)` tie-break rotates tied rows daily, stays stable within a day, and needs no stored state.

<details>
<summary>The full reasoning</summary>

The queue looked fine and was quietly broken, and the measurement that showed
it is the most useful thing in this repository.

**The four components produce a real spread, and almost none at the top.**
Measured on 2026-09-15, across 1,549 eligible rows, there were 163 distinct
priority values. But every one of the top ten scored an **identical 63.00**,
and fifteen rows tied there. Pulling the components apart explains why:

| Component | Weight | What it actually did |
| --- | --- | --- |
| `relevanceScore` | 0.40 | **Saturated.** 620 of those 1,549 rows scored exactly 100, where the modifiers cap (719 of 2,109 on 2026-09-16). Inside that band it contributes an identical 40.0 to every row and separates nothing. |
| `deadlineUrgency` | 0.30 | **Inert.** `deadline` was populated on **13 rows of 4,995** and on **zero** fresher-eligible ones (2026-09-16), because the ATS and aggregator APIs in use do not publish application deadlines. Every row scores the spec's "10 if none", a constant 3.0. |
| `freshness` | 0.20 | The only component separating inside the saturated band, and it does so genuinely. |
| `dreamCompanyBoost` | 0.10 | Zero until the user bookmarks something. |

**Engineering note: an inert component should be visibly inert.** The
deadline component is kept, weighted exactly as specified, because it starts
doing real work the moment a provider with deadlines or a manual capture
lands. A component that looks like it is working but is not is worse than one
that is visibly idle. The first version said so on every row, in an engine
reason string ("No deadline published by the source: every row scores the
same 10 here"). That was honest but read as noise to a student, so the
explanation moved: a row now gets a closing-date reason only when it has a
real date (*Closes tomorrow*), and "How is this ranked?" says once, in plain
words, that most sources publish no closing date, so that part is often the
same for every role.

**The part that was actually broken.** With the spec's ordering alone, a tie
falls through to `posted_date DESC, id`. That is not a tie-break, it is a
freeze, because **freshness is a monotone function of `posted_date`**. It can
never *reorder* two rows; it can only scale the gap between them. Whatever is
newest today was newest yesterday and will be newest tomorrow.

Running the real query against the live table with the clock advanced 1, 2, 3,
5, 7 and 14 days returned **the same ten rows every time. 100% overlap at every
horizon.** The ranking contributed exactly zero turnover.

Ingestion does refresh the head in practice (30 to 70 eligible rows arrive a
day), but the consequence stands: of the 620 rows sitting at relevance 100,
the **~610 that were not currently the newest were unreachable forever**,
despite being exactly as relevant as the ten being shown. The app was asking
its one user to apply to the same ten jobs until they aged out.

**The fix is a deterministic per-day shuffle inserted *between*
`priority DESC` and `posted_date DESC, id`:**

```sql
ORDER BY priority DESC,
         md5(jobs.id::text || :queueDay),   -- ← the rotation
         posted_date DESC NULLS LAST,
         id
```

It is a **tie-break, not a reordering**. It can only ever change the relative
order of rows whose priority is byte-identical, so the specified ranking is
preserved exactly: a row at 63.00 can never jump one at 63.01. Seeded by
`(job id, queue day)` so that:

- **within a day the queue is stable**: refreshing returns the same ten, which
  the spec requires ("dismissing removes it and it does not return");
- **across days the tied block rotates**, so the long tail becomes reachable;
- **it needs no stored state**, which matters on an instance that restarts
  whenever it spins down.

The day boundary is the **user's** day, not UTC. Seeded on the UTC date, the
shuffle would change at 05:30 every morning in `Asia/Kolkata` (the middle of
the hour someone actually works through), replacing the ten rows they were
partway through applying to. On the local date it changes at local midnight.

`md5` is used as a cheap stable hash available in both Postgres and Node with
no extension, and `daily-queue.test.ts` asserts that Postgres's `md5()` and
Node's agree for the same input: the same lockstep check that keeps the SQL
and TypeScript versions of the priority formula from drifting apart.

</details>

---

## Architecture

```
provider → normalizer → location → classifier → dedup → upsert
                                                           │
                       staleness sweep ←───────────────────┘
                              │
                       queue ranking → GET /api/dashboard/today
```

The full walkthrough (each stage, what it guards against, and the request
path, testing and deployment model) is in
[**docs/architecture.md**](docs/architecture.md).

Two invariants worth stating here because they shape everything else:

- **The API contract is generated, never hand-written.**
  `lib/api-spec/openapi.yaml` → orval → Zod validators + React Query hooks.
  A new endpoint goes into the YAML first; nothing under `generated/` is edited.
- **Schema changes are additive only and ship separately from code.** Render
  deploys the app and API on merge; nothing deploys schema. A boot-time drift
  check compares every declared column against `information_schema` and turns
  `/api/health` **503** with the exact missing columns if a migration has not
  landed, because twice the code reached production before its columns did
  and every `/api/jobs` request 500'd behind a green health check.

### Health

The API runs on Render; the GitHub Actions sync workflow checks this endpoint
before it triggers a sync.

```bash
curl -s 'https://careerradar-34ec.onrender.com/api/health'
# {"ok":true,"status":"running","schema":"ok"}

curl -s 'https://careerradar-34ec.onrender.com/api/health?detail=1' | jq .sync
# {
#   "status": "ok",
#   "lastSyncAt": "2026-09-16T05:35:24.730Z",
#   "lastRunAt": "2026-09-16T05:36:21.624Z",
#   "lastSyncAgeSeconds": 2136,
#   "fresh": true,
#   "staleAfterSeconds": 43200,
#   "scheduler": { "enabled": true, "intervalMs": 21600000, "running": false,
#                  "runsThisProcess": 0, "lastRunAt": null, "nextRunAt": null },
#   "providers": [
#     { "name": "adzuna", "displayName": "Adzuna India", "state": "ok",
#       "configuredCompanies": 1,
#       "lastRunAt": "2026-09-16T05:35:24.730Z",
#       "lastSuccessAt": "2026-09-16T05:35:24.730Z",
#       "runs24h": 4, "failures24h": 0,
#       "jobsInserted24h": 37, "jobsUpdated24h": 112, "lastError": null },
#     ...
#   ]
# }

# The default body is unchanged and stays cheap: 2.8 ms against a warm local
# server, versus 35 ms with ?detail=1, which is why detail is opt-in.
```

`?detail=1` reads `provider_sync_logs`, not in-memory counters. On a free
instance that spins down after 15 idle minutes, the process answering a health
check is usually one that booted seconds ago, and its in-memory metrics read
zero for a service that is syncing perfectly well. Per-provider `state` is one
of `ok`, `stale`, `failing`, `never_run` or `disabled`.

---

## What this does not do

`internshala/provider.ts`, `unstop/provider.ts` and `wellfound/provider.ts` are
**deliberate no-op stubs that return `[]`**. Those sites' Terms of Service and
`robots.txt` prohibit automated extraction, so there is no scraper, no headless
browser and no proxy fetch, for them or for LinkedIn or Naukri. The paste-based
capture feature exists because it is the legitimate way to get a posting from a
site that does not want to be crawled: you open it yourself, you copy it, the
app parses what you pasted and fetches nothing.

---

## What I'd do next

In rough order of how much they would change the daily experience:

1. **Repair the ingest identity so duplicates never land.** The queue collapses
   them at read time by `(company, normalised title)`, which is the safe half of
   the fix. The cause is that Adzuna's `source_url` carries a per-response
   session token, so `sourcePlatform + sourceUrl` is different on every sync for
   the same advert: six rows, six URLs, one job. Hashing the stable ad id out
   of the URL fixes it at the source, but it rewrites the upsert identity for
   every existing row, so it needs a careful backfill rather than a one-line
   change.
2. **Get real deadlines into the table.** 13 rows out of 4,995 had one on
   2026-09-16, which makes a 30%-weighted component inert and means "closing
   soon" can only ever describe a handful of postings. Career-page scraping is
   out on ToS grounds; the realistic paths are providers that do publish
   deadlines and the paste-capture flow, which already parses "Apply by 30 Nov
   2026".
3. **A relevance score with more resolution at the top.** 719 of 2,109
   eligible rows tied at exactly 100 on 2026-09-16, and the rotation exists to
   work around that. Skill overlap against the profile would break the tie on
   something meaningful rather than on a hash. The AI matching service already
   computes exactly this and stores it in `job_match_scores`, so folding it in
   as a small, optional modifier is now a read rather than a request.
4. **Email digests.** The notification bell only works if you open the app;
   the whole point is the days you do not.
5. **A production Clerk instance.** The live deployment runs on a development
   instance, which has a user cap and needs DNS on a domain an `onrender.com`
   subdomain cannot provide. Fine for one user and the demo, a hard stop for
   opening sign-ups. The runbook is [docs/DEPLOY.md](docs/DEPLOY.md).

---

## License

MIT © [Udit Singh Chauhan](https://github.com/UditSinghChauhan)
