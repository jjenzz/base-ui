'use client';
/**
 * A throwaway prototype of a nested Tree API, for the Tree DX review. Not Base UI's Tree.
 *
 * - `Tree.Item` is the row (`treeitem`) for an end node. For a parent node it is a plain wrapper,
 *   and its `Tree.Trigger` is the row. Whether an item is a parent comes from `items`, so the
 *   right element gets the role on the first render.
 * - `Tree.Group` wraps a parent node's children and renders only while the parent is expanded.
 * - ARIA stays flat: no `role="group"`; every row sets `aria-level`, `aria-setsize` and
 *   `aria-posinset` from the store, as the current Tree does.
 * - `onItemHighlighted` reports the highlighted value and its path: one `{ parent, index }` step per
 *   level, so each level's virtualizer can scroll to its own index.
 */
import * as React from 'react';
import { useControlled } from '@base-ui/utils/useControlled';
import { useMergedRefs } from '@base-ui/utils/useMergedRefs';

type Value = string;

export type TreePath = Array<{ parent: Value | null; index: number }>;

export type TreeHighlightReason = 'keyboard' | 'pointer';

interface NodeInfo {
  parent: Value | null;
  index: number;
  level: number;
  setSize: number;
  children: Value[];
}

interface TreeContextValue {
  baseId: string;
  nodes: Map<Value, NodeInfo>;
  order: Value[];
  expanded: Set<Value>;
  highlighted: Value | null;
  selected: Value | null;
  getRowCount: (value: Value) => number;
  registerRow: (value: Value, element: HTMLElement) => () => void;
  setListElement: (element: HTMLElement | null) => void;
  highlight: (value: Value, reason: TreeHighlightReason, focus: boolean) => void;
  activate: (value: Value) => void;
  onRowFocus: (value: Value) => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

const TreeContext = React.createContext<TreeContextValue | null>(null);
const TreeItemContext = React.createContext<Value | null>(null);

function useTreeContext() {
  const context = React.useContext(TreeContext);
  if (!context) {
    throw new Error('Tree parts must be placed inside <Tree.Root>.');
  }
  return context;
}

interface RootProps<TItem> {
  items: readonly TItem[];
  itemToValue: (item: TItem) => Value;
  itemToChildren: (item: TItem) => readonly TItem[] | undefined;
  expandedItems?: Value[];
  defaultExpandedItems?: Value[];
  onExpandedItemsChange?: (expanded: Value[]) => void;
  onItemHighlighted?: (
    value: Value,
    details: { reason: TreeHighlightReason; path: TreePath },
  ) => void;
  children: React.ReactNode;
}

function Root<TItem>(props: RootProps<TItem>) {
  const { items, itemToValue, itemToChildren, onExpandedItemsChange, onItemHighlighted } = props;
  const baseId = React.useId();

  const { nodes, roots } = React.useMemo(() => {
    const nodeMap = new Map<Value, NodeInfo>();
    function add(list: readonly TItem[], parent: Value | null, level: number): Value[] {
      return list.map((item, index) => {
        const value = itemToValue(item);
        const info: NodeInfo = { parent, index, level, setSize: list.length, children: [] };
        nodeMap.set(value, info);
        info.children = add(itemToChildren(item) ?? [], value, level + 1);
        return value;
      });
    }
    return { nodes: nodeMap, roots: add(items, null, 1) };
  }, [items, itemToValue, itemToChildren]);

  const [expandedList, setExpandedList] = useControlled({
    controlled: props.expandedItems,
    default: props.defaultExpandedItems ?? [],
    name: 'Tree',
    state: 'expandedItems',
  });
  const expanded = React.useMemo(() => new Set(expandedList), [expandedList]);

  // The visible rows in order, and how many rows each visible item occupies with its subtree.
  const { order, orderIndex, rowCounts } = React.useMemo(() => {
    const visible: Value[] = [];
    const counts = new Map<Value, number>();
    function walk(values: Value[]): number {
      let total = 0;
      for (const value of values) {
        visible.push(value);
        const below = expanded.has(value) ? walk(nodes.get(value)!.children) : 0;
        counts.set(value, 1 + below);
        total += 1 + below;
      }
      return total;
    }
    walk(roots);
    return {
      order: visible,
      orderIndex: new Map(visible.map((value, index) => [value, index])),
      rowCounts: counts,
    };
  }, [nodes, roots, expanded]);

  // Stable until expansion changes, so virtualizers re-measure only when sizes really change.
  const getRowCount = React.useCallback((value: Value) => rowCounts.get(value) ?? 1, [rowCounts]);

  const [highlighted, setHighlighted] = React.useState<Value | null>(roots[0] ?? null);
  const [selected, setSelected] = React.useState<Value | null>(null);

  const rowsRef = React.useRef(new Map<Value, HTMLElement>());
  const listRef = React.useRef<HTMLElement | null>(null);
  // A row to focus once it mounts: keyboard moved to it while it was virtualized away, or it had
  // focus when it scrolled out of view.
  const pendingFocusRef = React.useRef<Value | null>(null);

  // The highlighted row may be inside a folder that was collapsed; its visible ancestor stands in
  // as the tab stop and the starting point for the keyboard.
  let activeRow = highlighted;
  while (activeRow != null && !orderIndex.has(activeRow)) {
    activeRow = nodes.get(activeRow)!.parent;
  }
  activeRow ??= order[0] ?? null;

  const getPath = React.useCallback(
    (value: Value) => {
      const path: TreePath = [];
      let current: Value | null = value;
      while (current != null) {
        const info: NodeInfo = nodes.get(current)!;
        path.unshift({ parent: info.parent, index: info.index });
        current = info.parent;
      }
      return path;
    },
    [nodes],
  );

  const setExpanded = (value: Value, open: boolean) => {
    const next = open ? [...expandedList, value] : expandedList.filter((item) => item !== value);
    setExpandedList(next);
    onExpandedItemsChange?.(next);
  };

  const highlight = (value: Value, reason: TreeHighlightReason, focus: boolean) => {
    setHighlighted(value);
    if (focus) {
      const element = rowsRef.current.get(value);
      if (element) {
        element.focus({ preventScroll: true });
      } else {
        pendingFocusRef.current = value;
      }
    }
    onItemHighlighted?.(value, { reason, path: getPath(value) });
  };

  // Prototype: rebuilt every render, and every mounted row reads the highlight anyway.
  // eslint-disable-next-line react/jsx-no-constructed-context-values
  const context: TreeContextValue = {
    baseId,
    nodes,
    order,
    expanded,
    highlighted: activeRow,
    selected,
    getRowCount,
    registerRow(value, element) {
      rowsRef.current.set(value, element);
      if (pendingFocusRef.current === value) {
        pendingFocusRef.current = null;
        element.focus({ preventScroll: true });
      }
      return () => {
        if (rowsRef.current.get(value) === element) {
          rowsRef.current.delete(value);
        }
        // React detaches refs before it removes the element, so it still has focus here.
        if (element.ownerDocument.activeElement === element) {
          listRef.current?.focus({ preventScroll: true });
          // Keep a target the keyboard already moved to; otherwise come back to this row.
          pendingFocusRef.current ??= value;
        }
      };
    },
    setListElement(element) {
      listRef.current = element;
    },
    highlight,
    activate(value) {
      highlight(value, 'pointer', false);
      setSelected(value);
      if (nodes.get(value)!.children.length > 0) {
        setExpanded(value, !expanded.has(value));
      }
    },
    onRowFocus(value) {
      pendingFocusRef.current = null;
      if (value !== highlighted) {
        setHighlighted(value);
      }
    },
    handleKeyDown(event) {
      const current = activeRow;
      if (current == null) {
        return;
      }
      const index = orderIndex.get(current)!;
      const info = nodes.get(current)!;
      const isParent = info.children.length > 0;
      const isOpen = expanded.has(current);

      let next: Value | undefined;
      switch (event.key) {
        case 'ArrowDown':
          next = order[index + 1];
          break;
        case 'ArrowUp':
          next = order[index - 1];
          break;
        case 'Home':
          next = order[0];
          break;
        case 'End':
          next = order[order.length - 1];
          break;
        case 'ArrowRight':
          if (isParent && !isOpen) {
            setExpanded(current, true);
          } else if (isParent) {
            next = info.children[0];
          }
          break;
        case 'ArrowLeft':
          if (isParent && isOpen) {
            setExpanded(current, false);
          } else if (info.parent != null) {
            next = info.parent;
          }
          break;
        case 'Enter':
        case ' ':
          setSelected(current);
          if (isParent) {
            setExpanded(current, !isOpen);
          }
          break;
        default:
          return;
      }
      event.preventDefault();
      if (next != null) {
        highlight(next, 'keyboard', true);
      }
    },
  };

  return <TreeContext.Provider value={context}>{props.children}</TreeContext.Provider>;
}

/** How many rows an item takes up, counting itself and its visible descendants. */
function useRowCount() {
  return useTreeContext().getRowCount;
}

const List = React.forwardRef(function List(
  props: React.ComponentPropsWithoutRef<'div'>,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const tree = useTreeContext();
  const ref = useMergedRefs(forwardedRef, tree.setListElement);
  return (
    <div
      role="tree"
      tabIndex={-1}
      {...props}
      ref={ref}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        tree.handleKeyDown(event);
      }}
    />
  );
});

/** The props of whichever element is the row: the item for an end node, the trigger for a parent. */
function useRowProps(value: Value, forwardedRef: React.ForwardedRef<HTMLDivElement>) {
  const tree = useTreeContext();
  const info = tree.nodes.get(value)!;
  const isParent = info.children.length > 0;
  const isOpen = tree.expanded.has(value);
  const isHighlighted = tree.highlighted === value;
  const isSelected = tree.selected === value;
  const { registerRow } = tree;

  const rowRef = React.useCallback(
    (element: HTMLDivElement | null) => (element ? registerRow(value, element) : undefined),
    // `registerRow` only reads refs; re-registering on every render would steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value],
  );
  const ref = useMergedRefs(forwardedRef, rowRef);

  return {
    ref,
    role: 'treeitem',
    id: `${tree.baseId}-${value}`,
    tabIndex: isHighlighted ? 0 : -1,
    'aria-level': info.level,
    'aria-setsize': info.setSize,
    'aria-posinset': info.index + 1,
    'aria-expanded': isParent ? isOpen : undefined,
    'aria-controls': isParent && isOpen ? `${tree.baseId}-group-${value}` : undefined,
    'aria-selected': isSelected,
    'data-highlighted': isHighlighted ? '' : undefined,
    'data-selected': isSelected ? '' : undefined,
    'data-expanded': isParent && isOpen ? '' : undefined,
    onClick: () => tree.activate(value),
    onFocus: () => tree.onRowFocus(value),
  };
}

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
  value: Value;
}

const Item = React.forwardRef(function Item(
  props: ItemProps,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const { value, ...elementProps } = props;
  const tree = useTreeContext();
  const isParent = tree.nodes.get(value)!.children.length > 0;
  const rowProps = useRowProps(value, isParent ? null : forwardedRef);

  return (
    <TreeItemContext.Provider value={value}>
      {isParent ? (
        <div ref={forwardedRef} {...elementProps} />
      ) : (
        <div {...elementProps} {...rowProps} />
      )}
    </TreeItemContext.Provider>
  );
});

function useItemValue(part: string) {
  const value = React.useContext(TreeItemContext);
  if (value == null) {
    throw new Error(`<Tree.${part}> must be placed inside <Tree.Item>.`);
  }
  return value;
}

const Trigger = React.forwardRef(function Trigger(
  props: React.ComponentPropsWithoutRef<'div'>,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const value = useItemValue('Trigger');
  const rowProps = useRowProps(value, forwardedRef);
  return <div {...props} {...rowProps} />;
});

const Group = React.forwardRef(function Group(
  props: React.ComponentPropsWithoutRef<'div'>,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const value = useItemValue('Group');
  const tree = useTreeContext();
  if (!tree.expanded.has(value)) {
    return null;
  }
  return <div id={`${tree.baseId}-group-${value}`} {...props} ref={forwardedRef} />;
});

function ItemIndicator(props: React.ComponentPropsWithoutRef<'span'>) {
  const value = useItemValue('ItemIndicator');
  const tree = useTreeContext();
  return <span aria-hidden data-expanded={tree.expanded.has(value) ? '' : undefined} {...props} />;
}

/** The visible rows in order, with each row's level: for rendering the tree as a flat list. */
function useRows() {
  const { order, nodes } = useTreeContext();
  return { rows: order, getLevel: (value: Value) => nodes.get(value)!.level };
}

/** Whether an item has children, so a flat list knows to render a trigger. */
function useIsParent() {
  const { nodes } = useTreeContext();
  return (value: Value) => nodes.get(value)!.children.length > 0;
}

export const Tree = {
  Root,
  List,
  Item,
  Trigger,
  Group,
  ItemIndicator,
  useRowCount,
  useRows,
  useIsParent,
};
