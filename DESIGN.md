# DESIGN.md: CareerRadar

The locked system. Every page and screen reads this first and shares it. Change it on purpose; the file is the rule.

Direction: reality capture at night. CareerRadar is a radar over the job market, so the product is shown as an instrument: a field of measured points, a sweep that passes through them, and one lime signal for what was found. The page is quiet around that one moving thing.

## System
- Genre: modern-minimal (Hallmark)
- Theme: Vantage, steel colourway, adapted: the point field is the postings, the sweep is the radar
- Axes: dark/grotesk-sans/chromatic-lime · posture: restrained
- Landing: Bento Grid shape, Stage hero, banner over a bar, mast footer, dark only
- App screens: the same tokens in a dark (Vantage) and a light (steel on paper) colourway

## Colour
Tokens live in `artifacts/career-radar/src/index.css` (app) and `src/styles/landing.css` (landing). Values are OKLCH.

| Role | Light | Dark | Use |
|---|---|---|---|
| paper | 98.5% 0.003 230 | 13.5% 0.012 235 | page |
| paper-2 | 96.5% 0.005 230 | 17% 0.014 235 | cards, wells |
| paper-3 | 93.5% 0.007 230 | 21% 0.016 235 | hover, chips, secondary buttons |
| ink | 22% 0.015 235 | 95% 0.006 230 | headings, body |
| ink-2 | 36% 0.015 235 | 82% 0.012 230 | running text on the landing |
| ink-muted | 50% 0.016 235 | 66% 0.016 230 | captions, meta |
| rule | 89% 0.007 230 | 27% 0.014 235 | hairlines, card frames |
| field-edge | 62% 0.012 230 | 52% 0.016 232 | input borders (3:1 against paper) |
| accent-text | 48% 0.14 135 | 89% 0.19 126 | primary action, links, focus, selection |
| accent-on | 98.5% 0.01 126 | 19% 0.04 126 | text on the accent fill |
| signal | 89% 0.19 126 | 89% 0.19 126 | found, live: the ten, a live row, a switch that is on |
| error | 52% 0.18 27 | 72% 0.15 27 | errors and destructive actions |

Contrast, measured: every text pair passes WCAG AA in both colourways; the tightest are accent-text on paper-3 in light (5.15:1) and ink-muted on paper-3 in dark (5.71:1). Input edges are 3.3:1 or more against their surface.

Lime marks only what is found, live or primary. Never a heading, never a fill larger than a pill.

## Type
- Geologica, one family. Display: weight 300, `"SHRP" 100` (sharpened corners), tracking -0.035em, line-height 1.0 to 1.05, sentence case. Body: weight 300 on the landing at 17px, 400 in the app.
- Figures: tabular numerals, weight 400; a unit after its figure, a step smaller, in ink-muted.
- Labels, captions and table heads: the body face a step smaller, sentence case, untracked. Never tracked capitals, never monospace except for code.
- Landing scale (fluid, capped): display 44 to 84px, section 32 to 56px, title 20 to 26px, lead 18 to 22px, body 16 to 17px, caption 14px. App screens keep Tailwind's compact scale.

## Space and layout
- 4px base. Landing: one container capped at 1440px with 64px gutters (24px under 60rem, 16px under 40rem), twelve columns 32px apart. Section gaps 120, 144 and 176px, mixed.
- Breakpoints checked: 375, 768, 1280, 1440 and 1920. No horizontal scroll at any width.

## Shape and depth
- Frames are hairlines (1px rule). Radius: 2px small controls, 4px inputs and frames, 6px cards. Buttons and tags are pills.
- Flat: no shadows. A measured thing is framed by corner ticks (10px), not a full box.

## Controls
- Primary: accent fill, accent-on text, pill, 48px on the landing and 36px in the app with a 44px hit area.
- Secondary: a hairline pill in rule-2 with ink text.
- Focus: 2px accent ring, 2px offset, on every interactive element, instant.

## Motion
- Character: calm. Durations 120, 220 and 420ms; easing cubic-bezier(0.16, 1, 0.3, 1). Animate transform and opacity only.
- The radar sweep is the only continuous motion. It pauses off screen, and under reduced motion it is one still frame with the ten already found.
- No scroll reveals.

## Content
- Lead with the outcome. Every number is real and carries its measurement date. No placeholder copy, no invented figures, quotes or logos.
- Every data view has loading, empty, error and full states.

## Decisions
- 2026-10-31: replaced the Apple-restraint system (teal, Inter, 12 and 20px radius, one soft shadow). It was correct but read as a template. Vantage gives the product a subject of its own: the radar it is named after.
- Accent: lime (Vantage's signal) in dark; a darker green in light so the accent can carry text on light surfaces.
- Theme: the app follows the system setting, with a manual toggle in the app header that persists in localStorage. The landing page is dark only; its material is the night radar.
- Font: Geologica replaces Inter. Inter as a display face is the most common generated look.

## Exports
The Hallmark scaffold for this system is Vantage (`theme.mjs scaffold vantage`). The landing stylesheet carries the Hallmark stamp in its first lines.
