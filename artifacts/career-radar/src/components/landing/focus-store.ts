import { useSyncExternalStore } from "react";

/**
 * Whether the ten have left the hero's field for the "Today's ten" card.
 * The hero and the focus section read the same value in the same render, so
 * framer-motion's shared layout ids carry each card from one to the other.
 */
let focused = false;
const listeners = new Set<() => void>();

export function setFocused(next: boolean) {
  if (next === focused) return;
  focused = next;
  listeners.forEach((l) => l());
}

export function useFocused(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => focused,
    () => false,
  );
}

/**
 * Whether the ten belong in the card, from where the card is now. In once
 * 30% of it is in view, and they stay in once it has scrolled past; out as
 * soon as it is below the fold again. Read from the card's position on every
 * scroll, not from threshold crossings, so a jump straight from the end of
 * the page to the top still sends them back to the field.
 */
export function focusFor(
  rect: { top: number; height: number },
  viewport: number,
): boolean {
  const seen =
    Math.max(
      0,
      Math.min(rect.top + rect.height, viewport) - Math.max(rect.top, 0),
    ) / Math.max(1, rect.height);
  if (seen >= 0.3) return true;
  return rect.top <= 0;
}

/** Test hook. */
export function resetFocused() {
  focused = false;
}
