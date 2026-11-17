import * as React from 'react';
import { Listbox } from '@base-ui/react/listbox';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Row } from './shared';

// The prototype's API: `items` + `range`, and a render function that renders one item.
export function BenchList({ items }: { items: Row[] }) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 32,
    overscan: 5,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const starts = new Map(virtualItems.map((row) => [row.index, row.start]));
  return (
    <Listbox.Root
      multiple
      items={items}
      range={{ start: virtualItems[0]?.index ?? 0, end: virtualItems.at(-1)?.index ?? -1 }}
      onItemHighlighted={(_, details) => {
        if (details.reason !== 'pointer' && details.index !== -1) {
          virtualizer.scrollToIndex(details.index);
        }
      }}
      onValueChange={() => {
        (window as any).valueChangedAt = performance.now();
      }}
    >
      <Listbox.List
        ref={listRef}
        aria-label="Bench"
        className="list"
        style={{ '--total-size': `${virtualizer.getTotalSize()}px` } as React.CSSProperties}
      >
        {(item: Row, index: number) => (
          <Listbox.Item
            value={item}
            disabled={item.disabled}
            className="item"
            style={{ transform: `translateY(${starts.get(index) ?? 0}px)` }}
          >
            {item.label}
          </Listbox.Item>
        )}
      </Listbox.List>
    </Listbox.Root>
  );
}
