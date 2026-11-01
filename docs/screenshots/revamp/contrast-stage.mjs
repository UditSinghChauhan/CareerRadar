// WCAG 2.x contrast for the dark stage tokens in DESIGN.md (2026-11-01).
// Run: node docs/screenshots/revamp/contrast-stage.mjs
import { ratio, hex } from "../landing-redesign/contrast.mjs";

const T = {
  stage: "oklch(13% 0.004 130)",
  "stage-2": "oklch(16.5% 0.005 130)",
  surface: "oklch(19% 0.006 130)",
  "surface-2": "oklch(24% 0.007 130)",
  ink: "oklch(97% 0 0)",
  "ink-2": "oklch(82% 0 0)",
  muted: "oklch(66% 0 0)",
  signal: "oklch(89% 0.19 126)",
  "signal-on": "oklch(19% 0.04 126)",
};
const PAIRS = [
  ["ink", "stage", 4.5],
  ["ink", "surface", 4.5],
  ["ink-2", "stage", 4.5],
  ["ink-2", "surface", 4.5],
  ["muted", "stage", 4.5],
  ["muted", "stage-2", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "surface-2", 4.5],
  ["signal", "stage", 4.5],
  ["signal", "surface", 4.5],
  ["signal-on", "signal", 4.5],
];
console.log("| Pair | Min | Ratio |\n|---|---|---|");
for (const [fg, bg, min] of PAIRS) {
  const r = ratio(T[fg], T[bg]);
  console.log(
    `| ${fg} on ${bg} | ${min} | ${r.toFixed(2)}${r >= min ? "" : " FAIL"} |`,
  );
}
console.log(
  Object.entries(T)
    .map(([k, v]) => `${k} ${hex(v)}`)
    .join(", "),
);
