import { Faq } from "./faq";

/**
 * Everything after the hero, in its own chunk. The landing paints the hero
 * first and mounts this in a transition, so the first paint does not wait
 * for the motion library.
 */
export default function BelowFold() {
  return <Faq />;
}
