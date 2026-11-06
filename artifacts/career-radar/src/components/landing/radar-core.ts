/**
 * The radar, drawn once on the page: in the closing dark band.
 *
 * One point per active posting at the committed scale (COMMITTED_STATS in
 * use-public-stats.ts). Eligible postings sit nearer the centre, the rest
 * drift to the edge, and the ten roles of a day's queue are lit. Positions
 * come from a fixed seed, so every visitor sees the same field.
 */
import { COMMITTED_STATS, QUEUE_SIZE } from "./use-public-stats";

export const RADAR_COUNTS = {
  total: COMMITTED_STATS.activePostings,
  eligible: COMMITTED_STATS.openToFreshers,
  found: QUEUE_SIZE,
};

export const TAU = Math.PI * 2;

export type Point = {
  x: number;
  y: number;
  /** Distance from the centre, 0 to 1. */
  r: number;
  angle: number;
  /** 0: not open to freshers. 1: eligible, outer. 2: eligible, inner. */
  tone: 0 | 1 | 2;
  size: number;
  found: boolean;
  /** Rank 1 to 10 for found roles: nearest the centre ranks first. */
  rank: number;
  /** Fades the outermost points into the stage. */
  fade: number;
};

/** mulberry32: a small seeded generator, so the field is identical on every load. */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cached: Point[] | null = null;

export function buildField(): Point[] {
  if (cached) return cached;
  const rand = seeded(20260916);
  const raw: Omit<Point, "rank">[] = [];
  const place = (rMin: number, rMax: number, bias: number) => {
    const angle = rand() * TAU;
    const r = rMin + (rMax - rMin) * Math.pow(rand(), bias);
    return { angle, r, x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  };
  const fadeAt = (r: number) => 1 - Math.max(0, r - 0.8) * 3;
  for (let i = 0; i < RADAR_COUNTS.total - RADAR_COUNTS.eligible; i++) {
    const p = place(0.42, 1, 0.75);
    raw.push({
      ...p,
      tone: 0,
      size: 1 + rand() * 0.6,
      found: false,
      fade: fadeAt(p.r),
    });
  }
  for (let i = 0; i < RADAR_COUNTS.eligible - RADAR_COUNTS.found; i++) {
    const p = place(0.02, 0.92, 1.25);
    raw.push({
      ...p,
      tone: p.r < 0.5 ? 2 : 1,
      size: 1.2 + rand() * 0.8,
      found: false,
      fade: fadeAt(p.r),
    });
  }
  for (let i = 0; i < RADAR_COUNTS.found; i++) {
    const angle = rand() * TAU;
    const r = 0.06 + Math.pow(rand(), 0.8) * 0.3;
    raw.push({
      angle,
      r,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      tone: 2,
      size: 3.2,
      found: true,
      fade: 1,
    });
  }
  // Orientation carries no data, so turn the field until the ten found roles
  // face up, where a radar that fades at its lower edge keeps them in view.
  const found = raw.filter((p) => p.found);
  const centroid = Math.atan2(
    found.reduce((s, p) => s + p.y, 0),
    found.reduce((s, p) => s + p.x, 0),
  );
  const turn = -Math.PI / 2 - centroid;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const ranks = new Map(
    found
      .map((p) => p)
      .sort((a, b) => a.r - b.r)
      .map((p, i) => [p, i + 1] as const),
  );
  cached = raw.map((p) => ({
    ...p,
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
    angle: (((p.angle + turn) % TAU) + TAU) % TAU,
    rank: ranks.get(p) ?? 0,
  }));
  return cached;
}

/** The found roles in rank order. */
export function foundInRank(points: Point[]): Point[] {
  return points.filter((p) => p.found).sort((a, b) => a.rank - b.rank);
}

/** Ring radii as a fraction of the disc, outermost first. */
export const RING_FRACTIONS = [1, 0.66, 0.33] as const;

export type Palette = {
  point: string;
  rule: string;
  signal: string;
};

export function readPalette(el: Element): Palette {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    point: v("--lp-ink", "#f5f5f5"),
    rule: v("--lp-ring", "rgba(255,255,255,0.14)"),
    signal: v("--lp-signal", "#bcf053"),
  };
}

/** Sizes a canvas's backing store to its box. Returns CSS-pixel size. */
export function fitCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  // Large canvases draw at 1.5x at most: the points are soft squares, and
  // fewer pixels keeps every frame well under a 60fps budget on a phone.
  const big = rect.width * rect.height > 500_000;
  const dpr = Math.min(window.devicePixelRatio || 1, big ? 1.5 : 2);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return { w: rect.width, h: rect.height, dpr };
}

export type FieldFrame = {
  cx: number;
  cy: number;
  R: number;
  /** 0 to 1 per ring, outermost first: how much of each circle is drawn. */
  rings: readonly number[];
  /**
   * The radius (as a fraction of R) out to which points have appeared, for
   * the load sequence; points fade in over a soft edge. Omit for all.
   */
  revealRadius?: number;
  /** Opacity of the whole point field. */
  alpha?: number;
  /** The sweep's angle, or null for no sweep. */
  sweep: number | null;
  /** 0 to 1: how far the ineligible field has dimmed (chapter beat 2). */
  dimOuter?: number;
  /** Radius multiplier for the rings and every point but the found ones (chapter beat 2). */
  contract?: number;
  /** 0 to 1 per rank (index rank - 1): how lit each found role is. */
  lit: readonly number[];
  /** 0 to 1 per rank: a glow pulse on top of `lit`. */
  pulse?: readonly number[];
};

type Layer = HTMLCanvasElement;
const layers = new Map<string, Layer>();

/**
 * The field's points pre-drawn once per size into an offscreen layer:
 * "outer" holds the postings a fresher cannot apply to, "inner" the rest.
 * Each frame then draws a layer or two instead of 4,500 squares, which is
 * what keeps the sweep and the scrubbed chapter at 60fps on a phone.
 */
function layer(
  points: Point[],
  colour: string,
  R: number,
  dpr: number,
  which: "outer" | "inner",
): Layer {
  const key = `${which}|${Math.round(R)}|${dpr}|${colour}`;
  const hit = layers.get(key);
  if (hit) return hit;
  if (layers.size > 12) layers.clear();
  const c = document.createElement("canvas");
  const px = Math.ceil(2 * R * dpr) + 2;
  c.width = c.height = px;
  const g = c.getContext("2d");
  if (g) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = colour;
    const scale = Math.max(0.8, R / 300);
    for (const p of points) {
      if (p.found || (which === "outer") !== (p.tone === 0)) continue;
      const base = p.tone === 0 ? 0.24 : p.tone === 1 ? 0.42 : 0.66;
      const a = base * p.fade;
      if (a <= 0.01) continue;
      g.globalAlpha = a;
      const s = p.size * scale * 0.8;
      g.fillRect(R + p.x * R - s / 2, R + p.y * R - s / 2, s, s);
    }
  }
  layers.set(key, c);
  return c;
}

/** Draws one frame of the field. Pure: everything it shows comes from `f`. */
export function drawField(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  pal: Palette,
  f: FieldFrame,
) {
  const { cx, cy, R } = f;
  const dpr = ctx.getTransform().a || 1;
  const scale = Math.max(0.8, R / 300);
  const dim = f.dimOuter ?? 0;
  const contract = f.contract ?? 1;
  const alpha = f.alpha ?? 1;

  // Rings, drawn clockwise from the top as they come in.
  ctx.strokeStyle = pal.rule;
  ctx.lineWidth = 1;
  ctx.globalAlpha = alpha;
  RING_FRACTIONS.forEach((frac, i) => {
    const k = f.rings[i] ?? 1;
    if (k <= 0) return;
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      R * frac * contract - 0.5,
      -Math.PI / 2,
      -Math.PI / 2 + TAU * k,
    );
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  // The sweep: a lime wedge trailing the beam.
  if (f.sweep !== null && "createConicGradient" in ctx) {
    const g = ctx.createConicGradient(f.sweep - TAU * 0.16, cx, cy);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.155, withAlpha(pal.signal, 0.1));
    g.addColorStop(0.16, withAlpha(pal.signal, 0.22));
    g.addColorStop(0.161, "transparent");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
  }

  const outer = layer(points, pal.point, R, dpr, "outer");
  const inner = layer(points, pal.point, R, dpr, "inner");
  const d = 2 * R * contract;
  const x = cx - R * contract;
  const y = cy - R * contract;
  const reveal = f.revealRadius;

  if (reveal === undefined) {
    ctx.globalAlpha = alpha * (1 - dim);
    if (ctx.globalAlpha > 0.01) ctx.drawImage(outer, x, y, d, d);
    ctx.globalAlpha = alpha;
    ctx.drawImage(inner, x, y, d, d);
    // Beat 2: the eligible field brightens as the rest falls away.
    if (dim > 0) {
      ctx.globalAlpha = alpha * 0.6 * dim;
      ctx.drawImage(inner, x, y, d, d);
    }
    ctx.globalAlpha = 1;
  } else if (reveal > 0) {
    // The load sequence: the field appears from the centre outward, inside a
    // growing circle. One clipped draw per layer, so the intro stays cheap.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R * reveal, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = alpha * Math.min(1, 0.35 + reveal);
    ctx.drawImage(outer, x, y, d, d);
    ctx.drawImage(inner, x, y, d, d);
    ctx.restore();
  }

  for (const p of foundInRank(points)) {
    const lit = f.lit[p.rank - 1] ?? 0;
    if (lit <= 0) continue;
    const pulse = f.pulse?.[p.rank - 1] ?? 0;
    drawFound(ctx, cx + p.x * R, cy + p.y * R, scale, lit, pulse, pal.signal);
  }
}

/** One found role: a lime dot with a soft glow. */
export function drawFound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  lit: number,
  pulse: number,
  signal: string,
) {
  const r = (2.6 + pulse * 1.6) * scale;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * (4 + pulse * 3));
  glow.addColorStop(0, withAlpha(signal, (0.45 + 0.35 * pulse) * lit));
  glow.addColorStop(1, withAlpha(signal, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * (4 + pulse * 3), 0, TAU);
  ctx.fill();
  ctx.globalAlpha = lit;
  ctx.fillStyle = signal;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** `#rrggbb` or `rgb(...)`/`oklch(...)` with an alpha, via color-mix-free math. */
const alphaCache = new Map<string, string>();
export function withAlpha(colour: string, a: number): string {
  const key = `${colour}|${a.toFixed(3)}`;
  const hit = alphaCache.get(key);
  if (hit) return hit;
  let out: string;
  const hex = colour.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    out = `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  } else if (/\)$/.test(colour) && !colour.includes("/")) {
    out = colour.replace(/\)$/, ` / ${a})`);
  } else {
    out = colour;
  }
  if (alphaCache.size > 512) alphaCache.clear();
  alphaCache.set(key, out);
  return out;
}
