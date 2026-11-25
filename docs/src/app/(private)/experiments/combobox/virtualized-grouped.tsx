'use client';
import * as React from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { useVirtualizer } from '@tanstack/react-virtual';
import styles from './virtualized-grouped.module.css';

/**
 * Nested virtualization: an outer virtualizer windows the groups, and each mounted group has its
 * own virtualizer that windows its items. Every virtualizer shares the one scroll element; an inner
 * virtualizer's `scrollMargin` is where its items start inside that element.
 * https://github.com/TanStack/virtual/discussions/315#discussioncomment-2915252
 *
 * The DOM stays nested (`role="group"` around its items), and an offscreen group is not rendered.
 */

const ITEM_SIZE = 32;
const LABEL_SIZE = 28;
const LIST_PADDING = 4;

export default function VirtualizedGroupedCombobox() {
  const listRef = React.useRef<ListHandle | null>(null);

  return (
    <Combobox.Root
      virtualized
      items={groups}
      itemToStringLabel={getItemLabel}
      onItemHighlighted={(item, { reason, index }) => {
        const list = listRef.current;

        if (!item || !list) {
          return;
        }

        const isStart = index === 0;
        const isEnd = index === list.count - 1;
        const shouldScroll = reason === 'none' || (reason === 'keyboard' && (isStart || isEnd));

        if (shouldScroll) {
          queueMicrotask(() => {
            list.scrollToIndex(index, isEnd ? 'start' : 'end');
          });
        }
      }}
    >
      <label className={styles.Label}>
        Search {totalItemCount(groups).toLocaleString()} items in {groups.length} groups
        <Combobox.Input className={styles.Input} />
      </label>

      <Combobox.Portal>
        <Combobox.Positioner className={styles.Positioner} sideOffset={4}>
          <Combobox.Popup className={styles.Popup}>
            <Combobox.Empty>
              <div className={styles.Empty}>No items found.</div>
            </Combobox.Empty>
            <Combobox.List className={styles.List}>
              <VirtualizedGroups listRef={listRef} />
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function VirtualizedGroups({ listRef }: { listRef: React.RefObject<ListHandle | null> }) {
  const filteredGroups = Combobox.useFilteredItems<ItemGroup>();

  const [scrollElement, setScrollElement] = React.useState<HTMLDivElement | null>(null);

  // The flat index of each group's first item, which `Combobox.Item` needs as `index`.
  const itemCount = totalItemCount(filteredGroups);
  const groupOffsets = React.useMemo(() => {
    let offset = 0;
    return filteredGroups.map((group) => {
      const start = offset;
      offset += group.items.length;
      return start;
    });
  }, [filteredGroups]);

  const groupVirtualizer = useVirtualizer({
    count: filteredGroups.length,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => LABEL_SIZE + filteredGroups[index].items.length * ITEM_SIZE,
    getItemKey: (index) => filteredGroups[index].value,
    overscan: 1,
    paddingStart: LIST_PADDING,
    paddingEnd: LIST_PADDING,
    scrollPaddingStart: LIST_PADDING,
    scrollPaddingEnd: LIST_PADDING,
  });

  // Each mounted group registers its item virtualizer. A scroll to an item in a group that isn't
  // mounted yet waits here until that group mounts.
  const itemVirtualizersRef = React.useRef(new Map<string, Virtualizer>());
  const pendingScrollRef = React.useRef<PendingScroll | null>(null);

  const registerItemVirtualizer = React.useCallback(
    (groupKey: string, itemVirtualizer: Virtualizer) => {
      itemVirtualizersRef.current.set(groupKey, itemVirtualizer);

      const pending = pendingScrollRef.current;
      if (pending?.groupKey === groupKey) {
        // After the commit: in Strict Mode, React re-runs the virtualizers' layout effects, and each
        // re-attach writes the offset it started from, which would undo a scroll made now.
        queueMicrotask(() => {
          if (pendingScrollRef.current === pending) {
            pendingScrollRef.current = null;
            itemVirtualizersRef.current
              .get(groupKey)
              ?.scrollToIndex(pending.index, { align: pending.align });
          }
        });
      }

      return () => {
        itemVirtualizersRef.current.delete(groupKey);
      };
    },
    [],
  );

  React.useImperativeHandle(listRef, () => ({
    count: itemCount,
    scrollToIndex(flatIndex, align) {
      // The flat index becomes a path: which group, then which item in it.
      const groupIndex = groupOffsets.findIndex(
        (start, index) => flatIndex < start + filteredGroups[index].items.length,
      );
      const group = filteredGroups[groupIndex];
      if (!group) {
        return;
      }
      const index = flatIndex - groupOffsets[groupIndex];

      const itemVirtualizer = itemVirtualizersRef.current.get(group.value);
      if (itemVirtualizer) {
        itemVirtualizer.scrollToIndex(index, { align });
        return;
      }

      // Bring the group into view so it mounts; it finishes the scroll when it registers.
      pendingScrollRef.current = { groupKey: group.value, index, align };
      groupVirtualizer.scrollToIndex(groupIndex, { align: 'start' });
    },
  }));

  const totalSize = groupVirtualizer.getTotalSize();

  if (!filteredGroups.length) {
    return null;
  }

  return (
    <div
      role="presentation"
      ref={setScrollElement}
      className={styles.Scroller}
      style={{ '--total-size': `${totalSize}px` } as React.CSSProperties}
    >
      <div role="presentation" className={styles.Placeholder} style={{ height: totalSize }}>
        {groupVirtualizer.getVirtualItems().map((virtualGroup) => (
          <VirtualizedGroup
            key={virtualGroup.key}
            group={filteredGroups[virtualGroup.index]}
            groupIndex={virtualGroup.index}
            groupStart={virtualGroup.start}
            flatOffset={groupOffsets[virtualGroup.index]}
            scrollElement={scrollElement}
            measureGroup={groupVirtualizer.measureElement}
            registerItemVirtualizer={registerItemVirtualizer}
          />
        ))}
      </div>
    </div>
  );
}

function VirtualizedGroup({
  group,
  groupIndex,
  groupStart,
  flatOffset,
  scrollElement,
  measureGroup,
  registerItemVirtualizer,
}: {
  group: ItemGroup;
  groupIndex: number;
  groupStart: number;
  flatOffset: number;
  scrollElement: HTMLDivElement | null;
  measureGroup: (element: Element | null) => void;
  registerItemVirtualizer: (groupKey: string, itemVirtualizer: Virtualizer) => () => void;
}) {
  // Where the items start inside the group, measured so it follows the label's CSS.
  const [itemsOffset, setItemsOffset] = React.useState(LABEL_SIZE);
  const itemsStart = groupStart + itemsOffset;

  // Shares the outer scroll element; `scrollMargin` tells it where this group's items begin.
  const itemVirtualizer = useVirtualizer({
    count: group.items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ITEM_SIZE,
    getItemKey: (index) => group.items[index].id,
    scrollMargin: itemsStart,
    scrollPaddingStart: LIST_PADDING,
    scrollPaddingEnd: LIST_PADDING,
    // A virtualizer scrolls its element to `initialOffset` when it first attaches, which defaults
    // to 0. Groups mount as they scroll into view, so start from where the list already is.
    initialOffset: () => scrollElement?.scrollTop ?? 0,
    overscan: 10,
  });

  React.useEffect(
    () => registerItemVirtualizer(group.value, itemVirtualizer),
    [registerItemVirtualizer, group.value, itemVirtualizer],
  );

  return (
    <Combobox.Group
      ref={measureGroup}
      data-index={groupIndex}
      className={styles.Group}
      style={{ transform: `translateY(${groupStart}px)` }}
    >
      <Combobox.GroupLabel className={styles.GroupLabel}>{group.value}</Combobox.GroupLabel>
      <div
        role="presentation"
        ref={(element) => {
          if (element) {
            setItemsOffset(element.offsetTop);
          }
        }}
        className={styles.Placeholder}
        style={{ height: itemVirtualizer.getTotalSize() }}
      >
        {itemVirtualizer.getVirtualItems().map((virtualItem) => {
          const item = group.items[virtualItem.index];
          return (
            <Combobox.Item
              key={virtualItem.key}
              index={flatOffset + virtualItem.index}
              data-index={virtualItem.index}
              ref={itemVirtualizer.measureElement}
              value={item}
              className={styles.Item}
              aria-setsize={group.items.length}
              aria-posinset={virtualItem.index + 1}
              style={{ transform: `translateY(${virtualItem.start - itemsStart}px)` }}
            >
              <Combobox.ItemIndicator className={styles.ItemIndicator}>
                <CheckIcon />
              </Combobox.ItemIndicator>
              <span className={styles.ItemText}>{item.name}</span>
            </Combobox.Item>
          );
        })}
      </div>
    </Combobox.Group>
  );
}

function CheckIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      {...props}
      style={{ display: 'block', ...props.style }}
    >
      <path d="m2.5 8.5 4 4 7-9" />
    </svg>
  );
}

type Align = 'start' | 'end';

type Virtualizer = ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;

interface PendingScroll {
  groupKey: string;
  index: number;
  align: Align;
}

interface ListHandle {
  /** The number of filtered items across all groups. */
  count: number;
  /** Scrolls to an item by its flat index across all groups. */
  scrollToIndex: (index: number, align: Align) => void;
}

interface Item {
  id: string;
  name: string;
}

interface ItemGroup {
  value: string;
  items: Item[];
}

function getItemLabel(item: Item | null) {
  return item ? item.name : '';
}

function totalItemCount(itemGroups: readonly ItemGroup[]) {
  return itemGroups.reduce((count, group) => count + group.items.length, 0);
}

const groups: ItemGroup[] = Array.from({ length: 100 }, (_, groupIndex) => {
  const groupLabel = String(groupIndex + 1).padStart(3, '0');
  return {
    value: `Group ${groupLabel}`,
    items: Array.from({ length: 100 }, (__, itemIndex) => {
      const id = `${groupLabel}-${String(itemIndex + 1).padStart(3, '0')}`;
      return { id, name: `Item ${id}` };
    }),
  };
});
