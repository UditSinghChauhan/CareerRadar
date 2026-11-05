#!/usr/bin/env node
/**
 * Hover, press and focus-visible on every interactive element of a page.
 *
 *   node scripts/audit-states.mjs <base-url> [path ...]
 *
 * Run against the capture dev server (career-radar/capture/), whose Clerk
 * stand-in is signed in, so app pages render without Clerk keys; the
 * landing is opened signed out. For each visible, enabled, non-inert link,
 * button or other tab stop it:
 *
 *   - focus:  reaches it with the Tab key and reads the focus ring
 *             (outline, or a box-shadow ring) while :focus-visible holds;
 *   - hover:  moves the mouse onto it and diffs the computed colour,
 *             background, border, shadow, decoration, opacity and
 *             transform against rest, on it and its first few descendants
 *             (marked "inner");
 *   - press:  holds the mouse button down and reads the transform (the
 *             design's press is scale(0.98)), then moves off before letting
 *             go, so nothing is activated.
 *
 * Writes docs/screenshots/states/report.json and a crop of each focused
 * element, and prints a table.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { chromium } = require("@playwright/test");

const [base = "http://localhost:5198", ...paths] = process.argv.slice(2);
const pages = paths.length ? paths : ["/", "/welcome", "/dashboard"];
const out = join(root, "docs/screenshots/states");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const PROPS = [
  "color",
  "backgroundColor",
  "borderColor",
  "boxShadow",
  "textDecorationLine",
  "textDecorationColor",
  "opacity",
  "transform",
  "scale",
  "translate",
];

async function audit(browser, path) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  await ctx.addInitScript((signedOut) => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("capture-signed-in", signedOut ? "0" : "1");
  }, path === "/");
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // Every tab stop, in order, tagged so it can be found again.
  const count = await page.evaluate(() => {
    const sel =
      'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"], [role="radio"], [role="switch"], [role="tab"]';
    let n = 0;
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const hidden =
        r.width === 0 ||
        r.height === 0 ||
        el.closest("[inert], [aria-hidden='true']") ||
        el.disabled ||
        getComputedStyle(el).visibility === "hidden";
      if (hidden) continue;
      el.setAttribute("data-audit", String(n++));
    }
    return n;
  });

  const rows = [];
  for (let i = 0; i < count; i++) {
    const loc = page.locator(`[data-audit="${i}"]`);
    const name = await loc.evaluate((el) =>
      (
        el.getAttribute("aria-label") ||
        el.textContent ||
        el.getAttribute("title") ||
        el.tagName
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 48),
    );
    // The element and its first few descendants: a hover is often drawn
    // on an inner row or an icon.
    const read = () =>
      loc.evaluate((el, props) => {
        const nodes = [el, ...el.querySelectorAll("*")].slice(0, 6);
        const out = {};
        nodes.forEach((n, k) => {
          const cs = getComputedStyle(n);
          for (const p of props) out[k ? `${p}@${k}` : p] = cs[p];
        });
        return out;
      }, PROPS);

    // Focus, by keyboard: focus the one before it, then Tab.
    await page.mouse.move(1, 1);
    await page.evaluate((k) => {
      document.activeElement?.blur();
      const prev = document.querySelector(`[data-audit="${k - 1}"]`);
      prev?.focus({ preventScroll: true });
    }, i);
    await page.keyboard.press("Tab");
    const focus = await loc.evaluate((el) => {
      const active = document.activeElement === el;
      const cs = getComputedStyle(el);
      const outline =
        cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0
          ? `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} +${cs.outlineOffset}`
          : "";
      const ring = cs.boxShadow && cs.boxShadow !== "none" ? cs.boxShadow : "";
      return {
        active,
        visible: el.matches(":focus-visible"),
        ring: outline || ring,
      };
    });
    if (focus.active) {
      await loc.scrollIntoViewIfNeeded();
      const box = await loc.boundingBox();
      if (box) {
        const x = Math.max(0, box.x - 12);
        const y = Math.max(0, box.y - 12);
        const width = Math.min(box.width + 24, 1440 - x);
        const height = Math.min(box.height + 24, 900 - y);
        if (width > 0 && height > 0) {
          await page.screenshot({
            path: join(out, `${path.replace(/\W+/g, "_") || "_"}-${i}.png`),
            clip: { x, y, width, height },
          });
        }
      }
    }
    await page.evaluate(() => document.activeElement?.blur());

    // Hover.
    await loc.scrollIntoViewIfNeeded();
    await page.mouse.move(1, 1);
    await page.waitForTimeout(250);
    const rest = await read();
    const box = await loc.boundingBox();
    let hover = [];
    let press = "";
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.waitForTimeout(300);
      const over = await read();
      hover = [
        ...new Set(
          Object.keys(over)
            .filter((k) => over[k] !== rest[k])
            .map((k) => (k.includes("@") ? `${k.split("@")[0]} (inner)` : k)),
        ),
      ];
      // Press, then slide off before releasing so nothing activates.
      await page.mouse.down();
      await page.waitForTimeout(200);
      const down = await read();
      press =
        down.scale !== over.scale && down.scale !== "none"
          ? `scale ${down.scale}`
          : down.transform !== over.transform && down.transform !== "none"
            ? down.transform
            : "";
      await page.mouse.move(1, 1);
      await page.mouse.up();
      await page.keyboard.press("Escape");
    }
    rows.push({
      path,
      i,
      name,
      focusRing:
        focus.active && focus.visible
          ? focus.ring || "(none)"
          : "(not reached)",
      hover: hover.join(", ") || "(none)",
      press: press || "(none)",
    });
  }
  await ctx.close();
  return rows;
}

async function main() {
  const browser = await chromium.launch();
  const all = [];
  try {
    for (const path of pages) all.push(...(await audit(browser, path)));
  } finally {
    await browser.close();
  }
  writeFileSync(join(out, "report.json"), JSON.stringify(all, null, 2) + "\n");
  for (const r of all) {
    console.log(
      [
        r.path,
        r.name.padEnd(40),
        r.focusRing.slice(0, 44).padEnd(44),
        r.hover.padEnd(28),
        r.press,
      ].join(" | "),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
