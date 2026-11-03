// WCAG 2.x contrast for the "Field to focus" tokens in DESIGN.md (2026-11-03).
// Run: node docs/screenshots/landing-v3/contrast.mjs
const T = {
  canvas: "#f6f6f3",
  surface: "#ffffff",
  wash: "#efefea",
  ink: "#111111",
  "ink-2": "#3a3a37",
  grey: "#6b6b66",
  "grey-lg": "#8a8a85",
  green: "#316b17",
  lime: "#bcf053",
  band: "#0c0d0b",
  "band-ink": "#f5f5f3",
  "monogram sky": "#2b4a6b",
  "tile sky": "#e6eef7",
  "monogram sand": "#6b4e1f",
  "tile sand": "#f2eadb",
  "monogram rose": "#7a3434",
  "tile rose": "#f4e4e4",
};

const lin = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum, where]
const PAIRS = [
  ["ink", "canvas", 4.5, "headings, body"],
  ["ink", "surface", 4.5, "card text"],
  ["ink-2", "wash", 4.5, "reason chips"],
  ["grey", "canvas", 4.5, "grey text under 24px"],
  ["grey", "surface", 4.5, "card meta"],
  ["grey", "wash", 4.5, "URL in the browser bar"],
  ["grey-lg", "canvas", 3, "statements' second tone, 24px+ only"],
  ["grey-lg", "surface", 3, "large grey on white"],
  ["green", "canvas", 4.5, "links"],
  ["green", "surface", 3, "focus ring, check (non-text)"],
  ["surface", "ink", 4.5, "primary button label"],
  ["ink", "lime", 4.5, "rank tag, lime button label"],
  ["band-ink", "band", 4.5, "dark band heading"],
  ["lime", "band", 3, "found roles, focus ring in the band"],
  ["monogram sky", "tile sky", 4.5, "monogram"],
  ["monogram sand", "tile sand", 4.5, "monogram"],
  ["monogram rose", "tile rose", 4.5, "monogram"],
];

console.log("| Pair | Where | Min | Ratio |\n|---|---|---|---|");
let failed = false;
for (const [fg, bg, min, where] of PAIRS) {
  const r = ratio(T[fg], T[bg]);
  if (r < min) failed = true;
  console.log(
    `| ${fg} on ${bg} | ${where} | ${min} | ${r.toFixed(2)}${r >= min ? "" : " FAIL"} |`,
  );
}
process.exit(failed ? 1 : 0);
