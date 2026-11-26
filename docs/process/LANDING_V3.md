# Landing v3: "Field to focus"

The third landing page, 2026-11-03. This file records the reference study, the problems it fixes and how each was checked. The visual rules themselves live in `DESIGN.md`.

## Reference: lightspark.com

Studied at 1440×900 and 390×844, scrolled top to bottom with the cookie banner dismissed (screenshots kept out of the repository: they are someone else's brand). Measured page height: 6,922px at 1440, 9,259px at 390. Techniques borrowed, never the brand, copy or assets:

- **A cool off-white canvas.** The page ground is a near-white with a grey-green cast, not paper cream and not pure white, so white cards read as raised without a heavy shadow.
- **A centred headline in a field of floating product cards at different depths.** Cards far away are smaller and blurred; near ones are sharp. The headline zone stays clear; the cards frame it.
- **Statements in two tones.** A paragraph set large whose first sentence is ink and the rest grey, so the eye reads the claim first and the detail second.
- **A stats band of tall hairline-ruled columns.** A small label at the top, the big number at the bottom, an "01–04" index, and nothing else.
- **Medium-weight Swiss type.** Headlines at regular-to-medium weight with tight tracking, never bold; small text in a mono for labels.
- **Generous, quiet spacing.** Few elements per screen, wide gutters, no decoration between sections.

From apple.com, pacing only: one idea per screen, the product shown large, short copy under big type, and a quick rhythm with no long holds.

Deliberately not used, so CareerRadar does not look like the owner's other product (Bridge): bydefault-style rails, "+" marks, a hero card, and a floating pill navigation.

## What was wrong (verified on 2026-11-03)

| Finding | Evidence |
|---|---|
| App logo was a briefcase; landing used the radar rings | `components/layout.tsx` imported lucide `Briefcase` for the logo, three places |
| App used Geologica; landing used Geist | `index.css` `--app-font-sans`; Google Fonts link in `index.html` |
| Queue rows spoke engine | `priority.ts` `explainPriority`: "Relevance 100/100 — top of the classifier's band, shared with hundreds of others, so the terms below decide the order" (`before/dashboard-1440.png`) |
| Fake macOS window dots | the old `showcase.tsx` browser frame |
| Three different totals on one page | hero 6,034 / 3,119 (live); illustrative queue header "1840 distinct roles… 269 duplicate listings collapsed"; dashboard capture "38 distinct roles" |
| Too long | 12,191px at 1440 and 12,853px at 390 (`before/heights.json`); the pinned chapter alone was about 3,600px |
| Radar shown full-size twice | hero, then chapter beat 1 |
| Lime glow on everything | buttons, tile borders, bars, kanban, hero light |
| Engine-first copy | "including the term that is not helping", "963 backend tests passing", "No model decides what you see", "never scraped", a "Design notes" link in the nav |
| Empty visuals | the reminders tile had no visual; the kanban tile was mostly ghost columns |
| Scores in two formats | "73" and "73.0" |
| Mobile radar | shrank to a cluster, ring labels stacked, a plain-text "Pause the sweep" under it |

## What changed

See the pull request for the full list. In short: Part A makes the app match (one logo, one typeface, human reasons, whole-number scores, one source of totals, the light theme on the landing's tokens); Part B deletes the old chapters and `/design-notes` (content moved to `docs/CASE_STUDY.md`); Part C builds the seven light sections.

## Measured

| | Before | After |
|---|---|---|
| Page height at 1440 | 12,191px | 6,439px |
| Page height at 768 | not measured | 7,082px |
| Page height at 390 | 12,853px | 7,579px |
| Lighthouse mobile (local production build) | 81 / 100 / 100 / 100 (`docs/screenshots/revamp/lighthouse-mobile.json`) | 92 / 100 / 96 / 100 |
| CLS (Lighthouse) | 0.018 | 0.001 |

Notes on the Lighthouse run: it was taken against `vite preview` of the production build on this machine, with a placeholder Clerk key, so clerk-js fails to load and logs console errors; that is the whole best-practices deduction and does not happen in production. Performance is held at 92 by first contentful paint (2.5s simulated): the landing still preloads the app's shared vendor chunks (React, Clerk, Radix, TanStack Query) before its stylesheet is used. That predates this change; splitting Clerk and Query out of the landing's first load is the next step to reach 95.

Frame rate was not measured with a profiler. Everything that moves on scroll is transform or opacity on three layer elements, the idle loops are CSS transforms, and the radar canvas redraws at 30fps only while it is on screen.

Contrast pairs: `node docs/screenshots/landing-v3/contrast.mjs` (all pass).

Screenshots: `docs/screenshots/landing-v3/before/` and `after/`, captured by `scripts/capture-landing-v3.mjs`. The landing captures are of the live site (before) and of the local production build against the local demo database (after), which is why the after stats read 63 and 53 with "Live": those are the demo database's counts, read from the same `/api/public/stats`.
