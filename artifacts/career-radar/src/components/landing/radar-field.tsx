import { useEffect, useRef, useState } from "react";

/**
 * The landing hero's signature: the job market as a radar field.
 *
 * Drawn to scale from the README's measurement of 16 September 2026: one
 * point per active posting (4,512), of which 2,109 were plausibly open to a
 * fresher. Eligible postings sit nearer the centre, the rest drift to the
 * edge, and the ten roles of a day's queue turn lime as the sweep finds them.
 * Positions are generated from a fixed seed, so every visitor sees the same
 * field; only the counts are data.
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
  return points;
}

function readColours(el: HTMLElement) {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    lo: v("--point-lo"),
    mid: v("--point-mid"),
    hi: v("--point-hi"),
    signal: v("--color-accent"),
  };
}

/** How long ago, as a fraction of a turn, the sweep passed this angle. */
function sinceSweep(sweep: number, angle: number) {
  return ((((sweep - angle) % TAU) + TAU) % TAU) / TAU;
}

export function RadarField() {
  const figureRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const calloutRef = useRef<HTMLParagraphElement>(null);
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
    const colours = readColours(figure);
    const foundAt = new Map<number, number>();
    // The callout's leader runs to the found point furthest toward its label.
    const anchor = points.reduce(
      (best, p, i) =>
        p.found && p.x - p.y > points[best].x - points[best].y ? i : best,
      points.findIndex((p) => p.found),
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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.48;
      const fills = [colours.lo, colours.mid, colours.hi];
      points.forEach((p, i) => {
        const since = sinceSweep(sweep, p.angle);
        // The sweep lifts what it touches, then lets it settle over a third of a turn.
        const lift = since < 0.33 ? 1 - since / 0.33 : 0;
        const px = cx + p.x * R;
        const py = cy + p.y * R;
        if (p.found) {
          if (reduced || lift > 0.9) foundAt.set(i, 1);
          if (foundAt.has(i)) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = colours.signal;
            ctx.beginPath();
            ctx.arc(px, py, p.size + lift * 1.5, 0, TAU);
            ctx.fill();
            return;
          }
        }
        const tone = lift > 0.55 ? 2 : p.tone;
        ctx.globalAlpha = Math.max(0.12, (0.45 + 0.55 * lift) * p.fade);
        ctx.fillStyle = fills[tone];
        const s = p.size + lift * 0.6;
        ctx.fillRect(px - s / 2, py - s / 2, s, s);
      });
      ctx.globalAlpha = 1;

      const label = calloutRef.current;
      if (label && foundAt.has(anchor)) {
        const box = canvas.getBoundingClientRect();
        const l = label.getBoundingClientRect();
        const ax = cx + points[anchor].x * R;
        const ay = cy + points[anchor].y * R;
        const ex = l.left - box.left - 6;
        const ey = l.bottom - box.top - 6;
        ctx.strokeStyle = colours.hi;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = colours.signal;
        ctx.beginPath();
        ctx.arc(ax, ay, 3.5, 0, TAU);
        ctx.fill();
      }
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
      handlers.forEach(([t, h]) => figure.removeEventListener(t, h));
    };
  }, [reduced]);

  return (
    <figure ref={figureRef} className="radar">
      <canvas
        ref={canvasRef}
        className="radar__field"
        role="img"
        aria-label="Radar chart of 4,512 active postings measured on 16 September 2026. The 2,109 open to freshers sit nearest the centre; the ten roles of a day's queue are lit in lime."
      />
      <p ref={calloutRef} className="radar__callout" aria-hidden="true">
        <span className="radar__figure num">10</span>
        <span className="radar__label">roles found today</span>
      </p>
      <figcaption className="radar__caption">
        <span>
          <span className="num">4,512</span> active postings,{" "}
          <span className="num">2,109</span> open to freshers. Measured 16
          September 2026.
        </span>
        {!reduced && (
          <button
            type="button"
            className="btn btn--quiet btn--small"
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
