---
name: Gemini model names and free-tier quota (Phase 8)
description: Why the Gemini model name is a single shared constant, how the free-tier limits were measured rather than looked up, and how a 429 must be classified.
---

## The model name is a moving target, and a stale one fails silently

Until Phase 8 this repo called `gemini-2.0-flash` from two places —
`services/ai-matching.service.ts` and `capture/gemini-extract.ts`. Measured live on
2026-09-16 against the project's own key, that model no longer exists:

```
404 "This model models/gemini-2.5-flash is no longer available to new users.
     Please update your code to use models/gemini-3.6-flash"
```

Every 2.x and 2.5 name 404s for a key created after the cutover. Both call sites wrap the
SDK in a `try/catch` that returns `null` on failure, so a retired model does not look like
an outage — it looks **exactly like "no API key configured"**, which is also a legitimate
state in this project. Both features had been dead for an unknown length of time and
nothing said so.

Consequences, both load-bearing:

1. **One constant.** `GEMINI_MODEL` is exported from `ai-matching.service.ts` and imported
   by the capture extractor. Never re-declare a model name in a second file — that
   duplication is why `gemini-2.0-flash` survived in one place after being changed in
   another would have been noticed.
2. **Never claim a provider works from a comment or an older note.** List
   `GET https://generativelanguage.googleapis.com/v1beta/models?key=...` and make one real
   `generateContent` call before trusting any model name.

## The limits were measured off a real 429, because they are no longer published

`ai.google.dev/gemini-api/docs/rate-limits` no longer carries per-model free-tier tables; it
points at a Google AI Studio dashboard that needs an interactive login. The measurable path
is to burst the API until it refuses and read the `QuotaFailure` detail out of the body:

| model | quota id | limit | latency | tokens per scoring call |
| --- | --- | --- | --- | --- |
| `gemini-3.5-flash-lite` | `GenerateRequestsPerMinutePerProjectPerModel-FreeTier` | **15 / min** | ~3.2 s | 539 in + 138 out |
| `gemini-3.6-flash` | same id | **5 / min** | 6–27 s | plus ~100 thinking tokens |

flash-lite is the right default for batch work: three times the per-minute headroom, a fifth
of the latency, and no thinking-token overhead on a task whose whole output is a small JSON
object. It also honours `responseMimeType: "application/json"`, so the reply needs no fence
stripping.

The **per-day** allowance could not be measured — the only way to observe it is to exhaust
it, which spends the owner's quota for the day to learn a number. So no design may depend on
knowing it. What exists instead: pacing to 80% of the measured per-minute figure, a
`AI_DAILY_BUDGET` ceiling counted from `job_match_scores.computed_at` (a counter in memory is
useless on a service that spins down every 15 minutes), and a run that stops rather than
retries when the day is refused.

## Classify a 429 by its quota id, never by its message

`asQuotaError()` reads `err.errorDetails` for the `QuotaFailure` violation and the
`RetryInfo` delay. `PerMinute` is transient — wait the server's own delay and retry.
`PerDay`, or a 429 that names no quota at all, is a full stop: retrying is waste and keeps a
batch issuing requests that cannot succeed. This is the Phase 5 JSearch lesson in a second
form — a per-run cap cannot protect a per-day quota, and the real lever is how often the job
runs.

`asQuotaError()` must stay **idempotent**. `generateMatchScore` converts the SDK error before
rethrowing, so by the time a caller's catch block sees it there is no `.status` property left
to match on. Without the `instanceof` short-circuit at the top, the batch scorer classifies
every real quota refusal as an ordinary failure and keeps spending.
