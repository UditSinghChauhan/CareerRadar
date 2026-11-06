import { useRef, type ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type HTMLMotionProps,
} from "framer-motion";
import { SCROLL_TIMELINE } from "./scroll-timeline";

type Tag = "div" | "p" | "h2";
type Props = {
  as?: Tag;
  className?: string;
  children: ReactNode;
} & Omit<HTMLMotionProps<"div">, "children" | "className">;

const cx = (...c: Array<string | undefined>) => c.filter(Boolean).join(" ");

/** The settle: 12px below and opacity 0.4 at the start of view, at rest by 35% of it. */
export const SETTLE = { rise: 12, from: 0.4, done: 0.35 } as const;
/** The dashboard's tilt: rotateX(8deg) and scale 0.96, flat by 50% of view. */
export const TILT = {
  deg: 8,
  scale: 0.96,
  done: 0.5,
  perspective: 1400,
} as const;

function SettleFallback({ as = "div", className, children, ...rest }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, SETTLE.done], [SETTLE.rise, 0]);
  const opacity = useTransform(
    scrollYProgress,
    [0, SETTLE.done],
    [SETTLE.from, 1],
  );
  const Component = motion[as] as typeof motion.div;
  return (
    <Component ref={ref} className={className} style={{ y, opacity }} {...rest}>
      {children}
    </Component>
  );
}

/**
 * A heading or statement that settles as it arrives: from 12px below and
 * opacity 0.4 when its top enters the viewport to rest by 35% of its view
 * (`cover 0%` to `cover 35%`). CSS `animation-timeline: view()` where the
 * browser has it (class `lp-settle`, landing.css), framer-motion scroll
 * values otherwise. Under reduced motion it is simply at rest.
 */
export function Settle(props: Props) {
  const reduced = useReducedMotion();
  if (SCROLL_TIMELINE || reduced) {
    const { as = "div", className, children, ...rest } = props;
    const Component = motion[as] as typeof motion.div;
    return (
      <Component className={cx(className, "lp-settle")} {...rest}>
        {children}
      </Component>
    );
  }
  return <SettleFallback {...props} />;
}

function TiltFallback({ className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const rotateX = useTransform(scrollYProgress, [0, TILT.done], [TILT.deg, 0]);
  const scale = useTransform(scrollYProgress, [0, TILT.done], [TILT.scale, 1]);
  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ rotateX, scale, transformPerspective: TILT.perspective }}
    >
      {children}
    </motion.div>
  );
}

/**
 * The dashboard showcase's tilt: rotateX(8deg) and scale 0.96 as it enters,
 * flat by the time its middle reaches the middle of the viewport. CSS
 * scroll-driven where supported (`lp-tilt`), framer-motion otherwise.
 */
export function Tilt(props: Props) {
  const reduced = useReducedMotion();
  if (SCROLL_TIMELINE || reduced) {
    return (
      <div className={cx(props.className, "lp-tilt")}>{props.children}</div>
    );
  }
  return <TiltFallback {...props} />;
}
