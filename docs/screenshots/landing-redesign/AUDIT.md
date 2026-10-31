# Landing page audit (Phase 0)

Live page: https://careerradar-34ec.onrender.com/, captured on 31 October 2026 with Playwright (Chromium) at 375×812, 768×1024 and 1280×800, with both `prefers-color-scheme: light` and `dark`. Screenshots are in `before/`.

Checks that passed on all six captures: no console errors, no horizontal scroll, and the radar honours reduced motion and has a pause control.

Findings are ranked by their impact on a first-time recruiter.

## 1. The ranking claims a deadline signal that the data does not have
- **Problem.** The page lists "Deadline 30%: how soon applications close". The README (line 309) says the deadline field is filled on 13 of 4,995 rows and on none of the fresher-eligible rows, so every role scores the same constant 3.0. The product screenshots go further. `queue.webp` and `reason.webp` show "Deadline 24.0" and "Closes in 7 days", which real data cannot produce.
- **Evidence.** `before/live-dark-1280-checked-head.png`, `before/live-dark-1280-walkthrough.png`, and `artifacts/career-radar/public/landing/reason.webp`.
- **Fix.** Keep the 30% weight, because it is true in `priority.ts`, and state plainly that sources rarely publish deadlines (13 of 4,995 rows), so today this term gives every role the same score. Replace the screenshots with rows rendered from real values, where the deadline is 3.0 and the reason line reads "No deadline published by the source".
- **Effect.** A recruiter who reads the README after the page finds the two agree. This is the main credibility risk on the page.

## 2. The page is dark only and ignores the system theme
- **Problem.** The landing page writes `data-theme="vantage"` onto `<html>`, so a visitor with a light system theme still gets near-black (`oklch(0.135 0.012 235)`). The current DESIGN.md says "The landing page is dark only". Light and dark are specified only for the app screens. Phase 1 has to change that rule as well as the page.
- **Evidence.** `before/live-light-375-fold.png` was captured under a light system preference and is identical to `before/live-dark-375-fold.png`.
- **Fix.** Add a light token set with its own darker accent. Follow the system theme by default, add an accessible toggle that saves the choice, and set the theme before first paint so the page does not flash.
- **Effect.** The page matches the visitor's system theme, and the toggle shows dark-mode work done carefully.

## 3. Too many actions compete, and GitHub is linked four times
- **Problem.** The first viewport at 1280 px has three lime targets (the banner link, the header "Get started" and the hero "Get started") plus "Read the code". GitHub is linked four times: the banner, the hero, the footer "Source" and the footer "Architecture". Three of these go to the repository root. On a phone the banner takes 88 of the first 812 px.
- **Evidence.** `before/live-dark-1280-fold.png` and `before/live-dark-375-fold.png`. The four links were counted from the DOM.
- **Fix.** Remove the banner. Show one accent action per viewport: the hero "Get started", with a quiet header button. Keep one GitHub link in the hero and one in the footer.
- **Effect.** The next step is obvious, and the hero gains 41 to 88 px.

## 4. The walkthrough is hard to read and does not exist on phones
- **Problem.** At 1280 px the "What you open each morning" section is 2,057 px tall. About 330 px of empty space separates it from the hero. The 2,044 px queue screenshot is scaled to about 600 px, so its text renders at roughly 4 to 5 px and cannot be read. Below 60rem the sticky stage is `display: none`, so on phones and tablets nothing changes as the reader scrolls.
- **Evidence.** `before/live-dark-1280-walkthrough.png` and `before/live-dark-375-walkthrough.png`. Section heights were measured from the DOM.
- **Fix.** Build a three-step walkthrough (rank, reason, apply), where one product row is rendered in HTML at a legible size and changes with each step. On phones, each step shows its own state inline.
- **Effect.** A recruiter learns how the queue works by scrolling, without needing to zoom into a screenshot.

## 5. The "72 h 24 h" stat cannot be read on its own
- **Problem.** The stat shows two figures with no subject. It also depends on deadlines, which the sources almost never publish (see finding 1).
- **Evidence.** `before/live-dark-375-72h-tile.png`.
- **Fix.** Replace it with one sentence: "When a source publishes a deadline, you get a reminder 72 hours and again 24 hours before it closes."
- **Effect.** The tile is understood on the first read, and its claim is accurate.

## 6. "Built to be checked" holds six ideas in one section
- **Problem.** The section has six tiles: the weights, the 2,109-of-4,512 figure, the deterministic classifier, 944 tests, reminders and the board. Two tiles leave about 100 px of empty space between their heading and body. The 2,109-of-4,512 figure repeats the caption under the radar.
- **Evidence.** `before/live-dark-1280-checked-head.png` and `before/live-dark-768-checked-head.png`.
- **Fix.** Give each section one idea, with no more than three feature blocks. Fold the weights into the walkthrough and remove the repeated figure.
- **Effect.** The page gets shorter, and each block is read rather than skimmed.

## 7. The sources table is long on phones
- **Problem.** The table already stacks into label and value pairs, so it does not scroll sideways. But it is 860 px tall at 375 px, which is more than a full screen. It shows 16 label and value pairs, each label four times, "Every six hours" three times and "At 45 days old, or past its deadline" three times.
- **Evidence.** `before/live-dark-375-sources-head.png`. The table height was measured from the DOM.
- **Fix.** Under 640 px, show one card per source, with the source names as the title and the remaining details in two short lines.
- **Effect.** The table drops to roughly half its height. This is an estimate until it is measured after the build.

## 8. The hero is a split layout that competes with itself
- **Problem.** The headline itself works. The issue is the layout: two columns, with the radar on the right, its own figure ("10 roles found today"), a measurement caption and a pause button all competing with the headline. On phones the radar starts about 500 px down the page.
- **Evidence.** `before/live-dark-1280-fold.png` and `before/live-dark-375-fold.png`.
- **Fix.** Use a centred composition: headline, one supporting line, one action and one line saying the product is free and open source. Place the radar below the hero text, with space reserved for it.
- **Effect.** The page reads in one direction, and the five-second read covers the headline and the action.

## Measured but not fixed in this audit
- Total page height is 6,060 px at 1280 and 6,536 px at 375.
- The README gives 4,995 rows in total, and the page gives 4,512 active postings, measured on 16 September 2026. These may count different things (all rows against active rows). I have not confirmed this.
