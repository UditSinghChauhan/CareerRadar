# Adding a New Source to CareerRadar

This guide explains how to onboard a new company's job feed into CareerRadar without modifying any provider or scheduler code.

---

## How sources work

Each **source** is one `(company, provider)` pair — e.g. Postman on Greenhouse, or Meesho on Lever. The system has two config files that together define every source:

| File | Purpose |
|---|---|
| `artifacts/api-server/src/providers/catalog.ts` | Master directory of every company tracked. Add here to make the company discoverable. |
| `artifacts/api-server/src/providers/config.ts` | Controls which sources are actively fetched. Set `enabled: true` here to turn on live sync. |

The scheduler reads `config.ts` automatically. No other code changes are required.

---

## Step 1 — Identify the ATS from the careers page

Open the company's careers page and look at the URL. The subdomain or path tells you which ATS they use:

| URL pattern | Provider | `providerName` |
|---|---|---|
| `boards.greenhouse.io/<token>` | Greenhouse | `"greenhouse"` |
| `jobs.lever.co/<slug>` | Lever | `"lever"` |
| `jobs.ashbyhq.com/<org>` | Ashby | `"ashby"` ⚠️ |
| `careers.smartrecruiters.com/<id>` | SmartRecruiters | `"smartrecruiters"` |
| `<company>.wd1.myworkdayjobs.com` | Workday | `"workday"` ⚠️ |
| anything else | Custom / Unknown | not yet supported |

> **⚠️ Ashby** — API has returned HTTP 401 from non-browser environments since 2025-06-27.
> **⚠️ Workday** — CXS endpoint requires browser session cookies. Both are disabled pending a public API.

---

## Step 2 — Verify the public API endpoint

Run a quick `curl` before touching any config:

```bash
# Greenhouse
curl -s "https://boards-api.greenhouse.io/v1/boards/<token>/jobs" | head -c 300

# Lever
curl -s "https://api.lever.co/v0/postings/<slug>?mode=json&limit=1" | head -c 300

# SmartRecruiters
curl -s "https://api.smartrecruiters.com/v1/companies/<CompanyId>/postings?limit=1" | head -c 300
```

**What to look for:**

- `{"jobs":[...]}` or `[{...}]` — working, proceed.
- `{"message":"Job not found"}` or HTTP 404 — slug/token is wrong or company migrated ATS.
- HTTP 401 — endpoint requires authentication; do not enable.
- `{"total":0,"content":[]}` — working endpoint but 0 open roles; still add to catalog, enable when they hire.

Note the number of jobs returned — you'll include this in the verification note.

---

## Step 3 — Add the company to `catalog.ts`

Open `artifacts/api-server/src/providers/catalog.ts` and append an entry to `COMPANY_CATALOG`:

```typescript
{
  slug: "acme",                             // must match companiesTable.slug in DB
  name: "Acme Corp",
  provider: "greenhouse",                   // from Step 1
  providerId: "acmecorp",                   // the token/slug you verified in Step 2
  careerUrl: "https://boards.greenhouse.io/acmecorp",
  industry: "Technology",
  hiringCategory: "both",                   // "fresher" | "experienced" | "both"
  expectedRoles: ["Software Engineer", "Data Engineer"],
  country: "India",
  isActive: true,
  verificationStatus: "verified",           // "verified" | "unverified" | "disabled"
  note: "Verified YYYY-MM-DD — N jobs live on boards-api.greenhouse.io/acmecorp",
},
```

---

## Step 4 — Add the source to `config.ts`

Open `artifacts/api-server/src/providers/config.ts` and add an entry under the appropriate provider section:

```typescript
{
  // VERIFIED YYYY-MM-DD: N jobs returned.
  companySlug: "acme",              // must match catalog.ts slug and DB companies.slug
  providerName: "greenhouse",
  providerId: "acmecorp",           // the ATS-specific token/slug
  enabled: true,
  note: "Verified YYYY-MM-DD — N jobs live on boards-api.greenhouse.io/acmecorp",
},
```

To add a source in **monitoring mode** (watch it, don't sync yet), set `enabled: false`. This makes it visible in `GET /api/sources` without triggering fetches.

---

## Step 5 — Add the company to the database

The normalizer matches fetched jobs to companies by `slug`. If the company isn't in the DB, all jobs are dropped with a `WARN` log.

**Option A — Run the seed script** (if you added the company to `seed.ts`):
```bash
pnpm --filter @workspace/api-server run seed
```

**Option B — Insert directly** (fastest for a single company):
```bash
cd artifacts/api-server
npx tsx --tsconfig tsconfig.json - << 'EOF'
import { db, companiesTable } from "@workspace/db";
await db.insert(companiesTable).values({
  name: "Acme Corp",
  slug: "acme",
  website: "https://acme.com",
  industry: "Technology",
  size: "medium",
  type: "product",
}).onConflictDoNothing();
console.log("Done");
process.exit(0);
EOF
```

Also add the company to `artifacts/api-server/src/seed/seed.ts` so it survives a full re-seed.

---

## Step 6 — Restart the server

```bash
# The scheduler runs automatically on startup with runOnStart: true
# Just restart the API Server workflow.
```

Or trigger a manual sync without restarting:
```bash
curl -X POST http://localhost:8080/api/sync/provider/greenhouse/company/acme
```

---

## Step 7 — Verify ingestion

```bash
# Check the source appeared in the registry
curl http://localhost:8080/api/sources/greenhouse:acme

# Check the health report
curl http://localhost:8080/api/sources/health

# Check sync status
curl http://localhost:8080/api/sync/status
```

A successful result looks like:
```json
{
  "id": "greenhouse:acme",
  "status": "active",
  "jobsInDb": 42,
  "jobsImported": 42,
  "lastSync": "2025-06-27T18:27:16.000Z"
}
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `status: "pending"` | Scheduler hasn't run yet | Trigger `POST /api/sync/all` or restart server |
| `status: "failing"` | Last sync returned an error | Check `lastError` field; re-verify endpoint with `curl` |
| Jobs fetched but `jobsInDb: 0` | Company slug not in DB | Complete Step 5 |
| `WARN: Skipping job — companySlug not found in DB` | Same as above | Complete Step 5 |
| `status: "broken"` | Endpoint returns 404 | Company may have migrated ATS; re-check careers page |
| `status: "auth-required"` | Endpoint returns 401 | Provider requires auth; wait for public API or skip |
| Endpoint works but `total: 0` | No open roles right now | Set `enabled: false`; re-enable when hiring |

---

## Supported providers summary

| Provider | Status | Notes |
|---|---|---|
| **Greenhouse** | ✅ Working | Most reliable. Free public API. |
| **Lever** | ✅ Working | Free public API. Slug = company name (usually). |
| **SmartRecruiters** | ⚠️ Variable | Public API works; many companies post 0 jobs. |
| **Ashby** | ❌ Auth required | API returns HTTP 401 as of 2025-06-27. Monitor for changes. |
| **Workday** | ❌ No public API | CXS endpoint requires browser session cookies. Monitor for changes. |

---

## Quick reference — ATS detection cheat sheet

```
careers page URL                          → provider + providerId
──────────────────────────────────────────────────────────────────
boards.greenhouse.io/acmecorp             → greenhouse, acmecorp
jobs.lever.co/acmecorp                    → lever,      acmecorp
jobs.ashbyhq.com/acme                     → ashby,      acme       (auth required)
careers.smartrecruiters.com/AcmeCorp      → smartrecruiters, AcmeCorp
acme.wd3.myworkdayjobs.com/careers        → workday,    acme       (no public API)
```
