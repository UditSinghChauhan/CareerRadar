import { useEffect, useRef, useState } from "react";
import { DURATION, easeOut, prefersReducedMotion } from "./tokens";

/**
 * Counts from 0 (or from the last shown value) to `target` over 900ms with
 * the reveal easing, once `start` is true. When `target` changes later (the
 * live figure arrives after the committed one), it counts on from where it
 * is. Under reduced motion it returns the target at once.
 */
export function useCountUp(
  target: number,
  { start = true, duration = DURATION.count * 1000 } = {},
): number {
  const [value, setValue] = useState(() =>
    prefersReducedMotion() ? target : 0,
  );
  const shown = useRef(value);

  useEffect(() => {
    if (!start) return;
    if (prefersReducedMotion()) {
      shown.current = target;
      setValue(target);
      return;
    }
    const from = shown.current;
    if (from === target) return;
    let frame = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = easeOut(Math.min(1, (now - t0) / duration));
      const v = Math.round(from + (target - from) * k);
      shown.current = v;
      setValue(v);
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, start, duration]);

  return value;
}

/** Indian digit grouping, as everywhere else on the page: 4,512 and 2,109. */
export const formatCount = (n: number) => n.toLocaleString("en-IN");
