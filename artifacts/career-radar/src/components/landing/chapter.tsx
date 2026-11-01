import { useEffect, useRef, useState } from "react";
import {
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  type MotionValue,
} from "framer-motion";
import { LandingQueue } from "./landing-queue";
import { ExplainCard, PRIORITY_COMPONENTS } from "./explain-card";
import { MiniRadar } from "./mini-radar";
import { WhySheet } from "./why-sheet";
import { Reveal } from "./motion/reveal";
import { useMedia } from "./motion/use-media";
import { clamp01, span } from "./motion/tokens";
import { formatCount } from "./motion/use-count-up";
import {
  RING_FRACTIONS,
  TAU,
  buildField,
  drawField,
  drawFound,
  fitCanvas,
  foundInRank,
  readPalette,
  withAlpha,
  type Point,
} from "./radar-core";
import { QUEUE_SIZE, type LandingStats } from "./use-public-stats";

const weights = PRIORITY_COMPONENTS.map(
  (c) => `${c.name.toLowerCase()} ${c.weight}%`,
);

export function beats(stats: LandingStats) {
  return [
    {
      line: `${formatCount(stats.activePostings)} open roles${stats.live ? " today" : ""}.`,
      sub: "Every active posting from employers’ own careers pages and free job-board APIs.",
    },
    {
      line: `${formatCount(stats.openToFreshers)} you can actually apply to.`,
      sub: "A rule-based classifier keeps the roles a final-year student or recent graduate can apply for.",
    },
    {
      line: "Ten worth your morning.",
      sub: `Ranked on ${weights.slice(0, -1).join(", ")} and ${weights.at(-1)}.`,
    },
    {
      line: "Each one tells you why.",
      sub: "Four scores and a plain reason for every rank, including the term that is not helping.",
    },
  ];
}

/** Where each beat starts, as scroll progress through the chapter. */
const B = [0, 0.25, 0.5, 0.76] as const;

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * "From 4,512 to ten." From 1024px, a stage pinned for about 400vh and
 * scrubbed by native scroll in both directions: every frame is a pure
 * function of scroll progress. Below 1024px, or under reduced motion, the
 * four beats are laid out inline.
 */
export function Chapter({ stats }: { stats: LandingStats }) {
  const wide = useMedia("(min-width: 1024px)", true);
  const reduced = useReducedMotion();
  return (
    <section
      className="lp-chapter-wrap"
      aria-labelledby="chapter-head"
      id="how-it-works"
    >
      <h2 id="chapter-head" className="lp-sr">
        From every open role to your ten
      </h2>
      {wide && !reduced ? (
        <PinnedChapter stats={stats} />
      ) : (
        <InlineChapter stats={stats} still={Boolean(reduced)} />
      )}
      <p className="lp-container lp-illus">
        Illustrative rows. Scores come from the real ranking code.
      </p>
    </section>
  );
}

function PinnedChapter({ stats }: { stats: LandingStats }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const [beat, setBeat] = useState(0);
  const copy = beats(stats);

  return (
    <div ref={sectionRef} className="lp-chapter">
      <div className="lp-chapter__stage">
        <Scene progress={scrollYProgress} onBeat={setBeat} />
        <div className="lp-chapter__copy">
          {copy.map((b, i) => (
            <div
              key={i}
              className="lp-chapter__line"
              data-beat={i}
              aria-hidden={i !== beat}
            >
              <p className="lp-chapter__big">{b.line}</p>
              <p className="lp-chapter__sub">{b.sub}</p>
            </div>
          ))}
        </div>
        <div
          className="lp-chapter__progress"
          aria-label={`Step ${beat + 1} of 4`}
        >
          <span className="num">
            0{beat + 1} <span className="lp-chapter__of">/ 04</span>
          </span>
          <span className="lp-chapter__ticks" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} data-on={i <= beat} />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The canvas, the queue frame and the explain card, driven by `progress`. */
function Scene({
  progress,
  onBeat,
}: {
  progress: MotionValue<number>;
  onBeat: (b: number) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [fill, setFill] = useState(0);
  const render = useRef<(p: number) => void>(() => {});

  useEffect(() => {
    const stage = stageRef.current?.parentElement;
    const field = fieldRef.current;
    const over = overRef.current;
    const frame = frameRef.current;
    const card = cardRef.current;
    const fctx = field?.getContext("2d");
    const octx = over?.getContext("2d");
    if (!stage || !field || !over || !frame || !card || !fctx || !octx) return;

    const points = buildField();
    const found = foundInRank(points);
    const pal = readPalette(stage);
    let size = fitCanvas(field);
    fitCanvas(over);
    // The card's resting box, measured without its scrub transform.
    let cardHome = card.getBoundingClientRect();
    let lastBeat = -1;
    let lastFill = -1;

    const lines = [...stage.querySelectorAll<HTMLElement>(".lp-chapter__line")];

    const badges = () =>
      [
        ...frame.querySelectorAll<HTMLElement>(
          '[data-testid="queue-row"] > div > span:first-child',
        ),
      ].slice(0, QUEUE_SIZE);

    render.current = (p: number) => {
      const { w, h, dpr } = size;
      if (!w || !h) return;
      const box = stage.getBoundingClientRect();

      // Copy: each line holds its beat and crossfades at the boundaries.
      lines.forEach((el, i) => {
        const start = B[i];
        const end = B[i + 1] ?? 1.01;
        const inK = i === 0 ? 1 : span(p, start - 0.02, start + 0.03);
        const outK = i === lines.length - 1 ? 0 : span(p, end - 0.04, end);
        const o = Math.min(inK, 1 - outK);
        const y = (1 - inK) * 28 - outK * 28;
        el.style.opacity = String(o);
        el.style.transform = `translate3d(0, ${y}px, 0)`;
        el.style.filter = o > 0.99 ? "none" : `blur(${(1 - o) * 8}px)`;
        el.style.visibility = o < 0.01 ? "hidden" : "visible";
      });
      const beat = p < B[1] ? 0 : p < B[2] ? 1 : p < B[3] ? 2 : 3;
      if (beat !== lastBeat) {
        lastBeat = beat;
        onBeat(beat);
      }

      // Beat 2: the outer field dims and the eligible field contracts.
      const dim = easeInOut(span(p, 0.27, 0.42));
      // Beat 3: the radar moves left and the queue arrives on the right.
      const move = easeInOut(span(p, 0.48, 0.58));
      const enter = easeInOut(span(p, 0.5, 0.6));
      // Beat 4: the radar fades and row 1 opens into the card.
      const leave = easeInOut(span(p, 0.76, 0.84));
      const open = easeInOut(span(p, 0.78, 0.88));
      const bars = clamp01(span(p, 0.84, 0.97));

      const R0 = Math.min(w * 0.3, h * 0.34);
      const R = R0 * lerp(1, 0.8, move);
      const cx = lerp(w * 0.5, w * 0.25, move);
      const cy = lerp(h * 0.63, h * 0.62, move);

      frame.style.opacity = String(enter);
      frame.style.transform = `translate3d(${(1 - enter) * 80}px, 0, 0)`;
      frame.style.visibility = enter < 0.01 ? "hidden" : "visible";

      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.clearRect(0, 0, w, h);
      fctx.globalAlpha = 1;
      fctx.save();
      fctx.globalAlpha = 1 - leave;
      if (leave < 1) {
        drawField(fctx, points, pal, {
          cx,
          cy,
          R,
          rings: RING_FRACTIONS.map(() => 1),
          reveal: () => 1 - leave,
          sweep: null,
          dimOuter: dim,
          contract: lerp(1, 0.74, dim),
          lit: found.map(() => 1),
          hideFound: true,
        });
      }
      fctx.restore();

      // The ten: lit in the field, then flying into the queue's rank badges.
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, w, h);
      const targets = badges();
      const frameBox = frame.getBoundingClientRect();
      const scale = Math.max(0.8, R / 300);
      found.forEach((pt: Point, i) => {
        const sx = cx + pt.x * R;
        const sy = cy + pt.y * R;
        const t0 = 0.56 + i * 0.012;
        const k = easeInOut(span(p, t0, t0 + 0.09));
        const badge = targets[i]?.getBoundingClientRect();
        if (!badge || k <= 0) {
          drawFound(octx, sx, sy, scale, 1 - leave, 0, pal.signal);
          return;
        }
        const ex = badge.left - box.left + badge.width / 2;
        const ey = badge.top - box.top + badge.height / 2;
        // A curved path: the control point lifts above the straight line.
        const mx = (sx + ex) / 2;
        const my = Math.min(sy, ey) - Math.min(220, Math.abs(ex - sx) * 0.35);
        const x = (1 - k) ** 2 * sx + 2 * (1 - k) * k * mx + k * k * ex;
        const y = (1 - k) ** 2 * sy + 2 * (1 - k) * k * my + k * k * ey;
        const below = ey > frameBox.bottom - box.top - 24;
        const fade = below ? 1 - span(k, 0.7, 1) : 1;
        if (k < 1) {
          // A short lime trail behind each dot in flight.
          octx.strokeStyle = withAlpha(pal.signal, 0.35 * fade);
          octx.lineWidth = 1.5;
          octx.beginPath();
          const back = Math.max(0, k - 0.18);
          for (let s = back; s <= k; s += 0.02) {
            const tx = (1 - s) ** 2 * sx + 2 * (1 - s) * s * mx + s * s * ex;
            const ty = (1 - s) ** 2 * sy + 2 * (1 - s) * s * my + s * s * ey;
            if (s === back) octx.moveTo(tx, ty);
            else octx.lineTo(tx, ty);
          }
          octx.stroke();
          drawFound(octx, x, y, scale, fade, 0, pal.signal);
        } else if (!below) {
          // Landed: a lime ring on the badge, row 1 kept brightest in beat 4.
          const a = i === 0 ? 1 : 1 - 0.7 * open;
          octx.strokeStyle = withAlpha(pal.signal, a);
          octx.lineWidth = 2;
          octx.beginPath();
          octx.arc(ex, ey, badge.width / 2 + 4, 0, TAU);
          octx.stroke();
          octx.fillStyle = withAlpha(pal.signal, 0.18 * a);
          octx.beginPath();
          octx.arc(ex, ey, badge.width / 2 + 12, 0, TAU);
          octx.fill();
        }
      });

      // Beat 4: row 1 opens into the explain card (a FLIP from the row's box).
      const row = frame.querySelector<HTMLElement>('[data-testid="queue-row"]');
      if (row && open > 0) {
        const r = row.getBoundingClientRect();
        const sxk = r.width / cardHome.width;
        const syk = r.height / cardHome.height;
        const tx = r.left - cardHome.left;
        const ty = r.top - cardHome.top;
        card.style.transform = `translate3d(${tx * (1 - open)}px, ${ty * (1 - open)}px, 0) scale(${lerp(sxk, 1, open)}, ${lerp(syk, 1, open)})`;
        card.style.opacity = String(span(open, 0, 0.35));
        card.style.visibility = "visible";
        // Row 1 is ringed in lime as it opens.
        octx.strokeStyle = withAlpha(
          pal.signal,
          0.9 * (1 - span(open, 0.6, 1)),
        );
        octx.lineWidth = 1.5;
        octx.beginPath();
        octx.roundRect(
          r.left - box.left - 3,
          r.top - box.top - 3,
          r.width + 6,
          r.height + 6,
          12,
        );
        octx.stroke();
      } else {
        card.style.opacity = "0";
        card.style.visibility = "hidden";
      }
      const f = Math.round(bars * 100) / 100;
      if (f !== lastFill) {
        lastFill = f;
        setFill(f);
      }
    };

    const measure = () => {
      size = fitCanvas(field);
      fitCanvas(over);
      const t = card.style.transform;
      card.style.transform = "none";
      cardHome = card.getBoundingClientRect();
      card.style.transform = t;
      render.current(progress.get());
    };
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    // The queue lays out after mount; measure again once it has.
    const id = requestAnimationFrame(measure);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(id);
    };
  }, [progress, onBeat]);

  useMotionValueEvent(progress, "change", (p) => render.current(p));

  return (
    <div ref={stageRef} className="lp-chapter__scene" aria-hidden="true">
      <canvas ref={fieldRef} className="lp-chapter__field" />
      <div ref={frameRef} className="lp-chapter__queue lp-qframe" inert>
        <LandingQueue limit={QUEUE_SIZE} />
      </div>
      <div className="lp-chapter__card">
        <ExplainCard ref={cardRef} fill={fill} />
      </div>
      <canvas ref={overRef} className="lp-chapter__over" />
    </div>
  );
}

/** Under 1024px or reduced motion: the four beats inline, each with its own visual. */
function InlineChapter({
  stats,
  still,
}: {
  stats: LandingStats;
  still: boolean;
}) {
  const copy = beats(stats);
  return (
    <div className="lp-container lp-beats">
      {copy.map((b, i) => (
        <div key={i} className="lp-beat">
          <Reveal as="p" className="lp-beat__count num" aria-hidden="true">
            0{i + 1} <span>/ 04</span>
          </Reveal>
          <Reveal as="p" index={1} className="lp-chapter__big">
            {b.line}
          </Reveal>
          <Reveal as="p" index={2} className="lp-chapter__sub">
            {b.sub}
          </Reveal>
          <Reveal index={3} className="lp-beat__visual">
            {i === 0 && <MiniRadar mode="field" still={still} />}
            {i === 1 && <MiniRadar mode="eligible" still={still} />}
            {i === 2 && (
              <div
                className="lp-qframe lp-beat__queue"
                inert
                aria-hidden="true"
              >
                <LandingQueue limit={3} />
              </div>
            )}
            {i === 3 && (
              <>
                <div
                  className="lp-qframe lp-beat__queue"
                  inert
                  aria-hidden="true"
                >
                  <LandingQueue limit={1} />
                </div>
                <WhySheet />
              </>
            )}
          </Reveal>
        </div>
      ))}
    </div>
  );
}
