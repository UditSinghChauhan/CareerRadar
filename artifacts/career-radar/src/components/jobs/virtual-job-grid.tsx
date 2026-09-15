import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

/**
 * Windowed rendering for the Jobs explorer's card grid.
 * ─────────────────────────────────────────────────────
 * Phase 7 lets the user choose 200 rows a page. Two hundred job cards is
 * roughly four thousand DOM nodes, each with badges, a tooltip and two
 * buttons, and on a phone that is a visible stall on every page change — which
 * is the opposite of what raising the page size was for.
 *
 * Below `VIRTUALIZE_ABOVE` rows the plain grid is used instead. Virtualisation
 * is not free: it takes the cards out of the normal flow, so anything that
 * relies on them all being in the DOM (Ctrl-F, a screen reader's list
 * navigation, Playwright counting `[data-job-id]`) sees only the window. At
 * twenty or fifty rows there is nothing to win, so it stays off.
 *
 * Heights are MEASURED, not estimated. A card with three eligibility badges is
 * meaningfully taller than one with none, and a fixed row height makes the
 * scrollbar lie and the list jump under the cursor.
 */

/** Row count above which windowing turns on — UPGRADE.md §7 says past 100. */
export const VIRTUALIZE_ABOVE = 100;

/** Roughly one card; only ever the starting guess before the real measurement. */
const ESTIMATED_ROW_HEIGHT = 232;

/** Rows rendered beyond the viewport, so a fast scroll does not show blanks. */
const OVERSCAN = 3;

interface VirtualJobGridProps<T> {
  items: T[];
  /**
   * How many cards go into one virtual row. It does not have to equal the
   * grid's column count at the current width: the inner grid is still
   * `grid-cols-1 md:grid-cols-2`, so on a phone a virtual row simply stacks
   * its two cards, and because the row's height is measured rather than
   * assumed the offsets stay right either way.
   */
  columns: number;
  getKey: (item: T) => string;
  children: (item: T) => ReactNode;
}

export function VirtualJobGrid<T>({
  items,
  columns,
  getKey,
  children,
}: VirtualJobGridProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // One virtual item per GRID ROW, not per card: the virtualiser measures
  // vertical extent, and two cards side by side occupy one of those.
  const rowCount = Math.ceil(items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  return (
    <div
      ref={scrollRef}
      data-testid="virtual-job-grid"
      className="overflow-y-auto max-h-[calc(100vh-14rem)]"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const start = row.index * columns;
          const rowItems = items.slice(start, start + columns);
          return (
            <div
              key={row.key}
              // measureElement re-reads this row's real height after layout and
              // corrects the offsets below it.
              ref={virtualizer.measureElement}
              data-index={row.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4 pb-4">
                {rowItems.map((item) => (
                  <div key={getKey(item)}>{children(item)}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
