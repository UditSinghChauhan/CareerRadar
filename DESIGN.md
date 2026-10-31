# DESIGN.md: CareerRadar

The visual source of truth. Change it on purpose; this file is the rule.

Scope: the landing page. The app screens keep their current tokens (`src/index.css`) until they are migrated in a separate change; see Open decisions.

## Direction

A product page in the Apple and Stripe Press manner. The chrome is neutral: white and light grey in light, near-black in dark. The only colour on the page comes from the product itself: the radar, the found roles, the score rows and the one accent action. Premium comes from restraint. Each section has one focus, the type is set exactly, and motion reveals content rather than decorating it.

The page must answer three questions in this order. What is it? (the hero, within five seconds). How does it work? (the walkthrough). Can I check it? (proof, sources, code).

## Colour

Two token sets were measured. **Neutral is chosen.** Values are OKLCH; hex values are the sRGB conversion.

### Neutral (chosen)

| Token | Light | Dark | Role |
|---|---|---|---|
| bg | `100% 0 0` #ffffff | `14.5% 0 0` #0a0a0a | page |
| surface | `97.2% 0 0` #f6f6f6 | `18.5% 0 0` #131313 | alternate section band |
| surface-2 | `94.5% 0 0` #ededed | `23% 0 0` #1d1d1d | product frame, cards, chips |
| ink | `21% 0 0` #181818 | `96.5% 0 0` #f3f3f3 | headings, body |
| ink-2 | `38% 0 0` #424242 | `83% 0 0` #c7c7c7 | supporting copy, lead |
| muted | `50.5% 0 0` #656565 | `68% 0 0` #989898 | captions, meta, labels |
| rule | `91% 0 0` #e1e1e1 | `28% 0 0` #292929 | hairlines (decorative, no contrast duty) |
| field-edge | `62% 0 0` #868686 | `55% 0 0` #717171 | secondary button and toggle edges |
| accent | `47% 0.13 138` #316b17 | `89% 0.19 126` #bcf053 | primary action fill, links, focus |
| accent-on | `100% 0 0` #ffffff | `19% 0.04 126` #0f1703 | text on the accent fill |
| signal | `52% 0.15 135` #3f7b04 | `89% 0.19 126` #bcf053 | the ten found roles on the radar, rank badges |

- **One accent per theme.** Lime is kept on dark, where it passes AA for text (14.84:1) and for focus. Lime on white is 1.33:1, so light mode uses its own deep green (6.49:1).
- **Only one accent action per viewport.** The accent fill is used for "Get started" in the hero and in the footer, and nowhere else.
- **Radar points** (postings that were not found) use `muted` at 25 to 75% opacity in both themes. Only the found roles carry `signal`.
- **The walkthrough band** uses the dark token set in both themes. In light this gives the page its one alternation between light and dark sections. In dark, the band uses `surface` with a top and bottom hairline, so the alternation is a step of surface rather than a jump.

### Contrast, measured

Ratios come from `docs/screenshots/landing-redesign/contrast.mjs`, which converts OKLCH to sRGB and applies WCAG 2.x relative luminance. Body text needs 4.5:1. Focus rings, control edges and data marks need 3:1 (WCAG 1.4.11).

**Neutral (chosen)**

| Pair | Use | Min | Light | Dark |
|---|---|---|---|---|
| ink on bg | headings, body | 4.5 | 17.72 | 17.88 |
| ink on surface | body on a band | 4.5 | 16.34 | 16.84 |
| ink on surface-2 | body in the product frame | 4.5 | 15.08 | 15.26 |
| ink-2 on bg | supporting copy | 4.5 | 10.01 | 11.72 |
| ink-2 on surface | supporting copy on a band | 4.5 | 9.23 | 11.04 |
| muted on bg | captions | 4.5 | 5.87 | 6.87 |
| muted on surface | captions on a band | 4.5 | 5.42 | 6.47 |
| muted on surface-2 | captions in the frame | 4.5 | 5.00 | 5.86 |
| accent on bg | link text | 4.5 | 6.49 | 14.84 |
| accent on surface | link text on a band | 4.5 | 5.99 | 13.97 |
| accent on surface-2 | link text in the frame | 4.5 | 5.53 | 12.66 |
| accent-on on accent | primary button label | 4.5 | 6.49 | 13.77 |
| accent on bg | focus ring, button edge | 3 | 6.49 | 14.84 |
| accent on surface-2 | focus ring in the frame | 3 | 5.53 | 12.66 |
| field-edge on bg | secondary button, toggle | 3 | 3.64 | 4.08 |
| field-edge on surface | control edge on a band | 3 | 3.36 | 3.84 |
| signal on bg | radar found role | 3 | 5.22 | 14.84 |
| signal on surface | rank badge on a band | 3 | 4.82 | 13.97 |

Every pair passes in both themes. The tightest is muted on surface-2 in light, at 5.00:1.

**Vantage (incumbent, compared)**

| Pair | Min | Light | Dark |
|---|---|---|---|
| ink on bg / surface / surface-2 | 4.5 | 16.56 / 15.63 / 14.29 | 17.31 / 16.52 / 15.30 |
| ink-2 on bg / surface | 4.5 | 10.37 / 9.79 | 11.49 / 10.97 |
| muted on bg / surface / surface-2 | 4.5 | 5.73 / 5.40 / 4.94 | 6.46 / 6.17 / 5.71 |
| accent on bg / surface / surface-2 | 4.5 | 5.96 / 5.62 / 5.15 | 14.99 / 14.32 / 13.25 |
| accent-on on accent | 4.5 | 5.97 | 13.77 |
| field-edge on bg / surface | 3 | 3.48 / 3.28 | 3.65 / 3.48 |
| **signal (lime) on bg / surface** | 3 | **1.28 / 1.21: fail** | 14.99 / 14.32 |

Vantage passes every text pair. But its lime signal fails as a data mark in light, so the radar's found roles would be invisible on a light page.

**Why Neutral.** Vantage tints every surface blue-steel (hue 230 to 235). Against that, the radar's steel points disappear into the chrome, and the page reads as one blue-grey mood. With Neutral, the radar, the found roles and the accent are the only things with hue, which is the Stripe Press rule the brief asks for. Neutral also passes every pair in both themes without exceptions.

## Type

One family: **Geist** (OFL), a single variable woff2 for the weight axis, Latin subset, 29.4 KB. It is self-hosted, loaded once, and preloaded. The fallback is `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, with a metric-adjusted `@font-face` ("Geist Fallback", `local("Arial")` plus `size-adjust`) so that swapping in Geist does not shift layout.

### Comparison

All three fonts were set in the same specimen: headline 600 at 44px (375) and 80px (1280), tracking -0.03em, body 17px. Screenshots are in `docs/screenshots/landing-redesign/phase1/`, as `type-<font>-<theme>-<width>.png` and the 375 px side-by-sides `compare-375-<theme>-hero.png` and `compare-375-<theme>-row.png`.

| | Geologica | Geist | Inter |
|---|---|---|---|
| Latin woff2, weight axis | 24.9 KB (29.3 KB as loaded today with the SHRP axis) | 29.4 KB | 48.3 KB |
| x-height / cap height (em) | 0.51 / 0.70 | 0.54 / 0.71 | 0.55 / 0.73 |
| Average lowercase width (em) | 0.544 (widest) | 0.515 (narrowest) | 0.535 |
| Headline lines at 375 / 1280 | 3 / 2 | 3 / 2 | 3 / 2 |
| 375 px score row | numbers wrap after "Freshness" | numbers wrap after "Freshness 18.6" | numbers wrap after "Freshness" |
| Tabular figures | yes | yes | yes |
| Character | soft geometric with a personality of its own | neutral grotesk, precise | neutral grotesk, the most common default |
| Fit with the radar | competes: a voiced face beside a voiced visual | recedes: the radar carries the character | recedes, but generic |

**Why Geist.** At 375 px it fits the most text per line (4% narrower than Inter and 5% narrower than Geologica). That matters on a page whose proof lives in score rows and reason sentences. Its tabular figures and neutral forms suit numbers meant to be checked. It stays out of the radar's way, which Geologica does not. Inter is 64% heavier for an x-height only 0.01 em taller. As a display face, Inter is also the most common generated look, which the previous Decisions entry already recorded.

**Risk.** Geist is Vercel's typeface and is associated with developer-tool sites. That association suits a project shown to engineers and recruiters, but it is a known one.

Not used: SF Pro (proprietary) and Geist Mono (a second family).

### Scale

| Role | Size | Weight | Tracking | Line height | Colour |
|---|---|---|---|---|---|
| display (h1) | `clamp(2.75rem, 1.6rem + 4.6vw, 5rem)` (44 to 80px) | 600 | -0.035em | 1.04 | ink |
| section (h2) | `clamp(2rem, 1.35rem + 2.6vw, 3.5rem)` (32 to 56px) | 600 | -0.03em | 1.08 | ink |
| title (h3) | `clamp(1.25rem, 1.1rem + 0.5vw, 1.5rem)` (20 to 24px) | 600 | -0.015em | 1.25 | ink |
| lead | `clamp(1.1875rem, 1.05rem + 0.6vw, 1.5rem)` (19 to 24px) | 400 | -0.01em | 1.35 | ink-2 |
| body | 1.0625rem (17px) | 400 | 0 | 1.55 | ink-2 |
| small | 0.875rem (14px) | 400 | 0 | 1.45 | muted |
| label | 0.8125rem (13px) | 500 | 0 | 1.3 | muted |

- Headings are sentence case and use `text-wrap: balance`. Body uses `text-wrap: pretty`, with a measure of 60ch at most.
- Figures use `font-variant-numeric: tabular-nums`. A unit follows its figure in `muted`.
- No tracked capitals, no monospace, no italics.

## Space

- The base unit is 4px. Tokens: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160.
- Section padding (block): 160px at 1024px and wider, 128px from 640 to 1023px, 96px under 640px.
- Containers: text 680px; content 1120px; walkthrough 1200px. Gutters are 48px at 1024 and up, 32px from 640 to 1023, and 20px under 640.
- A heading has twice as much space above it as below it.
- Widths checked: 375, 768, 1280, 1440. No horizontal scroll at any width.

## Shape and depth

- Radius: a pill (999px) for buttons and the toggle, 12px for the product frame and cards, and 6px for chips and rank badges.
- Hairlines: 1px in `rule`.
- **One shadow**, used only by the product frame, in light only: `0 1px 2px oklch(0% 0 0 / 0.04), 0 16px 40px -12px oklch(0% 0 0 / 0.14)`. In dark it resolves to `none`; the frame is separated by `surface-2` and a hairline.
- No gradients, glass panels, glows or decorative icons. The one exception is the navigation's translucency (see Components).

## Motion

| Token | Duration | Easing | Use |
|---|---|---|---|
| micro | 150ms | `cubic-bezier(0.2, 0, 0, 1)` | hover, press, focus-adjacent colour |
| short | 250ms | `cubic-bezier(0.2, 0, 0, 1)` | theme toggle icon, nav hairline |
| state | 350ms | `cubic-bezier(0.65, 0, 0.35, 1)` | walkthrough frame changing state |
| reveal | 600ms | `cubic-bezier(0.16, 1, 0.3, 1)` | a section's content entering view |

- Only `opacity` and `transform` are animated. A reveal moves 16px up (`translateY(16px)` to 0) and fades from 0 to 1. Siblings are staggered by 60ms, and no section staggers more than three items.
- A reveal runs once, when 15% of the element is in view. Content is visible without JavaScript: the hidden starting state applies only under a `js` class on `<html>`.
- `prefers-reduced-motion: reduce` turns off every reveal and transition. Content is shown in place, and the walkthrough changes state instantly. The radar shows one still frame with the ten already found, and its pause control is hidden because nothing moves.
- The radar sweep is the only continuous motion. It pauses when off screen and when the pause control is pressed.
- The reveal and state durations exceed the 150 to 250ms UI range on purpose. They pace a marketing page's scroll rather than respond to a click, and every control response stays at 150 or 250ms.

## Theme behaviour

- **Default:** follow the system (`prefers-color-scheme`).
- **Toggle:** an icon button in the navigation with a 44px hit area and a label that names the action ("Switch to dark theme"). When the user picks the theme that matches the system, the stored choice returns to `system`. This gives a way back to following the system without needing a third state.
- **Persisted:** in `localStorage` under next-themes' key `theme`. The landing page and the app share it, so a choice made on the landing page carries into the app.
- **No flash:** a blocking inline script in `<head>` sets the `dark` class on `<html>` from the stored choice or the system before first paint. `<meta name="color-scheme" content="light dark">` makes the browser's default canvas match. The landing page no longer writes its own `data-theme` onto `<html>`.
- **Focus:** a 2px `accent` ring with a 2px offset, on every interactive element, in both themes. It is never removed and appears instantly.
- **Increased contrast:** under `prefers-contrast: more`, `muted` takes `ink-2`, `field-edge` and `rule` take `ink`, and the navigation is solid.
- **Trade-off, recorded:** Apple's guideline `dark-mode.md › Best practices` says "Avoid offering an app-specific appearance setting". The brief requires a toggle, so the page keeps one, and three things limit the cost:
  - the system setting is the default;
  - choosing the system's own theme returns to following the system;
  - the toggle is one small control in the navigation, not a setting.

## Components

- **Navigation:** sticky and always visible (it does not retract), 56px tall, holding the wordmark, "Sign in" (a text link with a 44px hit area), the theme toggle, and "Get started" as a secondary (hairline) button. The background is `bg` at 80% with `backdrop-filter: saturate(180%) blur(20px)`. A 1px hairline fades in at the bottom once the page scrolls past 8px. Under `prefers-reduced-transparency` or without `backdrop-filter` support, the background is solid `bg`.
- **Primary button:** `accent` fill, `accent-on` label, pill, 48px tall, label 17px/500.
- **Secondary button:** transparent with a 1px `field-edge` pill, `ink` label, 40px tall in the navigation with a 44px hit area.
- **Text link:** `accent`, underlined on hover and on focus.
- **Product frame:** `surface-2` in dark and `bg` with the one shadow in light, 12px radius, 1px `rule`. It holds HTML-rendered queue rows. It never holds a raster screenshot, so its text stays legible at every width.

## Sections

Positions are targets for the build, and Phase 3 measures them. "1280" means a 1280×800 viewport and "375" means 375×812.

### 1. Hero (bg)
- **Feel:** one product, one sentence, one action, then the instrument.
- **Content:**
  - centred headline: "Ten roles worth applying to, every morning."
  - one lead line: "A ranked queue of SDE roles for Indian CS freshers, with the reason for every rank."
  - one primary "Get started"
  - one quiet line: "Free and open source. Read the code on GitHub", which is the hero's only GitHub link
  - the radar, centred below, in a box with a fixed aspect ratio (1:1, `min(560px, 88vw)`) that is reserved before the script runs
  - the measurement caption and pause control under the radar
- **Reveal:** on load, the headline, lead, action and quiet line fade and rise over 600ms, staggered by 60ms. The radar fades in over 600ms after a 120ms delay, then the sweep starts.
- **At scroll 0:**
  - 1280: the text block fills roughly the top 470px, and the top third of the radar shows under it as an invitation to scroll.
  - 375: the headline (3 lines), lead, action and quiet line fill roughly 560px, and the radar's upper edge shows.

### 2. Walkthrough: how the queue works (dark band in both themes)
- **Feel:** a guided demonstration. The reader scrolls and the product answers.
- **Layout from 1024px:**
  - Two columns. The left holds three numbered steps, each about 70vh tall. The right holds a sticky product frame, vertically centred.
  - A step becomes active when its heading crosses the middle of the viewport.
  - The frame changes state in 350ms by cross-fading the parts that change, with no layout jump, because the frame's height is fixed.
- **Steps:**
  1. **Rank.** "Every morning, every open role you can apply to is scored on four terms: relevance 40%, deadline 30%, freshness 20%, and dream company 10%. The top ten make your queue."
     - Frame: three ranked rows with rank, title, company, city and priority.
  2. **Reason.** "Each row says why it sits where it does, including what isn't working. Sources rarely publish deadlines (13 of 4,995 rows), so today the deadline term gives every role the same score."
     - Frame: row 1 expands to show its four weighted contributions and its reason lines.
  3. **Apply.** "Apply opens the employer's own posting and logs the application. The row leaves your queue and today's count goes up."
     - Frame: row 1's Apply shows its pressed state, the row leaves, and the counter goes from 0 / 10 to 1 / 10.
- **Under 1024px:** no sticky frame. Each step is followed by its own frame state inline, so phones get all three states.
- **Reveal:** step text uses the 600ms reveal, and the frame changes state in 350ms.
- **Data:** the rows come from a committed JSON file that records its source and date (see Open decisions). They are never invented without an on-page "illustrative" label.

### 3. Open and checkable (bg)
- **Feel:** proof, stated plainly.
- **One idea:** you can check every claim.
- **Three blocks at most:**
  - "No model decides what you see." The classifier and location normalizer are deterministic rules, tested case by case.
  - "944 backend tests," counted 31 October 2026.
  - "Every rank has a reason you can read." This links to the walkthrough, not to GitHub.
- **Layout:** three columns from 1024px, one column below. Text blocks only, with no tiles and no icons.
- **Reveal:** blocks rise in a 60ms stagger, 600ms each.
- **At 1280:** all three blocks are visible at once.

### 4. After you apply (surface band)
- **Feel:** the tool keeps working after the click.
- **Two blocks:**
  - The board: "From saved to offer on one board: applied, online assessment, interview and offer, with referrals and follow-ups beside each role."
  - Reminders, as one plain sentence: "When a source publishes a deadline, you get a reminder 72 hours and again 24 hours before it closes."
- **Reveal:** 600ms.

### 5. Where postings come from (bg)
- **Feel:** a reference table you can trust.
- **Four sources:** ATS boards, free-API job boards, Adzuna and JSearch, each with origin, sync and closing rule.
- **640px and up:** a table with hairline rows.
- **Under 640px:** one card per source. The source names are the title, followed by two short lines: "From: …", and "Synced …, closes …".
- **Target:** under 480px tall at 375, against 860px today.
- **Reveal:** the table or cards fade in as one block, 600ms.

### 6. Questions (surface band)
- **Content:** three questions with answers, as a definition list.
- **Reveal:** 600ms, no stagger.

### 7. Footer (bg)
- **Content:** the wordmark, one line, "Get started" (the only accent in its viewport), "Source on GitHub" (the footer's only GitHub link), "Sign in", and "MIT licence".
- **Static:** no reveal.

## Content

- Lead with the outcome. Every number is real and carries its measurement date. No placeholder copy, and no invented figures, quotes or logos.
- The deadline claim follows the README. The weight is 30%, but sources rarely publish deadlines (13 of 4,995 rows), so today the term gives every role the same score.
- The 2,109-of-4,512 figure appears once, in the radar's caption.
- Every data view the page renders has loading, empty, error and success states. The landing renders only committed static data, so the walkthrough frame's states are the three steps. It has no network state.

## Decisions

- 2026-10-31 (this change): replaced Vantage with Neutral chrome and Geist.
  - The landing page now has light and dark themes. It was dark only.
  - Lime stays as the dark accent. Light uses deep green `47% 0.13 138`, because lime on white measures 1.33:1.
  - Scroll reveals are now allowed, with opacity and transform only, and off under reduced motion.
  - The navigation is now sticky rather than retracting.
  - The evidence is the Phase 0 audit and the measurements above.
- 2026-10-31 (earlier, superseded): Vantage, with Geologica, dark only and no scroll reveals.

## Open decisions (need the owner before Phase 2)

1. **Queue data source.**
   - The 16 September 2026 queue cannot be re-exported from the live API. The queue is recomputed at request time against the current time and today's active rows, and no database snapshot or export from that day is in the repository.
   - The only record of it is `docs/screenshots/daily-queue-reasons.png`. That screenshot is dated Wednesday, 16 September 2026, from an end-to-end test account, and shows rows 1 to 3 in full.
   - Its row 1 shows "Deadline 24.0 · Closes in 7 days", which conflicts with the README's "zero fresher-eligible rows have a deadline".
2. **Files outside the stated scope.** The no-flash script and loading one font once both need `artifacts/career-radar/index.html`, which today loads Geologica from Google Fonts for the app as well.
