'use client';
import * as React from 'react';
import { Tree } from '@base-ui/react/tree';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { BenchItem } from './data';
import { OVERSCAN, ROW_SIZE, initialRect, visibleRows } from './virtualizer';
import styles from './bench.module.css';

export const implementationLabel =
  "Baseline: Flavien's Tree (flat rows, Tree.ItemIndentGuide, Tree.GroupTransition), TanStack Virtual";

export interface BenchTreeProps {
  items: BenchItem[];
  expanded: string[];
  onExpandedChange: (expanded: string[]) => void;
}

/**
 * Flavien's Tree as it is, virtualized with one TanStack virtualizer over the visible rows.
 * Root, items and grouping only, plus the two parts the proposal replaces:
 * `Tree.ItemIndentGuide` on every row and `Tree.GroupTransition` after it.
 */
export function BenchTree(props: BenchTreeProps) {
  const { items, expanded, onExpandedChange } = props;
  const [scrollElement, setScrollElement] = React.useState<HTMLDivElement | null>(null);
  return (
    <Tree.Root
      items={items}
      expandedItems={expanded}
      onExpandedItemsChange={(next) => onExpandedChange(next as string[])}
      expandOnClick
    >
      <Tree.List
        ref={setScrollElement}
        aria-label="Benchmark"
        className={styles.Tree}
        data-bench-scroller=""
      >
        <VirtualRows scrollElement={scrollElement} />
      </Tree.List>
    </Tree.Root>
  );
}

function VirtualRows({ scrollElement }: { scrollElement: HTMLElement | null }) {
  const rowIds = Tree.unstable_useRowIds();
  const virtualizer = useVirtualizer({
    count: rowIds.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_SIZE,
    getItemKey: (index) => rowIds[index],
    initialOffset: () => scrollElement?.scrollTop ?? 0,
    initialRect: initialRect(scrollElement),
    overscan: OVERSCAN,
  });
  return (
    <div className={styles.Level} style={{ height: virtualizer.getTotalSize() }}>
      {visibleRows(virtualizer).map((row) => (
        <div
          key={row.key}
          ref={virtualizer.measureElement}
          data-index={row.index}
          className={styles.Virtual}
          style={{ transform: `translateY(${row.start}px)` }}
        >
          <Tree.unstable_Row itemId={rowIds[row.index]}>
            {(item: BenchItem) => (
              <React.Fragment>
                <Tree.Item itemId={item.id} className={styles.FlatRow}>
                  <Tree.ItemIndentGuide className={styles.IndentGuide} />
                  <span className={styles.Label}>{item.label}</span>
                </Tree.Item>
                <Tree.GroupTransition className={styles.GroupTransition} />
              </React.Fragment>
            )}
          </Tree.unstable_Row>
        </div>
      ))}
    </div>
  );
}
