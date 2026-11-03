# DESIGN.md: CareerRadar

The visual source of truth. Change it on purpose; this file is the rule.

Scope: the landing page (`/`) in full, and the brand rules the app shares with it (logo, type, light-theme tokens). The app keeps both themes; the landing is light only.

## Direction

**"Field to focus."** Every open role is a field; CareerRadar brings ten of them into focus. The landing is a light, quiet page of seven sections, and the same idea runs through it once each:

- **The field:** the hero's headline sits inside faint concentric rings (the radar, used as layout) with small white sample job cards on them at three depths.
- **The focus:** as the hero leaves, the ten ranked cards travel into one "Today's ten" card.
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
| lime | #BCF053 | only: the "Live" dot, the rank tag on the ten, and inside the dark band |
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
| ink on lime (rank tag, band button) | 4.5 | 14.14 |
| band-ink on band | 4.5 | 17.85 |
| monogram ink on its tint (sky, sand, rose) | 4.5 | 7.82, 6.42, 7.21 |

- No glows, gradients or grain on the light page. Lime never sits on the light canvas as text.
- Monogram tiles take one of six soft tints (sky, sage, sand, rose, stone, teal) with a dark ink of the same hue. They stand in for logos; no real logo is shown.

## Type

Two families, both OFL, self-hosted as Latin-subset variable woff2 files in `public/fonts/`, declared once in `src/styles/fonts.css` with `font-display: swap` and a metric-adjusted local fallback, so the swap moves no line:

- **Geist** (29.4 KB): everything. Fallback "Geist Fallback" on Arial with `size-adjust: 101.5%`.
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
- One gap between sections, set as each section's top padding: 120px at 1024 and up, 96px from 640, 72px under 640.
- Page height budget: at most 6,500px at 1440 and 8,500px at 390. Measured 2026-11-03: 6,439px, 7,082px at 768, 7,579px at 390.

## Shape and depth

- **Card:** white, radius 14, 1px hairline, shadow `0 1px 2px rgb(0 0 0 / 4%), 0 16px 40px -20px rgb(0 0 0 / 14%)`. The app's light cards use the same values (`--card-shadow`, `--radius-xl`).
- Rows and inner fields: radius 10 (app `--radius-lg`); board cards 8; buttons and chips are pills.
- Primary button: ink pill, white label, 48px tall (38px in the nav, 28px inside product fragments). In the dark band: lime pill, ink label.
- Icons are lucide at the default stroke, only where they name a thing: a bell for a reminder, a bookmark for a dream company, a check for applied, play and pause.

## Motion

Built with framer-motion. Native scroll only, no scroll-jacking.

| Token | Duration | Easing | Use |
|---|---|---|---|
| micro | 150ms | ease or the reveal curve | hover, press (`scale(0.97)`) |
| short | 250ms | ease | nav background, accordion icon |
| reveal | 500ms | `cubic-bezier(0.16, 1, 0.3, 1)` | content entering: opacity 0 to 1, y 12 to 0, once, siblings 70ms apart |
| travel | spring, 0.9s, bounce 0.12 | | the ten moving between the field and the card |
| count | 900ms | the reveal curve | stat numbers, once |
| drift | 8 to 14s per card, alternate | ease-in-out | the field's idle loop, translate up to 6px |

- **The field** moves by transform only: each depth layer translates with scroll at its own rate (far +140px, mid +70px, near -40px over the hero), far and mid scale outward and fade as the hero leaves. Blur is a fixed CSS filter per layer (far 6px, mid 2px), never animated. Cards never sit under the headline: `layoutField()` measures the hero's text block and skips any spot that would overlap it, the nav, or another card.
- **The focus** is a shared layout animation (`layoutId`): the ten leave the field for "Today's ten" when 30% of the card is in view, and go back when the card is below the fold again, read from its position on every scroll (`focusFor()`). On 1024px and wider the section holds for 15vh of sticky; under 1024 it does not stick.
- Vignettes in How it works and Features play once, when half in view.
- The radar sweeps at 30fps only while on screen and not paused, with an icon-only pause button labelled "Pause the radar sweep".
- **Reduced motion:** no parallax, drift, travel, sweep or counting. The field is static, the ten are already in the card, every vignette shows its end state.

## Navigation

A plain transparent bar, 64px tall: the logo, "How it works", "Features", "FAQ" (anchors, hidden under 768px), "Sign in", and "Get started" as an ink pill. After 24px of scroll it takes the canvas colour and a bottom hairline. No theme toggle on the landing.

## Sections

1. **Hero, "Field to focus."** Centred h1 "Ten roles worth applying to, every morning.", a one-line lead, Get started, "Free and open source". Around it, rings and sample cards: 34 at 1440 in three depths (10 near with rank tags, 12 mid, 12 far), 24 at 768, 12 at 390 in two depths (6 near, 6 mid).
2. **Focus.** The statement "Ten, not ten thousand. Ranked by fit, how soon it closes, how fresh it is and the companies you care about.", the caption "Sample roles. Ranking from the real scoring code.", and the "Today's ten" card: four full rows with reasons and an Apply on row 1, six one-line rows.
3. **Stats.** Three columns 344px tall with a hairline left rule: "Tracked" {activePostings} open roles, "Open to you" {openToFreshers} open to freshers, "Your queue" 10 ranked each morning; mono index 01 to 03; a lime "Live" dot on the first. Rows with a top rule under 768px.
4. **How it works.** A statement, then Ranked (four labelled bars), Explained (reason chips), Tracked (Apply, check, onto the Applied column).
5. **Features.** The board (Saved, Applied, Online assessment, Interview, Offer) with one card moving; deadline reminders (a reminder as the app writes it); dream companies (a bookmark lifts a row by ten points); the real dashboard in a light browser frame with no window dots, tilting from 6deg to flat; the sources as wordmarks.
6. **Questions.** Five, a left-aligned accordion of hairline rows with a height animation.
7. **The dark band.** The lit radar, "Tomorrow's ten are already being ranked.", Get started in lime. Then the footer on the canvas: logo, one line, Sign in, Source on GitHub, MIT licence, "Designed and built by Udit Singh Chauhan".

## Content

- **Totals** appear only in the stats band, and come only from `GET /api/public/stats` (cached 10 minutes on the server). On error the committed figures show, with no "Live" and no date. Their source is a code comment in `use-public-stats.ts`.
- **Sample roles** are invented and labelled "Sample roles". The ten ranked ones are `illustrative-queue.json`, whose scores and reasons `api-server/src/queue/illustrative-queue.test.ts` checks against `priorityFromComponents` and `explainPriority`.
- Only features that exist are shown. No users, testimonials, logos, outcomes, prices or people. No test counts, dates or engine vocabulary on the page; that detail lives in `docs/CASE_STUDY.md`.

## Data states

- **Live counts:** loading shows the committed figures; success swaps in the live ones and shows "Live"; an error or a slow API (8s) keeps the committed figures without "Live". Zero is treated as an error.
- **The dashboard capture** has fixed dimensions and a blurred placeholder, so it never shifts layout; if it fails, the frame keeps its size and caption.
- Everything else on the landing is committed static data.

## Accessibility

- WCAG 2.1 AA. A 2px green `:focus-visible` ring with 2px offset (lime inside the dark band). Mouse clicks never leave a ring.
- The field is `aria-hidden`; product fragments are `inert`. The radar canvas has `role="img"` and a label. Each stat has a screen-reader sentence with its final figure.

## App

The app's light theme uses the landing's tokens (canvas, white cards, hairline, ink, grey #6B6B66, green #316B17) and card shape. Dark keeps the Vantage night. The logo is the radar mark everywhere: sidebar, mobile header, favicon, OG image.

## Decisions

- **2026-11-03: light, "Field to focus."** The dark page was about 12,200px long at 1440, showed the radar full-size twice, ran a 3,600px pinned chapter, put lime glow on everything so nothing stood out, spoke in engine terms, and did not match the app (briefcase logo, Geologica, engine reasons in the real queue). Kept: Geist, the radar mark, lime as a signal, the real scoring code, live counts, the honesty rules. Changed: light canvas with one dark band; lime restricted to three uses; one field of cards instead of a canvas of points; a seven-section page under 6,500px; Geist Mono for labels; the app brought onto the same brand. Study and measurements: `docs/LANDING_V3.md`.
- 2026-11-01 (superseded): dark stage, "From 4,512 to ten." References in `docs/REVAMP.md`.
- 2026-10-31 (superseded): the Neutral chrome, Geist, light and dark themes, from three concept mockups (`docs/screenshots/landing-redesign/concepts/`).
- 2026-10-31 (earlier, superseded): Vantage, with Geologica, dark only and no scroll reveals.
