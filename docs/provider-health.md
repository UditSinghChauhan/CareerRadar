# Provider health audit

Generated **2026-09-14** by `pnpm --filter @workspace/api-server run verify:providers`.

Every row below is a live HTTP request that was actually issued and whose response was actually read.
Rows marked 🚫 or 🔑 were **not** requested, and the reason is stated — no status is inferred for them.

## Totals

| Verdict | Configs |
| --- | ---: |
| ✅ live | 41 |
| ⚪ empty | 3 |
| ❔ indeterminate | 7 |
| ❌ 404 | 39 |
| 🚫 no public API | 3 |
| 🔑 no credential here | 2 |
| **Total configs** | **95** |

Postings discoverable across all probed endpoints: **5587**.

## Results by provider

### adzuna

| Company slug | Enabled | HTTP | Jobs | Verdict | Detail |
| --- | :---: | ---: | ---: | --- | --- |
| `__adzuna__` | yes | — | — | 🔑 no credential here | ADZUNA_APP_ID / ADZUNA_APP_KEY are not set in this environment — no request was made, and no status is claimed. |

### arbeitnow

| Company slug | Enabled | HTTP | Jobs | Verdict | Detail |
| --- | :---: | ---: | ---: | --- | --- |
| `__arbeitnow__` | no | 200 | 250 | ✅ live | — |

### ashby

| Company slug | Enabled | HTTP | Jobs | Verdict | Detail |
| --- | :---: | ---: | ---: | --- | --- |
| `tekion` | yes | 200 | 110 | ✅ live | — |
| `atlan` | yes | 200 | 8 | ✅ live | — |
| `skyflow` | yes | 200 | 11 | ✅ live | — |
| `linear` | no | 200 | 30 | ✅ live | — |
| `posthog` | no | 200 | 11 | ✅ live | — |
| `ycombinator` | no | 200 | 8 | ✅ live | — |
| `vercel` | no | 200 | 0 | ⚪ empty | — |
| `retool` | no | 404 | — | ❌ 404 | — |
| `cal` | no | 404 | — | ❌ 404 | — |
| `hasura` | no | 404 | — | ❌ 404 | — |
| `chargebee` | no | 404 | — | ❌ 404 | — |
| `darwinbox` | no | 404 | — | ❌ 404 | — |
| `setu` | no | 404 | — | ❌ 404 | — |
| `dukaan` | no | 404 | — | ❌ 404 | — |
| `leadsquared` | no | 404 | — | ❌ 404 | — |

### greenhouse

| Company slug | Enabled | HTTP | Jobs | Verdict | Detail |
| --- | :---: | ---: | ---: | --- | --- |
| `postman` | yes | 200 | 64 | ✅ live | — |
| `rubrik` | yes | 200 | 141 | ✅ live | — |
| `thoughtworks` | yes | 200 | 35 | ✅ live | — |
| `phonepe` | no | 404 | — | ❌ 404 | — |
| `groww` | yes | 200 | 7 | ✅ live | — |
| `naukri` | yes | 200 | 0 | ⚪ empty | — |
| `databricks` | yes | 200 | 891 | ✅ live | — |
| `mongodb` | yes | 200 | 405 | ✅ live | — |
| `stripe` | yes | 200 | 632 | ✅ live | — |
| `twilio` | yes | 200 | 149 | ✅ live | — |
| `elastic` | yes | 200 | 357 | ✅ live | — |
| `gitlab` | yes | 200 | 228 | ✅ live | — |
| `datadog` | yes | 200 | 446 | ✅ live | — |
| `coinbase` | yes | 200 | 218 | ✅ live | — |
| `cloudflare` | yes | 200 | 358 | ✅ live | — |
| `6sense` | yes | 200 | 30 | ✅ live | — |
| `alphasense` | yes | 200 | 221 | ✅ live | — |
| `highradius` | yes | 200 | 83 | ✅ live | — |
| `hackerrank` | yes | 200 | 29 | ✅ live | — |
| `glance` | yes | 200 | 45 | ✅ live | — |
| `druva` | yes | 200 | 41 | ✅ live | — |
| `observeai` | yes | 200 | 17 | ✅ live | — |
| `atlassian` | no | 404 | — | ❌ 404 | — |
| `adobe` | no | 404 | — | ❌ 404 | — |
| `google` | no | 404 | — | ❌ 404 | — |
| `freshworks` | no | 404 | — | ❌ 404 | — |
| `flipkart` | no | 404 | — | ❌ 404 | — |
| `browserstack` | no | 404 | — | ❌ 404 | — |
| `nutanix` | no | 404 | — | ❌ 404 | — |
| `cohesity` | no | 404 | — | ❌ 404 | — |
| `sap-labs` | no | 404 | — | ❌ 404 | — |
| `vmware` | no | 404 | — | ❌ 404 | — |
| `publicis-sapient` | no | 404 | — | ❌ 404 | — |
| `cloudera` | no | 404 | — | ❌ 404 | — |
| `informatica` | no | 404 | — | ❌ 404 | — |
| `veritas` | no | 404 | — | ❌ 404 | — |
| `mphasis` | no | 404 | — | ❌ 404 | — |

### jobicy

| Company slug | Enabled | HTTP | Jobs | Verdict | Detail |
| --- | :---: | ---: | ---: | --- | --- |
| `__jobicy__` | yes | 200 | 50 | ✅ live | — |

### jsearch

| Company slug | Enabled | HTTP | Jobs | Verdict | Detail |
| --- | :---: | ---: | ---: | --- | --- |
| `__jsearch__` | yes | — | — | 🔑 no credential here | JSEARCH_API_KEY is not set in this environment — no request was made, and no status is claimed. |

### lever

| Company slug | Enabled | HTTP | Jobs | Verdict | Detail |
| --- | :---: | ---: | ---: | --- | --- |
| `freshworks` | no | 200 | 0 | ⚪ empty | — |
| `meesho` | yes | 200 | 50 | ✅ live | — |
| `cred` | yes | 200 | 11 | ✅ live | — |
| `dream11` | no | 404 | — | ❌ 404 | — |
| `paytm` | yes | 200 | 210 | ✅ live | — |
| `hevodata` | yes | 200 | 46 | ✅ live | — |
| `mindtickle` | yes | 200 | 19 | ✅ live | — |
| `zeta` | yes | 200 | 18 | ✅ live | — |
| `fampay` | yes | 200 | 13 | ✅ live | — |
| `epifi` | yes | 200 | 11 | ✅ live | — |
| `100ms` | yes | 200 | 9 | ✅ live | — |
| `razorpay` | no | 404 | — | ❌ 404 | — |
| `swiggy` | no | 404 | — | ❌ 404 | — |
| `zomato` | no | 404 | — | ❌ 404 | — |
| `microsoft` | no | 404 | — | ❌ 404 | — |
| `groww` | no | 404 | — | ❌ 404 | — |
| `zepto` | no | 404 | — | ❌ 404 | — |
| `smallcase` | no | 404 | — | ❌ 404 | — |
| `slice` | no | 404 | — | ❌ 404 | — |
| `mpl` | no | 404 | — | ❌ 404 | — |
| `oyo` | no | 404 | — | ❌ 404 | — |
| `lenskart` | no | 404 | — | ❌ 404 | — |
| `niyo` | no | 404 | — | ❌ 404 | — |
| `unacademy` | no | 404 | — | ❌ 404 | — |
| `physicswallah` | no | 404 | — | ❌ 404 | — |

### remoteok

| Company slug | Enabled | HTTP | Jobs | Verdict | Detail |
| --- | :---: | ---: | ---: | --- | --- |
| `__remoteok__` | yes | 200 | 99 | ✅ live | — |

### remotive

| Company slug | Enabled | HTTP | Jobs | Verdict | Detail |
| --- | :---: | ---: | ---: | --- | --- |
| `__remotive__` | yes | 200 | 16 | ✅ live | — |

### smartrecruiters

| Company slug | Enabled | HTTP | Jobs | Verdict | Detail |
| --- | :---: | ---: | ---: | --- | --- |
| `freshworks` | yes | 200 | 139 | ✅ live | — |
| `swiggy` | yes | 200 | 71 | ✅ live | — |
| `delhivery` | yes | 200 | 0 | ❔ indeterminate | SmartRecruiters returns 200 with totalFound=0 for non-existent companies too, so this neither confirms nor refutes the board. |
| `juspay` | yes | 200 | 0 | ❔ indeterminate | SmartRecruiters returns 200 with totalFound=0 for non-existent companies too, so this neither confirms nor refutes the board. |
| `inmobi` | yes | 200 | 0 | ❔ indeterminate | SmartRecruiters returns 200 with totalFound=0 for non-existent companies too, so this neither confirms nor refutes the board. |
| `ola` | yes | 200 | 0 | ❔ indeterminate | SmartRecruiters returns 200 with totalFound=0 for non-existent companies too, so this neither confirms nor refutes the board. |
| `zs-associates` | yes | 200 | 0 | ❔ indeterminate | SmartRecruiters returns 200 with totalFound=0 for non-existent companies too, so this neither confirms nor refutes the board. |
| `kpmg-india` | yes | 200 | 0 | ❔ indeterminate | SmartRecruiters returns 200 with totalFound=0 for non-existent companies too, so this neither confirms nor refutes the board. |
| `nielsen` | yes | 200 | 0 | ❔ indeterminate | SmartRecruiters returns 200 with totalFound=0 for non-existent companies too, so this neither confirms nor refutes the board. |

### workday

| Company slug | Enabled | HTTP | Jobs | Verdict | Detail |
| --- | :---: | ---: | ---: | --- | --- |
| `atlassian` | no | — | — | 🚫 no public API | Workday CXS requires browser session cookies. Not probed: the only way to get a 200 is to replay a browser session, which is out of bounds. |
| `adobe` | no | — | — | 🚫 no public API | Workday CXS requires browser session cookies. Not probed: the only way to get a 200 is to replay a browser session, which is out of bounds. |
| `nutanix` | no | — | — | 🚫 no public API | Workday CXS requires browser session cookies. Not probed: the only way to get a 200 is to replay a browser session, which is out of bounds. |

## Disabled, but the endpoint returns postings

A live endpoint is not on its own a reason to enable a config. Several of these are
off deliberately because everything they return is scoped to a region this app's user
cannot apply from — read the note before flipping one on.

- `ashby:linear` — 30 postings
  - Board LIVE 2026-09-14 — 30 postings — but 0 survive filterCountry=India: every role is North America (19), Europe (7+2) or London (2). Enable only if Linear opens India-eligible roles.
- `ashby:posthog` — 11 postings
  - Board LIVE 2026-09-14 — 11 postings — but 0 survive filterCountry=India: all are Remote (US/EMEA/UK) or San Francisco.
- `ashby:ycombinator` — 8 postings
  - Board LIVE 2026-09-14 — 8 postings — but 0 survive filterCountry=India: all San Francisco Bay Area.
- `arbeitnow:__arbeitnow__` — 250 postings
  - Endpoint HEALTHY 2026-09-14 — HTTP 200, 250 postings/page — but 0 India matches and all 9 remote roles were Germany-based and German-language. Disabled as noise, not as breakage. Re-measure before enabling.

## Enabled but not returning a usable response

- `adzuna:__adzuna__` — 🔑 no credential here (ADZUNA_APP_ID / ADZUNA_APP_KEY are not set in this environment — no request was made, and no status is claimed.)
- `jsearch:__jsearch__` — 🔑 no credential here (JSEARCH_API_KEY is not set in this environment — no request was made, and no status is claimed.)

