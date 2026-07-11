---
name: CareerRadar aggregator provider pattern
description: How multi-company job aggregator providers (RemoteOK, Remotive, Adzuna, JSearch) resolve companies, and why normalize() is async.
---

Single-company providers (Greenhouse, Lever, ...) map 1 config row → 1 pre-seeded `companySlug`.
Aggregator providers (RemoteOK, Remotive, Adzuna, JSearch) pull jobs from many real employers
under one synthetic config `companySlug` (e.g. `__remoteok__`). That synthetic slug is only used
for scheduler logging/sync-log rows — each individual `ProviderJob` must carry its OWN
`companySlug` (slugified real employer name) and `companyName` (display name).

`JobNormalizer.normalize()` was made async so it can auto-create a `companies` row on the fly when
`companySlug` isn't already in the DB but `companyName` is present (via `onConflictDoNothing` +
fallback select, with in-flight de-duplication per slug to avoid races within a batch). Providers
that omit `companyName` keep the old behavior: unknown slug → job is skipped with a warning.

**Why:** aggregator jobs span hundreds of employers never manually added to the `companies` table;
without auto-creation, `normalize()`'s "skip unknown companySlug" rule would silently drop 100% of
aggregator jobs.

**How to apply:** any new aggregator-style provider must set `companySlug: slugify(employerName)`
and `companyName: employerName` on every `ProviderJob` it returns. Scheduler call sites
(`scheduler.ts`) now `await` normalize sequentially per batch — don't revert to a sync `.map`.
