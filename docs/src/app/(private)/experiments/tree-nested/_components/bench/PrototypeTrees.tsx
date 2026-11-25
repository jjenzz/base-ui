'use client';
import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Tree } from '../tree-parts';
import { ROW_SIZE } from './data';
import type { BenchItem } from './data';
import type { BenchTreeProps } from './types';
import { ChevronIcon } from './FlavienTree';
import styles from './bench.module.css';

/**
 * The nested prototype (Item / Trigger / Group) and a flat control on the same prototype store, each
 * with every row rendered or virtualized with TanStack Virtual. Only the DOM structure differs
 * between nested and flat, so the pair isolates what nesting costs.
 */

function getId(item: BenchItem) {
  return item.id;
}

function getChildren(item: BenchItem) {
  return item.children;
}

function PrototypeRoot(props: BenchTreeProps & { children: React.ReactNode }) {
  return (
    <Tree.Root
      items={props.items}
      itemToValue={getId}
      itemToChildren={getChildren}
      expandedItems={props.expanded}
      onExpandedItemsChange={props.onExpandedChange}
    >
      {props.children}
    </Tree.Root>
  );
}

function RowContent({ item }: { item: BenchItem }) {
  return (
    <React.Fragment>
      {item.children ? (
        <Tree.ItemIndicator className={styles.Chevron}>
          <ChevronIcon />
        </Tree.ItemIndicator>
      ) : (
        <span className={styles.ChevronSpace} />
      )}
      <span className={styles.Label}>{item.label}</span>
    </React.Fragment>
  );
}

/* ---------- Nested, every row rendered ---------- */

function NestedLevel({ items }: { items: BenchItem[] }) {
  return items.map((item) =>
    item.children ? (
      <Tree.Item key={item.id} value={item.id}>
        <Tree.Trigger className={styles.Row}>
          <RowContent item={item} />
        </Tree.Trigger>
        <Tree.Group className={styles.Group}>
          <NestedLevel items={item.children} />
        </Tree.Group>
      </Tree.Item>
    ) : (
      <Tree.Item key={item.id} value={item.id} className={styles.Row}>
        <RowContent item={item} />
      </Tree.Item>
    ),
  );
}

export function NestedTree(props: BenchTreeProps) {
  return (
    <PrototypeRoot {...props}>
      <Tree.List aria-label="Benchmark" className={styles.Tree} data-bench-scroller="">
        <NestedLevel items={props.items} />
      </Tree.List>
    </PrototypeRoot>
  );
}

/**
 * The rows of a level that overlap the viewport, plus one viewport above and below.
 * Count-based `overscan` compounds with depth (every mounted level renders at least one row, even
 * when the whole level is offscreen), so nested levels cull by pixels instead.
 */
function visibleRows(virtualizer: {
  getVirtualItems: () => VirtualRow[];
  scrollOffset: number | null;
  scrollRect: { height: number } | null;
}) {
  const offset = virtualizer.scrollOffset ?? 0;
  const height = virtualizer.scrollRect?.height ?? 0;
  return virtualizer
    .getVirtualItems()
    .filter((row) => row.end > offset - height && row.start < offset + 2 * height);
}

interface VirtualRow {
  key: React.Key;
  index: number;
  start: number;
  end: number;
}

/** Without a starting rect, each level renders empty until a layout effect measures it, and that
 * synchronous update cascades level by level past React's nested-update limit in deep trees. */
function initialRect(scrollElement: HTMLElement | null) {
  return scrollElement
    ? { width: scrollElement.clientWidth, height: scrollElement.clientHeight }
    : undefined;
}

/* ---------- Nested, one virtualizer per expanded level ---------- */

function VirtualLevel({
  items,
  start,
  scrollElement,
}: {
  items: BenchItem[];
  start: number;
  scrollElement: HTMLElement | null;
}) {
  const getRowCount = Tree.useRowCount();
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => ROW_SIZE * getRowCount(items[index].id),
    getItemKey: (index) => items[index].id,
    scrollMargin: start,
    initialOffset: () => scrollElement?.scrollTop ?? 0,
    initialRect: initialRect(scrollElement),
    overscan: 0,
  });

  React.useEffect(() => virtualizer.measure(), [virtualizer, getRowCount]);

  return (
    <div className={styles.Level} style={{ height: virtualizer.getTotalSize() }}>
      {visibleRows(virtualizer).map((row) => {
        const item = items[row.index];
        const style: React.CSSProperties = {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${row.start - start}px)`,
        };
        if (!item.children) {
          return (
            <Tree.Item
              key={row.key}
              value={item.id}
              ref={virtualizer.measureElement}
              data-index={row.index}
              className={styles.Row}
              style={style}
            >
              <RowContent item={item} />
            </Tree.Item>
          );
        }
        return (
          <Tree.Item
            key={row.key}
            value={item.id}
            ref={virtualizer.measureElement}
            data-index={row.index}
            style={style}
          >
            <Tree.Trigger className={styles.Row}>
              <RowContent item={item} />
            </Tree.Trigger>
            <Tree.Group className={styles.Group}>
              <VirtualLevel
                items={item.children}
                start={row.start + ROW_SIZE}
                scrollElement={scrollElement}
              />
            </Tree.Group>
          </Tree.Item>
        );
      })}
    </div>
  );
}

export function NestedVirtualTree(props: BenchTreeProps) {
  const [scrollElement, setScrollElement] = React.useState<HTMLElement | null>(null);
  return (
    <PrototypeRoot {...props}>
      <Tree.List
        ref={setScrollElement}
        aria-label="Benchmark"
        className={styles.Tree}
        data-bench-scroller=""
      >
        <VirtualLevel items={props.items} start={0} scrollElement={scrollElement} />
      </Tree.List>
    </PrototypeRoot>
  );
}

/* ---------- Flat control: the same store rendered as a flat list ---------- */

function useItemLookup(items: BenchItem[]) {
  return React.useMemo(() => {
    const map = new Map<string, BenchItem>();
    (function walk(list: BenchItem[]) {
      for (const item of list) {
        map.set(item.id, item);
        if (item.children) {
          walk(item.children);
        }
      }
    })(items);
    return map;
  }, [items]);
}

function FlatRow({
  item,
  level,
  style,
  measureRef,
  index,
}: {
  item: BenchItem;
  level: number;
  style?: React.CSSProperties;
  measureRef?: (element: Element | null) => void;
  index?: number;
}) {
  const levelStyle = { '--level': level, ...style } as React.CSSProperties;
  if (!item.children) {
    return (
      <Tree.Item
        value={item.id}
        ref={measureRef}
        data-index={index}
        className={`${styles.Row} ${styles.FlatGuides}`}
        style={levelStyle}
      >
        <RowContent item={item} />
      </Tree.Item>
    );
  }
  return (
    <Tree.Item value={item.id} ref={measureRef} data-index={index} style={style}>
      <Tree.Trigger
        className={`${styles.Row} ${styles.FlatGuides}`}
        style={{ '--level': level } as React.CSSProperties}
      >
        <RowContent item={item} />
      </Tree.Trigger>
    </Tree.Item>
  );
}

function FlatRows({ items }: { items: BenchItem[] }) {
  const { rows, getLevel } = Tree.useRows();
  const lookup = useItemLookup(items);
  return rows.map((id) => <FlatRow key={id} item={lookup.get(id)!} level={getLevel(id)} />);
}

export function FlatTree(props: BenchTreeProps) {
  return (
    <PrototypeRoot {...props}>
      <Tree.List aria-label="Benchmark" className={styles.Tree} data-bench-scroller="">
        <FlatRows items={props.items} />
      </Tree.List>
    </PrototypeRoot>
  );
}

function FlatVirtualRows({
  items,
  scrollElement,
}: {
  items: BenchItem[];
  scrollElement: HTMLElement | null;
}) {
  const { rows, getLevel } = Tree.useRows();
  const lookup = useItemLookup(items);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_SIZE,
    getItemKey: (index) => rows[index],
    overscan: 5,
  });
  return (
    <div className={styles.Level} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => {
        const id = rows[row.index];
        return (
          <FlatRow
            key={row.key}
            item={lookup.get(id)!}
            level={getLevel(id)}
            index={row.index}
            measureRef={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${row.start}px)`,
            }}
          />
        );
      })}
    </div>
  );
}

export function FlatVirtualTree(props: BenchTreeProps) {
  const [scrollElement, setScrollElement] = React.useState<HTMLElement | null>(null);
  return (
    <PrototypeRoot {...props}>
      <Tree.List
        ref={setScrollElement}
        aria-label="Benchmark"
        className={styles.Tree}
        data-bench-scroller=""
      >
        <FlatVirtualRows items={props.items} scrollElement={scrollElement} />
      </Tree.List>
    </PrototypeRoot>
  );
}
