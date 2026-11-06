# DESIGN.md: CareerRadar

The visual source of truth. Change it on purpose; this file is the rule.

Scope: the landing page (`/`) in full, and the brand rules the app shares with it (logo, type, light-theme tokens). The app keeps both themes; the landing is light only.

## Direction

**"Field to focus."** Every open role is a field; CareerRadar brings ten of them into focus. The landing is a light, quiet page of seven sections, and the same idea runs through it once each:

- **The field:** the hero's headline sits inside faint concentric rings (the radar, used as layout) with small white sample job cards on them at three depths.
- **The focus:** as the hero leaves, its field drifts outward and fades, and the ten arrive in one "Today's ten" card, row by row.
- **The proof:** the numbers, how it works, and the features, each shown with one working fragment of the real product.
- **The signal:** the radar itself appears once, lit, in the page's only dark band at the end.

Each visual idea appears once. The radar and the full queue are never shown twice. Fewer, better things.

Techniques are borrowed from lightspark.com (canvas, depth field, two-tone statements, ruled stat columns, Swiss type, quiet spacing) and pacing from apple.com; see `docs/LANDING_V3.md`. Not used, so the page stays distinct from the owner's other product: rails, "+" marks, a hero card, a floating pill navigation.

## Colour

| Token | Value | Role |
|---|---|---|
| canvas | #F6F6F3 | page ground; the app's light background |
| surface | #FFFFFF | cards |
| wash | #EFEFEA | chips, bar tracks, small fields inside cards |
| hairline | #E4E4DF | card edges, rules, rings |
| ink | #111111 | headings, body, primary button |
| ink-2 | #3A3A37 | chip text |
| grey | #6B6B66 | any grey text under 24px |
| grey-lg | #8A8A85 | grey text 24px and larger only (statements' second tone, source wordmarks) |
| green | #316B17 | links, focus ring, the app's primary action |
| lime | #BCF053 | only: rank 1's tag in "Today's ten", and inside the dark band. At most one lime mark in any viewport outside the band |
| lime-tint | #EEF8D8 | the rank tag of ranks 2 to 10, with ink text |
| band | #0C0D0B | the dark band |
| band-ink | #F5F5F3 | text in the dark band |

Measured with `node docs/screenshots/landing-v3/contrast.mjs` (WCAG 2.x):

| Pair | Min | Ratio |
|---|---|---|
| ink on canvas / surface | 4.5 | 17.44 / 18.88 |
| grey on canvas / surface / wash | 4.5 | 4.95 / 5.36 / 4.64 |
| grey-lg on canvas / surface (large text) | 3 | 3.20 / 3.47 |
| ink-2 on wash | 4.5 | 9.89 |
| green on canvas | 4.5 | 5.97 |
| white on ink (button) | 4.5 | 18.88 |
| ink on lime (rank 1, band button) | 4.5 | 14.14 |
| ink on lime-tint (ranks 2 to 10) | 4.5 | 17.13 |
| band-ink on band | 4.5 | 17.85 |
| monogram ink on its tint (sky, sand, rose) | 4.5 | 7.82, 6.42, 7.21 |

- No glows, gradients or grain on the light page. Lime never sits on the light canvas as text.
- The "Live" mark's dot is green; it breathes with a soft lime halo (Motion). Rank tags in the hero's field all take lime-tint, rank 1 included, so the queue's rank 1 is the only lime on screen.
- One hairline colour (hairline) on the light page; no element carries two shadows.
- Monogram tiles take one of six soft tints (sky, sage, sand, rose, stone, teal) with a dark ink of the same hue. They stand in for logos; no real logo is shown.

## Type

Two families, both OFL, self-hosted as Latin-subset variable woff2 files in `public/fonts/`, declared once in `src/styles/fonts.css` with `font-display: swap` and a metric-adjusted local fallback, so the swap moves no line:

- **Geist** (29.4 KB): everything. Preloaded from `index.html` and shown with `font-display: optional`, so it is used only if ready for the first paint and never swapped in later: the local fallback differs by platform (Arial, Liberation Sans, DejaVu Sans), so no metric override could make a swap shift-free, and the swap was the landing's CLS (0.069 in Lighthouse). Changed 2026-11-04.
- **Geist Mono** (30.2 KB): indices (01, 02), card meta such as scores, stat labels and captions, in sentence case. Fallback "Geist Mono Fallback" on Courier New, which shares its 0.6em advance; only the vertical metrics are overridden. Added 2026-11-03; before that this file said monospace was not used.

The app uses the same two families (`--app-font-sans`, `--app-font-mono` in `src/index.css`). Geologica is gone.

| Role | Size | Weight | Tracking | Line height | Colour |
|---|---|---|---|---|---|
| display (h1) | `clamp(2.5rem, 1.2rem + 4.2vw, 4.75rem)`: 76px at 1440, 40px at 390 | 500 | -0.04em | 1.02 | ink |
| section (h2) | `clamp(2.25rem, 1.6rem + 1.6vw, 3rem)`: 36 to 48px, left-aligned | 500 | -0.035em | 1.05 | ink |
| title (h3) | 20px | 500 | -0.015em | 1.3 | ink |
| statement | `clamp(1.5rem, 1.25rem + 0.6vw, 1.75rem)`: 24 to 28px | 400 | -0.02em | 1.3 | first sentence ink, the rest grey-lg |
| lead | 17 to 19px | 400 | 0 | 1.45 | grey |
| body | 17px | 400 | 0 | 1.55 | grey |
| stat number | 44 to 56px | 500 | -0.035em | 1 | ink |
| mono | 12 to 13px Geist Mono | 400 | 0 | 1.4 | grey |
| product UI | 13 to 14px, never smaller | 400 to 600 | 0 | 1.35 | ink, grey |

- Sentence case everywhere; `text-wrap: balance` on headings.
- Scores are whole numbers, in the app and on the landing (`formatScore` in `todays-queue.tsx`; `Math.round` in `sample-roles.ts`).

## Space

- Base unit 4px. Gutters 48px at 1024 and up, 32px from 640 to 1023, 20px under 640. Content max 1200px.
- One vertical rhythm, `--lp-section`: 128px from 768 up, 80px under 768. Every section after the hero pads its top with it (FAQ and the band their bottom too); no section has an empty band taller than it (the stat columns are 240px).
- Page height budget: at most 6,500px at 1440 and 8,500px at 390. Measured 2026-11-06: 6,453px at 1440, 7,784px at 768, 8,204px at 390.

## Shape and depth

- **Card:** white, radius 14, 1px hairline, shadow `0 1px 2px rgb(0 0 0 / 4%), 0 16px 40px -20px rgb(0 0 0 / 14%)`. The app's light cards use the same values (`--card-shadow`, `--radius-xl`).
- Rows and inner fields: radius 10 (app `--radius-lg`); board cards 8; buttons and chips are pills.
- Primary button: ink pill, white label, 48px tall (38px in the nav, 28px inside product fragments). In the dark band: lime pill, ink label.
- Icons are lucide at the default stroke, only where they name a thing: a bell for a reminder, a bookmark for a dream company, a check for applied, play and pause.

## Motion

Built with framer-motion and native CSS; no other animation library. Native scroll only, no scroll-jacking. Transform, opacity and filter only. One easing for entrances and settles: `cubic-bezier(0.16, 1, 0.3, 1)` (`--lp-ease`, `EASE_OUT`); `ease-in-out` for things already on screen that move (the nav marker, the Live dot); `linear` for loops and scroll-linked motion.

The page is calm but never still. Four layers, and nothing outside them:

1. **Ambient: alive at rest, never distracting.**
   - *The field.* Every sample card drifts on its own loop: an ellipse of 3 to 5px either side (6 to 10px of travel; 3px on phones, whose cards sit 10px apart), a tilt of at most 0.6deg, 8 to 10.5s per turn for near cards, 10.5 to 13s for mid, 13 to 16s for far, each with its own phase (`driftFor` in `field.tsx`, seeded by the card, so every visitor sees the same field). Far cards move less and slower than near ones, for depth. Two neighbours never come within 4px.
   - *The rings* turn once in 120s, all on one layer. A whole circle that turns looks still, so the solid rings carry four short breaks and every second ring is dotted.
   - *The stats band's "Live" dot* breathes: the green dot swells to 1.15 and a soft lime halo behind it brightens, 2.4s each way. The dot stays green so it reads on the canvas (lime alone is 1.2:1); lime appears only as the halo.
   - *The final band's radar sweep*, at 30fps, only after the band has faded in, while on screen and not paused (the icon-only pause button, "Pause the radar sweep", sits in the band's bottom-right corner).
   - Every loop pauses while its section is off screen or the tab is hidden (`usePauseOffscreen`: an IntersectionObserver and `visibilitychange` set `data-paused`, and CSS pauses the animation), and never starts under reduced motion.
2. **Scroll-driven, on the compositor.** CSS scroll-driven animations where the browser has them (`animation-timeline: view()` with `animation-range`, detected once as `SCROLL_TIMELINE` to match the `@supports` block in `landing.css`); framer-motion `useScroll`/`useTransform` values elsewhere.
   - *The hero* names its own view timeline (`--hero`, `exit-crossing`). As it leaves, each card spreads straight out from the centre and fades: near cards up to 60px and gone by 50% of the hero, mid 65% of that by 60%, far 40% by 70%, so the field parts with depth; the rings fade by 70%; the copy lifts 16px and fades by 50%, a little earlier. Cards only move away from the text, so none ever crosses the headline, lead or button.
   - *Section headings and statements* settle: from 12px below and opacity 0.4 as their top enters the viewport to rest by 35% of their view (`cover 0%` to `cover 35%`, `Settle`), so content arrives instead of popping.
   - *The dashboard capture* tilts from `rotateX(8deg)` and scale 0.96 to flat by the time its middle reaches the middle of the viewport (`Tilt`, a layer of its own, so it never shares a transform with the reveal).
   - *The stats* count up from zero once, when half a column is in view (1.2s; a later live figure eases from the shown one in 0.6s), written by a framer-motion value, in tabular figures. The screen-reader sentence always carries the final figure.
3. **Interaction: everything answers.**
   - Buttons: background shade on hover (150ms), `scale(0.97)` on press, the green `:focus-visible` ring.
   - Cards (the hero's sample cards, the feature cards, the how-it-works steps, the queue's rows): lift 2px with a deeper soft shadow on hover (200ms). A one-line queue row trades its title, in place, for its reason chips, so the list never changes height. Hover effects apply only to fine pointers.
   - Links: a full-strength underline grows from left to right (`scaleX`, 200ms). Links inside text keep a resting underline at 45%, so they never rely on colour alone.
   - The nav: a short ink line under the section links slides to the section being read (an IntersectionObserver picks the section; the line moves by one transform). Hover darkens a link; there is never a second line under the nav.
   - The FAQ: the answer's height and opacity open over 300ms and close over 240ms; the plus turns 45deg into a cross.
4. **Entrances, staged, within 1.2s, never blocking.**
   - On first load: the nav fades in (320ms); the headline lifts 10px line by line, 60ms apart (`--line`, numbered before the first paint); the lead at 240ms and the button at 300ms rise and fade in; then the field's cards come out of an 8px blur to their depth's blur, near cards first, then mid, then far, 18ms apart (`entranceDelay`). Measured at 1440x900: the last card is in 1.15 to 1.18s after the first paint. Links and buttons work from the first frame.
   - The headline moves by transform alone. Opacity, blur or a mask on it made the browser measure its first paint smaller than the copy React renders over it, which then counted as a later Largest Contentful Paint (measured with a PerformanceObserver and Lighthouse; 2026-11-06).
   - The clock starts when `index.html` paints its pre-rendered hero (`window.__lpBorn`); React's hero, which replaces it, sets `--since` to the time already spent, so the entrance never restarts.
   - Below the fold, content rises and fades in once as it comes into view (`Reveal`; 12px, 500ms, siblings 70ms apart). "Today's ten" plays its own version when a quarter of the card is in view: the card fades and rises 12px, its ten rows rise 8px and fade in, 45ms apart, and rank 1's lime tag pulses once (900ms).

**No scroll listener positions anything.** No element on the landing is positioned or transformed from a `scroll` event. Scroll-linked motion is CSS scroll-driven animation where supported and framer-motion motion values (no React state, no hand-written style writes) as the fallback. The nav's scroll listener only toggles its background class; its section marker follows an IntersectionObserver. Nothing is sticky except the FAQ heading.

**Budget.** At most 40 time-based animations running in the viewport at rest (measured: 20 at 1440x900, 14 at 768x1024, 12 at 390x844); scroll-driven animations only advance while the page scrolls. No `will-change`: the browser promotes running transform animations itself, and nothing that is still holds a layer. At least 15 things visibly move in the hero over 1.5s with no input (measured: 24 at 1440, 17 at 768, 16 at 390) and none under reduced motion.

**Tests.** `e2e-landing/smooth-scroll.spec.ts` wheel-scrolls 0 to 1600px and back at 1440x900 and fails if the statement's column moves, if the statement, the hero copy or the card moves outside its declared motion, or if a flying or duplicate card exists. `e2e-landing/motion.spec.ts` fails if fewer than 15 things move in the hero at rest at 1440 or 390, if anything moves under reduced motion, if the loops keep running off screen or in a hidden tab, if the entrance runs past 1.2s, or if more than 40 animations run in view at rest.

- Still on purpose: the How it works fragments, the board, the reminder, the dream list and the app crop show their end state; the card they sit in reveals, lifts and (the crop) tilts.
- Anchor links scroll natively and smoothly (off under reduced motion), and each section stops 24px under the nav.
- **Reduced motion:** nothing moves. No entrance, drift, ring turn, breathing, count, settle, tilt, spread, sweep, hover lift or press scale; every row and card is shown in place and every figure printed.

## Navigation

A plain transparent bar, 64px tall: the logo, "How it works", "Features", "FAQ" (anchors, hidden under 768px), "Sign in", and "Get started" as an ink pill. After 24px of scroll it takes the canvas colour and a bottom hairline. A 1.5px ink line under the section links marks the section being read and slides between them (Motion). No theme toggle on the landing.

## Sections

1. **Hero, "Field to focus."** Centred h1 "Ten roles worth applying to, every morning.", a one-line lead, Get started, "Free and open source". Around it, rings and sample cards: 24 at 1440 in three depths (8 near, 8 mid, 8 far), 18 at 768 (8, 6, 4), 12 at 390 in two depths (6 near, 6 mid). On phones and tablets the text spans the width, so the cards sit in rows above and below it; the hero is at least 1080px tall at 640 to 1023 and 920px on phones to fit all ten.
2. **Focus.** A plain two-column section from 1024px (statement 4fr, card 7fr), the statement centred beside the card by the grid; stacked below. The statement "Ten, not ten thousand. Ranked by fit, how soon it closes, how fresh it is and the companies you care about.", the caption "Sample roles. Ranking from the real scoring code.", and the "Today's ten" card: four full rows (16px padding top and bottom) with reasons and an Apply on row 1, six one-line rows.
3. **Stats.** Three columns 240px tall with a hairline left rule: "Tracked" {activePostings} open roles, "Open to you" {openToFreshers} open to freshers, "Your queue" 10 ranked each morning; mono index 01 to 03; a green "Live" dot on the first. Rows with a top rule under 768px.
4. **How it works.** A statement, then three cards of equal height with their content set from the top: Ranked (four 4px bars: ink at 85% on a hairline track, rounded, values in tabular figures), Explained (reason chips), Tracked (the next pick with Apply, and the first, checked, on the Applied column, as in the real queue). All three are still.
5. **Features.** The board (Saved, Applied, Online assessment, Interview, Offer) with a referral chip on one card and an interview day on another; deadline reminders (a reminder as the app writes it, flat, no shadow inside its card); dream companies (the bookmarked row sits ten points up, on top); a crop of the real app's Today's ten, 880px wide at most, captured so its smallest text shows at 14px or more, its last 200px fading into the frame through a mask so it ends in white, never on a cut row, with the caption below and no rule between, in a light browser frame with no window dots; the sources as wordmarks.
6. **Questions.** Five, in an accordion of hairline rows with a height animation. At 1024px and wider, two columns: "Questions" and "Something else? Read the code on GitHub" on the left, sticky; the accordion on the right.
7. **The dark band.** The lit radar centred above "Tomorrow's ten are already being ranked.", Get started in lime. Then the footer on the canvas: logo, one line, Sign in, Source on GitHub, MIT licence, "Designed and built by Udit Singh Chauhan".

## Content

- **Totals** appear only in the stats band, and come only from `GET /api/public/stats` (cached 10 minutes on the server). On error the committed figures show, with no "Live" and no date. Their source is a code comment in `use-public-stats.ts`.
- **Sample roles** are invented and labelled "Sample roles". The ten ranked ones are `illustrative-queue.json`, whose scores, freshness and reasons `api-server/src/queue/illustrative-queue.test.ts` checks against `priorityFromComponents`, `freshness` and `explainPriority`. No ranked pick is older than 7 days, here or in the demo account the captures and walkthrough are made from (`capture-seed-id.ts`).
- Only features that exist are shown. No users, testimonials, logos, outcomes, prices or people. No test counts, dates or engine vocabulary on the page; that detail lives in `docs/CASE_STUDY.md`.

## Data states

- **Live counts:** loading shows the committed figures, so the page renders in full while the API sleeps; success swaps in the live ones quietly (same digits, tabular figures) and shows "Live". If the first request fails or takes over 8s (a sleeping API), one more waits up to 90s for it to wake. If both fail the committed figures stay, without "Live". Zero is treated as an error.
- **The dashboard capture** has fixed dimensions and a blurred placeholder, so it never shifts layout; if it fails, the frame keeps its size and caption.
- Everything else on the landing is committed static data.

## Accessibility

- WCAG 2.1 AA. A 2px green `:focus-visible` ring with 2px offset (lime inside the dark band). Mouse clicks never leave a ring.
- The field is `aria-hidden`; product fragments are `inert`. The radar canvas has `role="img"` and a label. Each stat has a screen-reader sentence with its final figure.

## App

The app's light theme uses the landing's tokens (canvas, white cards, hairline, ink, grey #6B6B66, green #316B17) and card shape. Dark keeps the Vantage night. The logo is the radar mark everywhere: sidebar, mobile header, favicon, OG image.

- **One primary button everywhere: the ink pill** (`--action`, the Button's default variant): Apply, Browse jobs, Show my ten, Save, Add job, Clerk's Continue. Hover 150ms, press `scale(0.98)`, the green focus ring. In dark, the pill inverts (light ink, dark label). Green is for links, focus, progress and success only; selected filter chips, the active nav item, checkboxes and tooltips are ink or neutral.
- **One page header** (`components/page-header.tsx`): the title at 28px, weight 500, -0.03em, one 15px line under it, actions on the right.
- Card titles in sentence case; no tracked capitals. The queue's rank tags match the landing's (ink on lime-tint, full lime on rank 1), and the card is titled "Today's ten".
- Pages fade in over 200ms on navigation (opacity only); while a page's code loads, a skeleton of the page stands in inside the shell, and while the shell's own code loads, a skeleton of the shell (`shell-skeleton.tsx`), so the screen never blanks. Loading is skeletons, never a spinner for content.
- **Onboarding** (`/welcome`): one step after sign-up, two questions with complete defaults, the ink pill "Show my ten", then the dashboard. The same control is in Settings.
- **Clerk** (sign-in, sign-up): Geist, the 14px card with the landing's shadow on the canvas, the ink pill, "Continue with Google" first as a full-width block button, subtitle "Ten roles worth applying to, every morning."

## Decisions

- **2026-11-06: four motion layers.** The page declared 19 animations and nothing visibly moved at rest (0 elements over 1.5s at 1440 and 390, measured with `e2e-landing/motion.spec.ts`), so it read as static next to its references (lightspark.com, skydive.com). Added the four layers in Motion: ambient drift, turning rings and a breathing Live dot, all paused off screen; CSS scroll-driven spread, settle and tilt with framer-motion fallbacks; hover, press, underline and a sliding nav marker; a staged entrance under 1.2s. Now 24 things move in the hero at rest at 1440 and 16 at 390, none under reduced motion. The stat numbers now count up once (they were printed). The queue card is `aria-hidden` instead of `inert`, so its rows can answer hover; it holds nothing focusable either way. The hero's far layers now fade toward its foot under a still canvas-coloured overlay instead of a `mask-image`, which made the browser recomposite the whole field every frame once the cards drifted (26 to 28fps idle at 1440x900 on a software compositor with the mask; 60 on a GPU compositor without it).

- **2026-11-06: the scroll fade and the row reveal replace the flight.** The statement beside "Today's ten" shook on scroll: `useCentredBeside()` wrote a transform from a window scroll listener onto an element inside a CSS-sticky stage. The browser moves sticky content on the compositor at once and the script's correction lands a frame later, so the two fought; on production the offset swung from -296px to +57px in one scroll, with 15 of 43 frames jumping over 12px. The flight had the same weakness (an overlay placed from scroll every frame) and made the focus section a 115vh sticky hold. Both are gone. The hero's field now drifts outward and fades with the scroll (motion values only), "Today's ten" reveals its rows once in a plain grid section, and the rule is written down: no scroll listener positions anything (Motion). `e2e-landing/smooth-scroll.spec.ts` fails on the old page (the statement jumps 297px in one frame, flying and duplicate cards) and passes on the new one. The same pass cut the motion to three (reveal, scroll fade, sweep), set one easing, one 128/80px section rhythm, one lime mark per viewport, and a softer foot on the app crop. Before and after: `docs/screenshots/smooth-premium/`.

- **2026-11-05 (superseded 2026-11-06): field to focus, one row at a time.** A frame-by-frame capture at 1440x900, every 50px from 0 to 1200, found faults in 12 of 25 frames: up to ten overlapping pairs of flying cards, cards over the headline and button, "Today's ten" shown empty, and the statement low beside a rising list. All ten had flown together from scattered places into one column, so their paths crossed. Now the copy leaves first, the field ranks from the bottom up, and rows land in turn as they come into view; the same capture finds 25 of 25 clean, and a 10px sweep at ten viewports from 375 to 2560 wide finds none. Before and after strips: `docs/screenshots/focus-frames/`.

- **2026-11-03: light, "Field to focus."** The dark page was about 12,200px long at 1440, showed the radar full-size twice, ran a 3,600px pinned chapter, put lime glow on everything so nothing stood out, spoke in engine terms, and did not match the app (briefcase logo, Geologica, engine reasons in the real queue). Kept: Geist, the radar mark, lime as a signal, the real scoring code, live counts, the honesty rules. Changed: light canvas with one dark band; lime restricted to three uses; one field of cards instead of a canvas of points; a seven-section page under 6,500px; Geist Mono for labels; the app brought onto the same brand. Study and measurements: `docs/LANDING_V3.md`.
- 2026-11-01 (superseded): dark stage, "From 4,512 to ten." References in `docs/REVAMP.md`.
- 2026-10-31 (superseded): the Neutral chrome, Geist, light and dark themes, from three concept mockups (`docs/screenshots/landing-redesign/concepts/`).
- 2026-10-31 (earlier, superseded): Vantage, with Geologica, dark only and no scroll reveals.
