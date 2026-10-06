import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Key,
  type ReactNode,
} from "react";

/** Column count per viewport width, smallest first: `[minWidthPx, columns]`. */
export type GridBreakpoints = readonly (readonly [minWidth: number, columns: number])[];

function subscribeToResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function useColumns(breakpoints: GridBreakpoints) {
  return useSyncExternalStore(subscribeToResize, () => {
    let columns = breakpoints[0]?.[1] ?? 1;
    for (const [minWidth, count] of breakpoints) {
      if (window.innerWidth >= minWidth) columns = count;
    }
    return columns;
  });
}

/** How long the entrance animation runs; rows mounted later by scrolling skip it. */
const INTRO_MS = 900;

/**
 * A responsive card grid that scrolls with the page but only mounts the rows near the
 * viewport. Row heights are measured, so cards may be any height.
 */
export function VirtualGrid<T>({
  items,
  getKey,
  renderItem,
  breakpoints,
  gap = 12,
  estimateRowHeight = 280,
  overscan = 3,
  className,
}: {
  items: readonly T[];
  getKey: (item: T, index: number) => Key;
  /** `intro` is true only just after mount — use it to gate entrance animations. */
  renderItem: (item: T, index: number, intro: boolean) => ReactNode;
  breakpoints: GridBreakpoints;
  gap?: number;
  estimateRowHeight?: number;
  overscan?: number;
  className?: string;
}) {
  // The virtualizer returns a mutable instance, which React Compiler must not memoize.
  "use no memo";
  const listRef = useRef<HTMLDivElement>(null);
  const columns = useColumns(breakpoints);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIntro(false), INTRO_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // The grid starts below the page header, so the virtualizer needs its offset from the top.
  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const update = () => setScrollMargin(node.getBoundingClientRect().top + window.scrollY);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const rowCount = Math.ceil(items.length / columns);
  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => estimateRowHeight,
    overscan,
    gap,
    scrollMargin,
  });

  // A different column count changes every row's contents and height.
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [columns, virtualizer]);

  return (
    <div
      ref={listRef}
      className={className}
      style={{ position: "relative", height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) => {
        const start = row.index * columns;
        return (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
              display: "grid",
              gap,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {items.slice(start, start + columns).map((item, offset) => (
              <Fragment key={getKey(item, start + offset)}>
                {renderItem(item, start + offset, intro)}
              </Fragment>
            ))}
          </div>
        );
      })}
    </div>
  );
}
