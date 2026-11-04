import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { RoleCard } from "./role-card";
import { RANKED } from "./sample-roles";
import {
  cardProgress,
  crossfade,
  flightProgress,
  flightRange,
  mix,
} from "./flight-math";

/**
 * The signature move. The ten ranked cards fly from the hero's field into
 * rows 1 to 10 of "Today's ten", scrubbed by the scroll.
 *
 * A fixed overlay holds one copy of each card. Every frame it reads where
 * the card is in the field (its slot moves with the field's parallax and
 * idle drift) and where its row is in the queue (which may be sticky), and
 * places the copy between the two with a transform. Reads are batched before
 * writes, and nothing but transform and opacity is written, so the flight
 * never triggers layout. Under reduced motion there is no overlay: the field
 * keeps its cards and the rows are shown at once.
 */
export function Flight() {
  const reduced = Boolean(useReducedMotion());
  const cards = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    let last = -1;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      const focus = document.querySelector<HTMLElement>(".lp-focus");
      const queue = document.querySelector<HTMLElement>(".lp-queue");
      if (!focus || !queue) return;
      const y = window.scrollY;
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      // At rest: on wide screens when the sticky stage engages, otherwise
      // when the queue's top is a fifth of the way down the screen.
      const rest = wide
        ? focus.getBoundingClientRect().top + y
        : queue.getBoundingClientRect().top + y - vh * 0.2;
      const p = flightProgress(y, flightRange(rest, vh));

      // Read everything first.
      const reads = RANKED.map((role) => {
        const src = document.querySelector<HTMLElement>(
          `[data-fly-src="${role.rank}"] .lp-rolecard`,
        );
        const slot = document.querySelector<HTMLElement>(
          `[data-fly-dst="${role.rank}"]`,
        );
        return {
          src,
          slot,
          s: src?.getBoundingClientRect(),
          t: slot?.getBoundingClientRect(),
        };
      });
      const first = cards.current[0];
      const w = first?.offsetWidth ?? 0;
      const h = first?.offsetHeight ?? 0;
      // Nothing moves at either end, so the steady states cost nothing.
      const settled = p === 0 || p === 1;
      if (settled && p === last) return;
      last = p;

      reads.forEach(({ src, slot, s, t }, i) => {
        const el = cards.current[i];
        if (!el || !slot) return;
        const e = cardProgress(p, i + 1);
        const o = crossfade(e);
        slot.style.opacity = String(o.row);
        if (src?.parentElement) {
          // The field card's slot, so its own entrance animation is kept.
          (src.closest(".lp-slot") as HTMLElement).style.opacity = String(
            o.field,
          );
        }
        // A card with no place in the field (a very short screen) simply
        // appears in its row.
        if (!s || !t || !w || !h) {
          el.style.opacity = "0";
          slot.style.opacity = "1";
          return;
        }
        el.style.opacity = String(o.flying);
        if (o.flying === 0) return;
        // Lands at the row's top-left, scaled so the card's 13px title meets
        // the row's 14px title on a full row, and fits a one-line row.
        const endScale = t.height >= 80 ? 14 / 13 : t.height / h;
        const scale = mix(s.width / w, endScale, e);
        const x = mix(s.left, t.left, e);
        const yy = mix(s.top, t.top, e);
        el.style.transform = `translate3d(${x}px, ${yy}px, 0) scale(${scale})`;
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // The field mounts a frame after the hero; start once it can be read.
    const start = window.setTimeout(update, 0);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.clearTimeout(start);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduced]);

  if (reduced) return null;
  return (
    <div className="lp-flight" aria-hidden="true">
      {RANKED.map((role, i) => (
        <div
          key={role.id}
          ref={(el) => {
            cards.current[i] = el;
          }}
          className="lp-flight__card"
        >
          <RoleCard role={role} />
        </div>
      ))}
    </div>
  );
}
