#!/usr/bin/env node
/**
 * Frame-by-frame evidence for the "Field to focus" flight (flight.tsx).
 *
 *   node scripts/capture-focus-frames.mjs <before|after> [landing-url] [step] [WxH] [to]
 *
 * By default at 1440x900 it scrolls from 0 to 1200 in 50px steps. At each step it
 * saves a screenshot and measures, from the DOM, the faults the flight must
 * never show:
 *
 *   - overlap: two visible flying cards whose boxes intersect;
 *   - copy:    a visible flying card over a visible line of hero copy
 *              (headline, lead, Get started, "Free and open source");
 *   - empty:   the frame of "Today's ten" visible with no row shown and no
 *              card in it;
 *   - smear:   a card half faded over another card's visible row;
 *   - ghost:   any flying card still showing once every row is home, or a
 *              field card or flying copy still showing beside its own
 *              finished row;
 *   - centre:  the statement beside the list, its centre more than 24px
 *              from the list's, when the whole list is on screen;
 *   - band:    the statement, wholly on screen, more than 24px below the
 *              centre of the part of the list on screen (an empty band
 *              above it).
 *
 * Writes the frames (WebP), a contact strip (strip.png; both need ffmpeg)
 * and report.json to docs/screenshots/focus-frames/<phase>/.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { chromium } = require("@playwright/test");

const [
  phase = "after",
  url = "http://localhost:5198/",
  stepArg = "50",
  size = "1440x900",
  toArg = "1200",
] = process.argv.slice(2);
const step = Number(stepArg);
const to = Number(toArg);
const [vw, vh] = size.split("x").map(Number);
const out = join(root, "docs/screenshots/focus-frames", phase);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

/** Runs in the page: every fault in the current frame. */
function measure() {
  const VISIBLE = 0.04;
  const eff = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement)
      o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const vh = window.innerHeight;
  const onScreen = (r) => r.bottom > 0 && r.top < vh && r.width > 0;
  const hit = (a, b, pad = 0) =>
    a.left < b.right + pad &&
    a.right > b.left - pad &&
    a.top < b.bottom + pad &&
    a.bottom > b.top - pad;

  const flying = [...document.querySelectorAll(".lp-flight__card")].map(
    (el, i) => {
      const card = el.querySelector(".lp-rolecard") ?? el;
      return { rank: i + 1, o: eff(el), r: card.getBoundingClientRect() };
    },
  );
  const shown = flying.filter((f) => f.o > VISIBLE && onScreen(f.r));
  const faults = [];

  for (let i = 0; i < shown.length; i++)
    for (let j = i + 1; j < shown.length; j++)
      if (hit(shown[i].r, shown[j].r))
        faults.push(`overlap ${shown[i].rank}/${shown[j].rank}`);

  const copy = [
    ["headline", ".lp-hero .lp-display"],
    ["lead", ".lp-hero .lp-lead"],
    ["cta", ".lp-hero .lp-btn"],
    ["oss", ".lp-hero .lp-quiet"],
  ];
  for (const [name, sel] of copy) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (!onScreen(r) || eff(el) < VISIBLE) continue;
    for (const f of shown)
      if (hit(f.r, r)) faults.push(`copy ${name} under ${f.rank}`);
  }

  const queue = document.querySelector(".lp-queue");
  const qr = queue?.getBoundingClientRect();
  const rows = [...document.querySelectorAll("[data-fly-dst]")].map((el) => ({
    o: eff(el),
    r: el.getBoundingClientRect(),
  }));
  // The card's surface; before this change the card was its own surface.
  const frame = document.querySelector(".lp-queue__frame") ?? queue;
  if (
    qr &&
    qr.top < vh * 0.85 &&
    qr.bottom > vh * 0.15 &&
    eff(frame) > VISIBLE
  ) {
    const anyRow = rows.some((x) => x.o > VISIBLE);
    const anyIn = shown.some((f) => hit(f.r, qr));
    if (!anyRow && !anyIn) faults.push("empty queue");
  }

  // A fading card over another card's visible row smears the two together.
  for (const f of flying) {
    if (f.o <= VISIBLE || f.o >= 0.96) continue;
    rows.forEach((row, i) => {
      if (i + 1 !== f.rank && row.o > VISIBLE && hit(f.r, row.r, -4))
        faults.push(`smear ${f.rank} on row ${i + 1}`);
    });
  }

  const slots = [...document.querySelectorAll("[data-fly-src]")].map((el) => ({
    rank: Number(el.getAttribute("data-fly-src")),
    o: eff(el),
  }));
  // Once every row is home, nothing of the flight may remain.
  if (rows.length && rows.every((r) => r.o > 0.99)) {
    for (const f of flying)
      if (f.o > 0.01) faults.push(`ghost flying ${f.rank}`);
  }
  // A card whose row is fully shown must have left the field completely.
  rows.forEach((row, i) => {
    const s = slots.find((x) => x.rank === i + 1);
    if (row.o > 0.99 && s && s.o > 0.01) faults.push(`ghost field ${i + 1}`);
    const f = flying[i];
    if (row.o > 0.99 && f && f.o > 0.01) faults.push(`ghost double ${i + 1}`);
  });

  // The statement beside the list: centred on it when the whole list is
  // on screen, and never low with an empty band above it while the list
  // is coming into view.
  const text = document.querySelector(".lp-focus__text");
  let centreGap = null;
  const tb = text?.getBoundingClientRect();
  // Only where the statement stands beside the list (1024px and wider).
  if (tb && qr && tb.right <= qr.left && qr.top < vh && qr.bottom > 64) {
    const tc = (tb.top + tb.bottom) / 2;
    const vis = (Math.max(qr.top, 64) + Math.min(qr.bottom, vh)) / 2;
    centreGap = Math.round(tc - (qr.top + qr.bottom) / 2);
    if (qr.top >= 64 && qr.bottom <= vh && Math.abs(centreGap) > 24)
      faults.push(`centre ${centreGap}px`);
    // Judged once the statement itself is wholly on screen.
    if (tb.bottom <= vh && tc - vis > 24)
      faults.push(`band ${Math.round(tc - vis)}px`);
  }
  return {
    faults,
    flying: shown.map((f) => ({ rank: f.rank, o: +f.o.toFixed(2) })),
    centreGap,
  };
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: vw, height: vh },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  // The capture dev server's Clerk stand-in is signed in unless told not to.
  await ctx.addInitScript(() => localStorage.setItem("capture-signed-in", "0"));
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  const report = [];
  const frames = [];
  for (let y = 0; y <= to; y += step) {
    await p.evaluate((v) => window.scrollTo(0, v), y);
    // Two frames for the flight's rAF, then let framer-motion settle.
    await p.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    await p.waitForTimeout(250);
    // Frames for the strip every 50px; finer steps are measured only.
    if (y % 50 === 0) {
      const name = `y${String(y).padStart(4, "0")}.png`;
      await p.screenshot({ path: join(out, name) });
      frames.push(name);
    }
    const m = await p.evaluate(measure);
    report.push({ y, ...m });
    console.log(
      `${String(y).padStart(4)}  ${m.faults.length ? m.faults.join(", ") : "clean"}`,
    );
  }
  await browser.close();
  writeFileSync(
    join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  const dirty = report.filter((r) => r.faults.length).length;
  console.log(
    `${phase}: ${report.length - dirty} of ${report.length} frames clean`,
  );

  // A strip of every frame, 5 across, labelled with its scroll position.
  try {
    execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-framerate",
        "1",
        "-pattern_type",
        "glob",
        "-i",
        join(out, "y*.png"),
        "-vf",
        "scale=480:-1,tile=5x5:padding=6:color=white",
        "-frames:v",
        "1",
        join(out, "strip.png"),
      ],
      { stdio: "inherit" },
    );
    // Keep the frames light: WebP instead of PNG, about a fifth the size.
    for (const name of frames) {
      execFileSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        join(out, name),
        "-c:v",
        "libwebp",
        "-quality",
        "82",
        join(out, name.replace(/\.png$/, ".webp")),
      ]);
      rmSync(join(out, name));
    }
  } catch {
    console.warn("ffmpeg not available: no strip.png, frames kept as PNG");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
