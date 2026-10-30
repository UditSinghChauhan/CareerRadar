# DESIGN.md: CareerRadar

Direction: quiet, precise, product-first. Apple-like restraint in structure and motion, with an original palette and type. No gradients, no decorative icons, no glass effects beyond the nav.

## Color (tokens)
| Token | Light | Dark | Role |
|---|---|---|---|
| bg | #FFFFFF | #000000 | page |
| surface | #F5F5F7 | #1C1C1E | alternating sections, cards |
| text | #1D1D1F | #F5F5F7 | headings, body |
| text-muted | #6E6E73 | #A1A1A6 | captions, meta |
| accent | #0E7C66 | #3FB89C | single action color, links, focus |
| on-accent | #FFFFFF | #000000 | text on accent fill |
| border | #D2D2D7 | #38383A | dividers |

Contrast: all text pairs meet WCAG AA (4.5:1 body, 3:1 large). Verify with the accessibility-review skill before merge.

## Type
- Family: Inter (display optical size for headlines), fallback system-ui. Not SF Pro.
- Scale (desktop / mobile):
  - display: 64 / 40, line 1.05, tracking -0.03em
  - h2: 44 / 32, line 1.1, tracking -0.02em
  - h3: 24 / 20, line 1.3
  - body: 19 / 17, line 1.5
  - caption: 14 / 13, line 1.4, text-muted
- Max line length: 680px for body text.

## Spacing and layout
- 4px base grid. Section padding: 120px desktop, 80px tablet, 64px mobile.
- Content width: 1200px. Text width: 680px.
- Breakpoints: 375 (mobile), 768 (tablet), 1280 (desktop). Every screen is checked at all three.

## Shape and depth
- Radius: 12px (inputs, small cards), 20px (cards), 999px (buttons, tags).
- One shadow only: 0 10px 30px rgba(0,0,0,0.08). Dark mode uses a 1px border instead.

## Motion
- Duration 200–400ms. Easing cubic-bezier(0.22, 1, 0.36, 1).
- Animate only opacity and transform. Reveal sections on scroll (opacity, translateY 24px).
- prefers-reduced-motion disables all reveal motion.

## Components
- Nav: sticky, 56px high, translucent surface with 20px backdrop blur.
- Hero: one headline, one line of support text, one primary action, one product image.
- Feature section: alternates surface and bg backgrounds. One idea per section.
- Button primary: accent fill with the on-accent token. Light: #FFFFFF on #0E7C66 (5.1:1). Dark: #000000 on #3FB89C (8.5:1).
- Button secondary: text-only link with an arrow.
- Focus: 2px accent ring, 2px offset, on every interactive element.
- Every data view has empty, loading, error, and success states.

## Content
- Lead each section with the outcome, not the feature.
- Use real numbers with their date. Example: "4,512 postings ranked daily (measured 2026-09-16)."
- No placeholder copy. No marketing adjectives without evidence.

## Decisions
- Accent: teal #0E7C66 (light) and #3FB89C (dark). Single accent for all actions, links, and focus. Chosen for contrast, and for standing out from the default blue used on most portfolio sites.
- Theme: follows the system setting by default. A manual light/dark toggle sits in the nav and persists in localStorage. Light is the fallback when the system has no preference. Both themes are designed and verified, not derived by inverting colors.
