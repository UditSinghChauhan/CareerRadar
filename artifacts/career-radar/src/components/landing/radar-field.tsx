import { useEffect, useRef, useState } from "react";

/**
 * The landing hero's object: the job market as a lit radar disc.
 *
 * Drawn to scale from the README's measurement of 16 September 2026: one
 * point per active posting (4,512), of which 2,109 were plausibly open to a
 * fresher. Eligible postings sit nearer the centre, the rest drift to the
 * edge, and the ten roles of a day's queue light up as the sweep finds them.
 * Positions are generated from a fixed seed, so every visitor sees the same
 * field; only the counts are data. The rings carry those counts as labels.
 */
export const RADAR_COUNTS = { total: 4512, eligible: 2109, found: 10 };

const SWEEP_SECONDS = 7;
const TAU = Math.PI * 2;

type Point = {
  x: number;
  y: number;
  angle: number;
  tone: 0 | 1 | 2;
  size: number;
  found: boolean;
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

export function buildField(): Point[] {
  const rand = seeded(20260916);
  const points: Point[] = [];
  const place = (rMin: number, rMax: number, bias: number) => {
    const angle = rand() * TAU;
    // A power bias pulls points toward rMin; the jitter keeps the field organic.
    const r = rMin + (rMax - rMin) * Math.pow(rand(), bias);
    return { angle, r, x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  };
  const ineligible = RADAR_COUNTS.total - RADAR_COUNTS.eligible;
  for (let i = 0; i < ineligible; i++) {
    const p = place(0.42, 1, 0.75);
    points.push({
      ...p,
      tone: 0,
      size: 1 + rand() * 0.6,
      found: false,
      fade: 1 - Math.max(0, p.r - 0.8) * 3,
    });
  }
  for (let i = 0; i < RADAR_COUNTS.eligible - RADAR_COUNTS.found; i++) {
    const p = place(0.02, 0.92, 1.25);
    points.push({
      ...p,
      tone: p.r < 0.5 ? 2 : 1,
      size: 1.2 + rand() * 0.8,
      found: false,
      fade: 1 - Math.max(0, p.r - 0.8) * 3,
    });
  }
  for (let i = 0; i < RADAR_COUNTS.found; i++) {
    const angle = rand() * TAU;
    const r = 0.06 + Math.pow(rand(), 0.8) * 0.3;
    points.push({
      angle,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      tone: 2,
      size: 3.2,
      found: true,
      fade: 1,
    });
  }
  // Orientation carries no data, so turn the field until the ten found roles
  // face up: in a hero cropped at its lower edge, that keeps them in view.
  const found = points.filter((p) => p.found);
  const centroid = Math.atan2(
    found.reduce((s, p) => s + p.y, 0),
    found.reduce((s, p) => s + p.x, 0),
  );
  const turn = -Math.PI / 2 - centroid;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return points.map((p) => ({
    ...p,
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
    angle: (((p.angle + turn) % TAU) + TAU) % TAU,
  }));
}

function readColours(el: HTMLElement) {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    point: v("--lp-point"),
    rule: v("--lp-rule"),
    signal: v("--lp-signal"),
    glow: v("--lp-disc-glow"),
  };
}

/** How long ago, as a fraction of a turn, the sweep passed this angle. */
function sinceSweep(sweep: number, angle: number) {
  return ((((sweep - angle) % TAU) + TAU) % TAU) / TAU;
}

/** Ring radii as a fraction of the disc, outermost first, with their labels. */
export const RINGS = [
  { f: 1, figure: RADAR_COUNTS.total, label: "active postings" },
  { f: 0.66, figure: RADAR_COUNTS.eligible, label: "open to freshers" },
  { f: 0.33, figure: RADAR_COUNTS.found, label: "for you today" },
] as const;

export function RadarField() {
  const figureRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [held, setHeld] = useState(false);
  const heldRef = useRef(held);
  heldRef.current = held;
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const state = useRef({ seen: false, hover: false, focus: false });

  useEffect(() => {
    const figure = figureRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!figure || !canvas || !ctx) return;

    const points = buildField();
    let colours = readColours(figure);
    // The ten are lit from the first frame: a visitor who looks for two
    // seconds sees what was found. The sweep then lifts each as it passes.
    const foundAt = new Set<number>(
      points.flatMap((p, i) => (p.found ? [i] : [])),
    );
    let sweep = Math.PI * 1.15; // a still frame lands mid-scene with the ten already lit
    let last = performance.now();
    let frame = 0;
    let size = { w: 0, h: 0, dpr: 1 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };

    const draw = () => {
      const { w, h, dpr } = size;
      if (!w || !h) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) / 2 - 1;
      const scale = Math.max(1, R / 270);

      // The disc's own surface, lit from above: it depicts the object.
      const lit = ctx.createRadialGradient(
        cx,
        cy - R * 0.55,
        R * 0.05,
        cx,
        cy,
        R,
      );
      lit.addColorStop(0, colours.glow);
      lit.addColorStop(1, "transparent");
      ctx.fillStyle = lit;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = colours.rule;
      ctx.lineWidth = 1;
      for (const ring of RINGS) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * ring.f - 0.5, 0, TAU);
        ctx.stroke();
      }

      ctx.fillStyle = colours.point;
      points.forEach((p, i) => {
        const since = sinceSweep(sweep, p.angle);
        // The sweep lifts what it touches, then lets it settle over a third of a turn.
        const lift = since < 0.33 ? 1 - since / 0.33 : 0;
        const px = cx + p.x * R;
        const py = cy + p.y * R;
        if (p.found) return; // drawn last, above the field
        const base = p.tone === 0 ? 0.22 : p.tone === 1 ? 0.42 : 0.7;
        ctx.globalAlpha = Math.max(0.08, (base + 0.3 * lift) * p.fade);
        const s = (p.size + lift * 0.6) * scale * 0.8;
        ctx.fillRect(px - s / 2, py - s / 2, s, s);
      });

      ctx.fillStyle = colours.signal;
      foundAt.forEach((i) => {
        const p = points[i];
        const px = cx + p.x * R;
        const py = cy + p.y * R;
        const since = sinceSweep(sweep, p.angle);
        const lift = since < 0.2 ? 1 - since / 0.2 : 0;
        const r = (p.size / 2 + 1 + lift * 1.5) * scale;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(px, py, r * 2.4, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, TAU);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };

    const running = () => {
      const s = state.current;
      return s.seen && !s.hover && !s.focus && !heldRef.current && !reduced;
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (running()) {
        sweep = (sweep + (dt / SWEEP_SECONDS) * TAU) % TAU;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };

    resize();
    // Under reduced motion this is the only frame: the sweep stopped
    // mid-scene, the ten already found.
    draw();

    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      state.current.seen = entry.isIntersecting;
    });
    io.observe(figure);
    // Repaint in the new palette when the theme class on <html> changes.
    const mo = new MutationObserver(() => {
      colours = readColours(figure);
      draw();
    });
    mo.observe(document.documentElement, { attributeFilter: ["class"] });
    if (!reduced) frame = requestAnimationFrame(tick);

    const on = (k: "hover" | "focus", v: boolean) => () => {
      state.current[k] = v;
    };
    const handlers: Array<[string, () => void]> = [
      ["pointerenter", on("hover", true)],
      ["pointerleave", on("hover", false)],
      ["focusin", on("focus", true)],
      ["focusout", on("focus", false)],
    ];
    handlers.forEach(([t, h]) => figure.addEventListener(t, h));

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      handlers.forEach(([t, h]) => figure.removeEventListener(t, h));
    };
  }, [reduced]);

  return (
    <figure ref={figureRef} className="lp-radar">
      <div className="lp-radar__disc">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Radar chart of 4,512 active postings measured on 16 September 2026. The 2,109 open to freshers sit nearest the centre; the ten roles of a day's queue are lit."
        />
        {RINGS.map((ring) => (
          <span
            key={ring.label}
            className="lp-radar__ring"
            style={{ top: `${((1 - ring.f) / 2) * 100}%` }}
            aria-hidden="true"
          >
            <span className="num">{ring.figure.toLocaleString("en-IN")}</span>{" "}
            {ring.label}
          </span>
        ))}
      </div>
      <figcaption className="lp-radar__caption">
        <span>Measured 16 September 2026.</span>
        {!reduced && (
          <button
            type="button"
            className="lp-link-button"
            onClick={() => setHeld((h) => !h)}
            aria-pressed={held}
          >
            {held ? "Play the sweep" : "Pause the sweep"}
          </button>
        )}
      </figcaption>
    </figure>
  );
}
