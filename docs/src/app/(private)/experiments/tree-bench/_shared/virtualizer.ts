/**
 * TanStack Virtual settings shared by both benchmarked Trees, so the virtualizer isn't a variable.
 * Both use @tanstack/react-virtual from the docs workspace (3.14.26).
 */
export const ROW_SIZE = 28;
export const OVERSCAN = 5;

/** Both sides render only rows within one viewport above and below the visible area. */
export function visibleRows<TRow extends { start: number; end: number }>(virtualizer: {
  getVirtualItems: () => TRow[];
  scrollOffset: number | null;
  scrollRect: { height: number } | null;
}) {
  const offset = virtualizer.scrollOffset ?? 0;
  const height = virtualizer.scrollRect?.height ?? 0;
  return virtualizer
    .getVirtualItems()
    .filter((row) => row.end > offset - height && row.start < offset + 2 * height);
}

/** A starting rect, so a virtualizer renders rows on its first render instead of after a layout effect. */
export function initialRect(scrollElement: HTMLElement | null) {
  return scrollElement
    ? { width: scrollElement.clientWidth, height: scrollElement.clientHeight }
    : undefined;
}
