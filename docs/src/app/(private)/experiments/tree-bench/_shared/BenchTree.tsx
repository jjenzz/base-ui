'use client';
import * as React from 'react';
import { Tree } from '@base-ui/react/tree';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { BenchItem } from './data';
import { OVERSCAN, ROW_SIZE, initialRect, visibleRows } from './virtualizer';
import styles from './bench.module.css';

export const implementationLabel =
  'Converted: nested Tree.Group and Tree.GroupLabel, guides from group borders, TanStack Virtual per level';

export interface BenchTreeProps {
  items: BenchItem[];
  expanded: string[];
  onExpandedChange: (expanded: string[]) => void;
}

/**
 * Flavien's Tree converted to nested groups, virtualized with one TanStack virtualizer per expanded
 * level, all sharing the list as their scroll element. Root, items, groups and group labels only.
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
        <Level items={items} start={0} scrollElement={scrollElement} />
      </Tree.List>
    </Tree.Root>
  );
}

function Level(props: { items: BenchItem[]; start: number; scrollElement: HTMLElement | null }) {
  const { items, start, scrollElement } = props;
  const getRowCount = Tree.unstable_useRowCount();
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    // A parent's size is its own row plus its visible descendants.
    estimateSize: (index) => ROW_SIZE * getRowCount(items[index].id),
    getItemKey: (index) => items[index].id,
    // Where this level starts in the shared scroller.
    scrollMargin: start,
    initialOffset: () => scrollElement?.scrollTop ?? 0,
    initialRect: initialRect(scrollElement),
    overscan: OVERSCAN,
  });

  // Expanding or collapsing changes the size of parents that aren't mounted to be measured.
  React.useEffect(() => virtualizer.measure(), [virtualizer, getRowCount]);

  return (
    <div className={styles.Level} style={{ height: virtualizer.getTotalSize() }}>
      {visibleRows(virtualizer).map((row) => {
        const item = items[row.index];
        return (
          <Tree.Item
            key={row.key}
            itemId={item.id}
            ref={virtualizer.measureElement}
            data-index={row.index}
            className={item.children ? undefined : styles.Row}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${row.start - start}px)`,
            }}
          >
            {item.children ? (
              <React.Fragment>
                <Tree.GroupLabel className={styles.Row}>
                  <span className={styles.Label}>{item.label}</span>
                </Tree.GroupLabel>
                <Tree.Group className={styles.Group}>
                  <Level
                    items={item.children}
                    start={row.start + ROW_SIZE}
                    scrollElement={scrollElement}
                  />
                </Tree.Group>
              </React.Fragment>
            ) : (
              <span className={styles.Label}>{item.label}</span>
            )}
          </Tree.Item>
        );
      })}
    </div>
  );
}
