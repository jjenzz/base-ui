import * as React from 'react';
import { Listbox } from '@base-ui/react/listbox';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Row } from './shared';

// The current PR's API: `items`, and the consumer renders only the virtual rows.
export function BenchList({ items }: { items: Row[] }) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 32,
    overscan: 5,
  });
  return (
    <Listbox.Root
      multiple
      items={items}
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
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          return (
            <Listbox.Item
              key={row.key}
              value={item}
              disabled={item.disabled}
              className="item"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              {item.label}
            </Listbox.Item>
          );
        })}
      </Listbox.List>
    </Listbox.Root>
  );
}
