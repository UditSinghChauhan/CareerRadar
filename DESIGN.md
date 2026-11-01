# DESIGN.md: CareerRadar

The visual source of truth. Change it on purpose; this file is the rule.

Scope: the landing page (`/`) and the case study (`/design-notes`). The app screens keep their own tokens (`src/index.css`) and both themes; see Open decisions.

## Direction

**"From 4,512 to ten."** The landing page is one continuous scroll story on a dark instrument. Every chapter is a state of the same object: the radar becomes the queue, the queue becomes a card, the card becomes an application, and the application becomes a board.

- **The stage:** dark only. A near-black ground, one lime signal, white type. The landing has no theme toggle; the app keeps its themes.
- **The object:** the radar, a full-bleed instrument up to 1200px wide, lit from behind by a soft radial light. One point per posting, the ten found roles glowing in lime.
- **The signature moment:** a pinned chapter, scrubbed by native scroll in both directions. 4,512 open roles contract to the 2,109 a fresher can apply to, ten of them fly along curved paths into the rank badges of the real queue, and the first row opens to show why it ranks first.
- **The pace:** one idea per screen. Very large type (display up to 96px) and very large product. No section after the hero is text alone; each carries a working piece of the product.
- **The honesty stays.** Numbers are live from the API where possible, fall back to committed figures, and carry no dates on the page. Provenance lives in code comments. Illustrative rows say so.

Chosen on 2026-11-01. It replaces the 2026-10-31 Neutral direction, whose rules ("no gradients, glows or icons", "one shadow", "three text blocks with no tiles or icons", "every number carries its measurement date") corrected the generic AI look into a documentation look: after the hero, about 3,300px of text with no visuals. See Decisions.

## Colour

The landing has one token set. Values are OKLCH; hex is the sRGB conversion.

| Token | Value | Role |
|---|---|---|
| stage | `13% 0.004 130` #070806 | page ground |
| stage-2 | `16.5% 0.005 130` #0e0f0d | a step lighter, for the closing and the case study bands |
| surface | `19% 0.006 130` #131412 | product frames, bento tiles |
| surface-2 | `24% 0.007 130` #1e201c | chips, bars' tracks, pressed states |
| hairline | `100% 0 0 / 0.09` | tile and frame edges |
| highlight | `100% 0 0 / 0.06` | 1px inner top highlight on raised surfaces |
| ink | `97% 0 0` #f5f5f5 | headings, body |
| ink-2 | `82% 0 0` #c4c4c4 | supporting copy, lead |
| muted | `66% 0 0` #929292 | captions, meta, labels |
| signal | `89% 0.19 126` #bcf053 | the found roles, rank badges, the primary action, focus, the progress indicator |
| signal-on | `19% 0.04 126` #0f1703 | text on the signal fill |
| glow | `89% 0.19 126 / 0.35` | the soft lime glow on found roles and on the active card |

Measured with `docs/screenshots/revamp/contrast-stage.mjs` (WCAG 2.x relative luminance, the same conversion as `docs/screenshots/landing-redesign/contrast.mjs`):

| Pair | Min | Ratio |
|---|---|---|
| ink on stage / surface | 4.5 | 18.44 / 16.91 |
| ink-2 on stage / surface | 4.5 | 11.52 / 10.57 |
| muted on stage / stage-2 / surface / surface-2 | 4.5 | 6.46 / 6.19 / 5.93 / 5.28 |
| signal on stage / surface (text, focus, data mark) | 4.5 | 15.07 / 13.83 |
| signal-on on signal (button label) | 4.5 | 13.77 |

- Lime is the only hue on the page. It marks what was found, what to do and where focus is.
- Light mode for the landing is gone, and with it the deep green that turned the brand generic on white.

## Light and atmosphere

Allowed, each with one job:

- **Radial light** behind the radar and the closing radar: two stacked radial gradients, a neutral white at 6% and a lime at 7%, fading to the stage by 70% of their radius. It lights the instrument, not the page.
- **Glow** on found roles and on the active card: a lime shadow, `0 0 24px glow`, pulsed once when a role is found.
- **Layered shadows** on product frames: `0 1px 0 highlight inset, 0 2px 4px oklch(0% 0 0 / 0.3), 0 24px 64px -16px oklch(0% 0 0 / 0.6)`, plus a lime underglow under the dashboard frame.
- **Film grain** at 3% opacity over the whole stage, one 128px noise tile generated once on a canvas. It keeps large dark fields from banding.
- **Mask fades** where the radar meets the page, never a hard crop.

Still banned: stock photos, purple or blue blob gradients, glassmorphism cards, emoji, fake testimonials or logos, invented metrics, gradient text.

## Type

One family: **Geist** (OFL), self-hosted variable woff2, Latin subset, 29.4 KB, `font-display: swap`, with the metric-matched "Geist Fallback" (`local("Arial")`, `size-adjust`) so the swap moves no line. The 2026-10-31 comparison of Geologica, Geist and Inter still holds and is kept in git history.

| Role | Size | Weight | Tracking | Line height | Colour |
|---|---|---|---|---|---|
| display (h1, chapter lines) | `clamp(3rem, 1.2rem + 5.6vw, 6rem)` (48 to 96px) | 600 | -0.04em | 0.98 | ink |
| section (h2) | `clamp(2.25rem, 1.3rem + 3.6vw, 4.5rem)` (36 to 72px) | 600 | -0.035em | 1.02 | ink |
| title (h3) | `clamp(1.25rem, 1.1rem + 0.5vw, 1.625rem)` (20 to 26px) | 600 | -0.02em | 1.2 | ink |
| lead | `clamp(1.1875rem, 1.05rem + 0.6vw, 1.5rem)` (19 to 24px) | 400 | -0.01em | 1.4 | ink-2 |
| body | 1.0625rem (17px) | 400 | 0 | 1.55 | ink-2 |
| small | 0.875rem (14px) | 400 | 0 | 1.45 | muted |
| label | 0.8125rem (13px) | 500 | 0 | 1.3 | muted |

- Sentence case, `text-wrap: balance` on headings, `pretty` on body, 60ch measure.
- Figures use tabular numerals and count up from 0 when they first appear.
- No monospace. No tracked capitals. Italics are allowed for a title in running text, nowhere else.
- UI text inside product frames is at least 13px at 1440px.

## Space

- Base unit 4px. Tokens: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160, 224.
- Chapters are a full screen or more. Bands between them: 224px at 1024px and wider, 160px from 640 to 1023px, 112px under 640px.
- Containers: text 720px; content 1200px. Gutters 48px at 1024 and up, 32px from 640 to 1023, 20px under 640.
- Widths checked: 320, 375, 768, 1024, 1280, 1440. No horizontal scroll at any width.

## Shape and depth

- Radius: a pill (999px) for buttons, 20px for bento tiles and the browser frame, 14px for product cards and rows, 8px for chips and rank badges, 44px for the phone frame.
- Raised surfaces (tiles, frames, cards) carry a 1px `hairline` edge and a 1px inner top `highlight`. Elevation is declared once: a tile has the hairline and highlight and no drop shadow; a product frame has the layered shadow.
- A bento tile lights on hover: the hairline turns to lime at 35% and a lime glow rises behind it over 250ms.
- Icons are meaningful and drawn from one set (lucide, 1.75 stroke), only where they name a thing: a star for a dream company, a bell for a reminder, a check for a verdict.

## Motion

Built with framer-motion. Only `transform`, `opacity` and `filter` animate. Native scroll only: no smooth-scroll library, no scroll-jacking.

| Token | Duration | Easing | Use |
|---|---|---|---|
| micro | 150ms | `cubic-bezier(0.2, 0, 0, 1)` | hover, press |
| short | 250ms | `cubic-bezier(0.2, 0, 0, 1)` | nav bar, tile glow, disclosure |
| reveal | 600ms | `cubic-bezier(0.16, 1, 0.3, 1)` | content entering view |
| count | 900ms | `cubic-bezier(0.16, 1, 0.3, 1)` | numerals counting up |
| loop | 1.6 to 2.4s per step | `cubic-bezier(0.65, 0, 0.35, 1)` | bento micro-demos |

- **Reveal** (`<Reveal>`): opacity 0 to 1, y 24px to 0, blur 8px to 0, 600ms, siblings staggered 70ms. Runs once at 20% in view. Content is visible without script.
- **Load sequence** (hero, within the first second): the rings draw in, points fade in from the centre outward, the counts tick up, the ten found roles light in rank order with a glow pulse, then the sweep starts.
- **Pinned chapter:** about 400vh, every frame a pure function of scroll progress, so it scrubs backward exactly as it plays forward. An "01 / 04" indicator in lime shows the beat. Under 1024px there is no pin: each beat is inline and plays a short in-view animation.
- **Continuous motion** (the sweep, bento loops, the source marquee) pauses when off screen and when the tab is hidden.
- **Reduced motion:** every animation shows its final state instantly. The pinned chapter becomes four still beats. The sweep stops on a frame with the ten found. Loops show their end state. The marquee is a static list.

## Navigation

- 64px tall, transparent over the hero. After 40px of scroll it becomes a dark translucent bar (stage at 72% with `backdrop-filter: blur(16px) saturate(140%)`) with a bottom hairline, crossfaded over 250ms. Its colour never flips: the whole page is one dark stage.
- Contents: the wordmark, "Design notes", "Sign in", and "Get started" as a secondary button. No theme toggle.
- Under `prefers-reduced-transparency` or without `backdrop-filter`, the bar is solid stage-2.

## Chapters

1. **Hero.** "Ten roles worth applying to, every morning.", one lead, one primary action, a GitHub line, a live count line with a pulsing lime "Live" dot when the figures came from the API. Below, the radar, full-bleed to 1200px, lit from behind, fading into the stage through a mask.
2. **From 4,512 to ten** (pinned). Beats: "4,512 open roles." / "2,109 you can actually apply to." / "Ten worth your morning." / "Each one tells you why."
3. **Apply, and it's logged.** The first card slides out, the counter goes 0 / 10 to 1 / 10, the streak lights, and the card drops into a board that assembles.
4. **Bento:** "Built to be used. Built to be checked." Twelve columns, two large tiles and four small, each a looping in-view micro-demo: the board moving Saved to Offer; "No model decides what you see" with the real classifier rule animating to a verdict; a reminder sliding in; a dream-company star lifting a row up the queue; the backend test count ticking up; a marquee of source names with the sync table behind a disclosure.
5. **Your whole search, on one screen.** Real captures of the app: the dashboard in a dark browser frame that tilts from `rotateX(18deg) scale(0.88)` to flat as it scrolls in, with a lime underglow; then three close-ups and a phone frame.
6. **Questions.** Four questions as an accordion.
7. **Closing.** A small lit radar, "Tomorrow's ten are already being ranked.", the live count and the primary action.
8. **Footer.** The wordmark, "Designed and built by Udit Singh Chauhan" (linked to GitHub), Design notes, Source on GitHub, Sign in, MIT licence. Portfolio and LinkedIn links render only when their constants are set.

## Content

- Numbers are live from `GET /api/public/stats` where possible and fall back to the committed figures. No number on the page carries a date; where a figure was measured is recorded in a code comment beside it.
- Illustrative queue rows are labelled on the page. Their scores come from the real scoring code; their reason lines are student-facing copy derived from each row's own scores and checked by `illustrative-queue.test.ts`.
- No invented users, testimonials, logos, outcomes, prices or people. A person in a capture is shown as initials.

## Data states

- **Live counts:** loading shows the committed figures counting up; success swaps in the live figures and shows "Live"; an error or a slow API keeps the committed figures without "Live". Empty (zero active postings) is treated as an error, not shown as "0 open roles".
- **App captures:** each image has fixed dimensions and a blurred placeholder, so it never shifts layout; if an image fails, its frame keeps its size and shows the caption.
- Everything else on the landing is committed static data.

## Accessibility

- WCAG 2.1 AA on the dark stage. Keyboard reachable in reading order, with a 2px lime `:focus-visible` ring and 2px offset. Mouse clicks never leave a ring.
- Demonstrations are `inert` with a visually hidden sentence that describes what they show. Canvases carry `role="img"` and a label.
- Works at 200% zoom and at 320px width without horizontal scroll.

## Open decisions

- The app screens keep Geologica and their own light and dark tokens until they are migrated in a separate change.

## Decisions

- **2026-11-01: dark stage, "From 4,512 to ten."** The Neutral rules produced a page that was honest but flat: after a strong hero and one pinned moment, about 3,300px of text with no visuals, stale dates on a page that claims to be live, engine debug text in the demo queue, and a weaker light theme in which lime fails on white. Kept: Geist, lime, the radar, the real queue, the honesty rules. Changed: dark only; light, glow, layered shadows, grain, bento tiles, meaningful icons and scroll-linked animation are allowed, each with one job (Light and atmosphere); dates leave the page for code comments; counts are live. References studied for this change are in `docs/REVAMP.md`.
- 2026-10-31 (superseded): the Neutral chrome, Geist, light and dark themes, from three concept mockups (`docs/screenshots/landing-redesign/concepts/`).
- 2026-10-31 (earlier, superseded): Vantage, with Geologica, dark only and no scroll reveals.
