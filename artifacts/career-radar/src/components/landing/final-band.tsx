import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Pause, Play } from "lucide-react";
import { useInView, useReducedMotion } from "framer-motion";
import {
  RING_FRACTIONS,
  TAU,
  buildField,
  drawField,
  fitCanvas,
  foundInRank,
  readPalette,
} from "./radar-core";
import { useActive } from "./motion/use-active";

const SWEEP_SECONDS = 7;
/** Where the still frame stops the sweep: mid-scene. */
const STILL = Math.PI * 1.15;
/** The band's slow entrance, in ms. Matches .lp-band in landing.css. */
const FADE_MS = 900;

/**
 * The radar, lit: one point per posting at the committed scale, the ten of
 * the day in lime, and a sweep that turns only while it is on screen and
 * not paused. The page's only dark band, and the radar's only appearance.
 */
function Radar({ paused, entered }: { paused: boolean; entered: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const active = useActive(ref);
  const reduced = Boolean(useReducedMotion());
  const sweep = useRef(STILL);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const points = buildField();
    const lit = foundInRank(points).map(() => 1);
    const pal = readPalette(canvas);
    let size = fitCanvas(canvas);
    let last = performance.now();
    let frame = 0;
    const paint = () => {
      const { w, h, dpr } = size;
      if (!w || !h) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawField(ctx, points, pal, {
        cx: w / 2,
        cy: h / 2,
        R: Math.min(w, h) / 2 - 1,
        rings: RING_FRACTIONS.map(() => 1),
        sweep: sweep.current,
        lit,
      });
    };
    const tick = (now: number) => {
      // 30fps is plenty for a seven-second turn.
      if (now - last >= 30) {
        const dt = Math.min(50, now - last);
        sweep.current =
          (sweep.current + (dt / (SWEEP_SECONDS * 1000)) * TAU) % TAU;
        last = now;
        paint();
      }
      frame = requestAnimationFrame(tick);
    };
    paint();
    // The sweep starts only once the band has faded in.
    if (active && entered && !reduced && !paused) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
    const ro = new ResizeObserver(() => {
      size = fitCanvas(canvas);
      paint();
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [active, entered, reduced, paused]);

  return (
    <div className="lp-band__radar">
      <canvas
        ref={ref}
        role="img"
        aria-label="Radar of every open role, one point each; the ten roles of a day's queue are lit."
      />
    </div>
  );
}

/**
 * Section 7: the only dark band. The radar is centred above the headline.
 * The band fades in slowly when it comes into view, and the sweep starts
 * once it has. The pause control sits in the band's bottom-right corner,
 * clear of the radar's circle.
 */
export function FinalBand({ signUpHref }: { signUpHref: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = Boolean(useReducedMotion());
  const seen = useInView(ref, { once: true, amount: 0.35 });
  const [entered, setEntered] = useState(reduced);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!seen || reduced) return;
    const id = window.setTimeout(() => setEntered(true), FADE_MS);
    return () => window.clearTimeout(id);
  }, [seen, reduced]);

  return (
    <section
      ref={ref}
      className={seen || reduced ? "lp-band is-in" : "lp-band"}
      aria-labelledby="band-head"
    >
      <div className="lp-container lp-band__in">
        <Radar paused={paused} entered={entered} />
        <h2 id="band-head" className="lp-h2 lp-band__h">
          Tomorrow’s ten are already being ranked.
        </h2>
        <Link href={signUpHref} className="lp-btn lp-btn--lime">
          Get started
        </Link>
      </div>
      {!reduced && (
        <button
          type="button"
          className="lp-band__pause"
          aria-label="Pause the radar sweep"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        </button>
      )}
    </section>
  );
}
