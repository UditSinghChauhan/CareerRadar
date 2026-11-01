import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { DURATION, EASE_OUT, REVEAL_FROM, REVEAL_TO, STAGGER } from "./tokens";

type Tag = "div" | "p" | "h2" | "h3" | "li" | "section" | "span" | "figure";

/**
 * Rises 24px, sharpens from an 8px blur and fades in, once, when 20% of it is
 * in view. `index` staggers siblings by 70ms. Under reduced motion it renders
 * in its final state with no transition.
 */
export function Reveal({
  as = "div",
  index = 0,
  delay = 0,
  children,
  ...rest
}: {
  as?: Tag;
  index?: number;
  delay?: number;
  children: ReactNode;
} & Omit<HTMLMotionProps<"div">, "children">) {
  const reduced = useReducedMotion();
  const Component = motion[as] as typeof motion.div;
  if (reduced) {
    return <Component {...rest}>{children}</Component>;
  }
  return (
    <Component
      initial={REVEAL_FROM}
      whileInView={REVEAL_TO}
      viewport={{ once: true, amount: 0.2 }}
      transition={{
        duration: DURATION.reveal,
        ease: EASE_OUT,
        delay: delay + index * STAGGER,
      }}
      {...rest}
    >
      {children}
    </Component>
  );
}
