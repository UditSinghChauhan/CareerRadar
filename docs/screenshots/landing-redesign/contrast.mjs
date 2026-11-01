// Measures WCAG 2.x contrast for every text and control pair in the landing
// token sets proposed in DESIGN.md. Run: node docs/screenshots/landing-redesign/contrast.mjs
// Colours are OKLCH, converted to sRGB with Björn Ottosson's matrices and
// clamped to the sRGB gamut (the clamp is reported when it happens).

const oklchToSrgb = (L, C, h) => {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const clipped = lin.some((v) => v < -1e-4 || v > 1 + 1e-4);
  const enc = (v) => {
    v = Math.min(1, Math.max(0, v));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  };
  return { rgb: lin.map(enc), clipped };
};

const parse = (s) => {
  const m = s.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/);
  if (!m) throw new Error(`Not an oklch() value: ${s}`);
  return oklchToSrgb(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
};

const luminance = ([r, g, b]) => {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

export const ratio = (fg, bg) => {
  const [a, b] = [luminance(parse(fg).rgb), luminance(parse(bg).rgb)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

export const hex = (s) =>
  "#" +
  parse(s)
    .rgb.map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

// ─── Token sets ──────────────────────────────────────────────────────────────

export const SETS = {
  // Incumbent: landing.css (dark) and DESIGN.md's app light colourway.
  vantage: {
    light: {
      bg: "oklch(98.5% 0.003 230)",
      surface: "oklch(96.5% 0.005 230)",
      "surface-2": "oklch(93.5% 0.007 230)",
      ink: "oklch(22% 0.015 235)",
      "ink-2": "oklch(36% 0.015 235)",
      muted: "oklch(50% 0.016 235)",
      rule: "oklch(89% 0.007 230)",
      "field-edge": "oklch(62% 0.012 230)",
      accent: "oklch(48% 0.14 135)",
      "accent-on": "oklch(98.5% 0.01 126)",
      signal: "oklch(89% 0.19 126)",
    },
    dark: {
      bg: "oklch(13.5% 0.012 235)",
      surface: "oklch(17% 0.014 235)",
      "surface-2": "oklch(21% 0.016 235)",
      ink: "oklch(95% 0.006 230)",
      "ink-2": "oklch(82% 0.012 230)",
      muted: "oklch(66% 0.016 230)",
      rule: "oklch(27% 0.014 235)",
      "field-edge": "oklch(52% 0.016 232)",
      accent: "oklch(89% 0.19 126)",
      "accent-on": "oklch(19% 0.04 126)",
      signal: "oklch(89% 0.19 126)",
    },
  },
  // Proposed: neutral chrome (no hue), so the only colour is the product's.
  neutral: {
    light: {
      bg: "oklch(100% 0 0)",
      surface: "oklch(97.2% 0 0)",
      "surface-2": "oklch(94.5% 0 0)",
      ink: "oklch(21% 0 0)",
      "ink-2": "oklch(38% 0 0)",
      muted: "oklch(50.5% 0 0)",
      rule: "oklch(91% 0 0)",
      "field-edge": "oklch(62% 0 0)",
      accent: "oklch(47% 0.13 138)",
      "accent-on": "oklch(100% 0 0)",
      signal: "oklch(52% 0.15 135)",
    },
    dark: {
      bg: "oklch(14.5% 0 0)",
      surface: "oklch(18.5% 0 0)",
      "surface-2": "oklch(23% 0 0)",
      ink: "oklch(96.5% 0 0)",
      "ink-2": "oklch(83% 0 0)",
      muted: "oklch(68% 0 0)",
      rule: "oklch(28% 0 0)",
      "field-edge": "oklch(55% 0 0)",
      accent: "oklch(89% 0.19 126)",
      "accent-on": "oklch(19% 0.04 126)",
      signal: "oklch(89% 0.19 126)",
    },
  },
};

// [foreground, background, minimum, what it is]
// 4.5 = body text (WCAG 1.4.3); 3 = large text, focus ring, control edge or
// data mark (WCAG 1.4.11).
const PAIRS = [
  ["ink", "bg", 4.5, "headings, body"],
  ["ink", "surface", 4.5, "body on a section band"],
  ["ink", "surface-2", 4.5, "body on a card or the walkthrough frame"],
  ["ink-2", "bg", 4.5, "supporting copy"],
  ["ink-2", "surface", 4.5, "supporting copy on a band"],
  ["muted", "bg", 4.5, "captions, meta"],
  ["muted", "surface", 4.5, "captions on a band"],
  ["muted", "surface-2", 4.5, "captions on a card"],
  ["accent", "bg", 4.5, "link text"],
  ["accent", "surface", 4.5, "link text on a band"],
  ["accent", "surface-2", 4.5, "link text on a card"],
  ["accent-on", "accent", 4.5, "label on the primary button"],
  ["accent", "bg", 3, "focus ring, primary button edge"],
  ["accent", "surface-2", 3, "focus ring on a card"],
  ["field-edge", "bg", 3, "secondary button and toggle edge"],
  ["field-edge", "surface", 3, "control edge on a band"],
  ["signal", "bg", 3, "radar: a found role (data mark)"],
  ["signal", "surface", 3, "rank badge fill on a band"],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [setName, themes] of Object.entries(SETS)) {
    console.log(`\n### ${setName}\n`);
    console.log(
      "| Pair | Use | Min | Light | | Dark | |\n|---|---|---|---|---|---|---|",
    );
    for (const [fg, bg, min, use] of PAIRS) {
      const cells = ["light", "dark"].map((t) => {
        const r = ratio(themes[t][fg], themes[t][bg]);
        return `${r.toFixed(2)}:1 | ${r >= min ? "pass" : "**FAIL**"}`;
      });
      console.log(
        `| ${fg} on ${bg} | ${use} | ${min}:1 | ${cells.join(" | ")} |`,
      );
    }
    for (const t of ["light", "dark"]) {
      const clipped = Object.entries(themes[t])
        .filter(([, v]) => parse(v).clipped)
        .map(([k]) => k);
      const hexes = Object.entries(themes[t])
        .map(([k, v]) => `${k} ${hex(v)}`)
        .join(", ");
      console.log(`\n${t}: ${hexes}`);
      if (clipped.length)
        console.log(`${t}: clamped to sRGB: ${clipped.join(", ")}`);
    }
  }
  // Lime on white, the case the brief calls out.
  const lime = SETS.vantage.dark.accent;
  console.log(
    `\nLime ${hex(lime)} on white: ${ratio(lime, "oklch(100% 0 0)").toFixed(2)}:1`,
  );
}
