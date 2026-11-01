import { useEffect, useRef, useState } from "react";
import {
  RING_FRACTIONS,
  TAU,
  buildField,
  drawField,
  fitCanvas,
  readPalette,
} from "./radar-core";
import { easeOut, prefersReducedMotion, span } from "./motion/tokens";
import { formatCount, useCountUp } from "./motion/use-count-up";
import { QUEUE_SIZE, type LandingStats } from "./use-public-stats";

const SWEEP_SECONDS = 7;

/**
 * The load sequence, in milliseconds from the first frame:
 * rings draw in, points fade in from the centre outward, the counts tick up,
 * the ten found roles light in rank order with a glow pulse, then the sweep
 * starts. Something meaningful moves inside the first 100ms.
 */
const T = {
  ringsFrom: 0,
  ringsTo: 700,
  ringStagger: 120,
  pointsFrom: 120,
  pointsSpread: 650,
  foundFrom: 950,
  foundStagger: 70,
  foundRise: 220,
  pulse: 520,
  sweepFrom: 1750,
} as const;

/** Where the still frame (reduced motion) stops the sweep: mid-scene. */
const STILL_SWEEP = Math.PI * 1.15;

export function HeroRadar({ stats }: { stats: LandingStats }) {
  const figureRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [held, setHeld] = useState(false);
  const heldRef = useRef(held);
  heldRef.current = held;
  const [reduced] = useState(prefersReducedMotion);
  const [countsGo, setCountsGo] = useState(reduced);

  useEffect(() => {
    const figure = figureRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!figure || !canvas || !ctx) return;

    const cleanups: Array<() => void> = [];
    const points = buildField();
    const pal = readPalette(figure);
    let size = fitCanvas(canvas);
    let seen = true;
    let frame = 0;
    let t0 = -1;
    let sweep = -Math.PI / 2;
    let last = 0;

    const paint = (t: number) => {
      const { w, h, dpr } = size;
      if (!w || !h) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) / 2 - 1;
      const done = reduced || t >= T.sweepFrom + 1;
      const rings = RING_FRACTIONS.map((_, i) =>
        done ? 1 : easeOut(span(t, T.ringsFrom + i * T.ringStagger, T.ringsTo)),
      );
      const lit = Array.from({ length: QUEUE_SIZE }, (_, i) =>
        done
          ? 1
          : span(
              t,
              T.foundFrom + i * T.foundStagger,
              T.foundFrom + i * T.foundStagger + T.foundRise,
            ),
      );
      const pulse = Array.from({ length: QUEUE_SIZE }, (_, i) => {
        if (done) return 0;
        const k = span(
          t,
          T.foundFrom + i * T.foundStagger,
          T.foundFrom + i * T.foundStagger + T.pulse,
        );
        return k > 0 && k < 1 ? Math.sin(k * Math.PI) : 0;
      });
      drawField(ctx, points, pal, {
        cx: w / 2,
        cy: h / 2,
        R,
        rings,
        revealRadius: done
          ? undefined
          : Math.min(1.02, Math.max(0, (t - T.pointsFrom) / T.pointsSpread)),
        sweep: reduced ? STILL_SWEEP : t >= T.sweepFrom ? sweep : null,
        lit,
        pulse,
      });
    };

    const tick = (now: number) => {
      frame = 0;
      if (t0 < 0) {
        t0 = now;
        last = now;
      }
      const t = now - t0;
      // After the intro the sweep redraws at 30fps: a 7-second turn looks
      // the same, and the main thread gets every other frame back.
      if (t >= T.sweepFrom + 50 && now - last < 30) {
        if (seen && !heldRef.current) frame = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (t >= T.sweepFrom && !heldRef.current) {
        sweep = (sweep + (dt / SWEEP_SECONDS) * TAU) % TAU;
      }
      paint(t);
      const intro = t < T.sweepFrom + 50;
      if (seen && (intro || !heldRef.current)) {
        frame = requestAnimationFrame(tick);
      }
    };
    const start = () => {
      if (!frame && !reduced) frame = requestAnimationFrame(tick);
    };

    if (reduced) {
      paint(Infinity);
    } else {
      start();
      // The counts start ticking as the points arrive.
      const id = window.setTimeout(() => setCountsGo(true), 300);
      cleanups.push(() => window.clearTimeout(id));
    }

    const ro = new ResizeObserver(() => {
      size = fitCanvas(canvas);
      if (reduced || !frame) paint(reduced ? Infinity : performance.now() - t0);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      seen = entry.isIntersecting;
      if (seen) start();
    });
    io.observe(figure);
    const onHold = () => start();
    figure.addEventListener("radar:resume", onHold);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      figure.removeEventListener("radar:resume", onHold);
      cleanups.forEach((c) => c());
    };
  }, [reduced]);

  const total = useCountUp(stats.activePostings, { start: countsGo });
  const eligible = useCountUp(stats.openToFreshers, { start: countsGo });
  const found = useCountUp(QUEUE_SIZE, { start: countsGo });

  const labels = [
    { f: RING_FRACTIONS[0], n: total, text: "open roles" },
    { f: RING_FRACTIONS[1], n: eligible, text: "open to freshers" },
    { f: RING_FRACTIONS[2], n: found, text: "for you today" },
  ];

  return (
    <figure ref={figureRef} className="lp-radar">
      <div className="lp-radar__light" aria-hidden="true" />
      <div className="lp-radar__disc">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Radar chart of ${formatCount(stats.activePostings)} open roles. The ${formatCount(stats.openToFreshers)} open to freshers sit nearest the centre; the ten roles of a day's queue are lit.`}
        />
      </div>
      <div className="lp-radar__labels" aria-hidden="true">
        {labels.map((l, i) => (
          <span
            key={l.text}
            className={
              i === 2
                ? "lp-radar__ring lp-radar__ring--found"
                : "lp-radar__ring"
            }
            style={{ "--f": l.f } as React.CSSProperties}
          >
            {i === 0 && stats.live && <span className="lp-live">Live</span>}
            <span className="num">{formatCount(l.n)}</span> {l.text}
          </span>
        ))}
      </div>
      {!reduced && (
        <button
          type="button"
          className="lp-radar__hold"
          onClick={() => {
            setHeld((h) => !h);
            figureRef.current?.dispatchEvent(new Event("radar:resume"));
          }}
          aria-pressed={held}
        >
          {held ? "Play the sweep" : "Pause the sweep"}
        </button>
      )}
    </figure>
  );
}
