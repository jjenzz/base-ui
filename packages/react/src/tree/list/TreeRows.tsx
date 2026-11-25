'use client';
import * as React from 'react';
import { useStore } from '@base-ui/utils/store';
import type { TreeItemId, FlatListEntry } from '../store/types';
import { useTreeRootContext } from '../root/TreeRootContext';
import { selectors } from '../store/selectors';
import { TreeGroupTransitionContext } from '../group-transition/TreeGroupTransitionContext';
import type { TreeGroupTransitionContextValue } from '../group-transition/TreeGroupTransitionContext';
import { TreeItemModelProvider } from '../utils/TreeItemModelProvider';
import { getItemIdKey } from '../utils/itemIdKey';

/**
 * Renders every visible row with `children`, for `Tree.List` and the parts of
 * `TreeGrid` that render rows.
 */
export function TreeRows<TItem>(props: TreeRows.Props<TItem>): React.JSX.Element {
  const { children } = props;
  const store = useTreeRootContext();

  const flatListEntries = useStore(store, selectors.flatListWithGroupTransitions);

  // Every row gets the same provider, whether or not a group animates: the list
  // switches between both layouts whenever a group starts or stops animating,
  // and a different element type at each row's position would remount the
  // entire row subtree. The row's own ID tells a `Tree.GroupTransition` which
  // row renders it.
  const renderRow = (
    itemId: TreeItemId,
    contextValue: TreeGroupTransitionContextValue = itemId,
  ) => (
    <TreeGroupTransitionContext.Provider key={getItemIdKey(itemId)} value={contextValue}>
      <TreeItemModelProvider store={store} itemId={itemId}>
        {children}
      </TreeItemModelProvider>
    </TreeGroupTransitionContext.Provider>
  );

  let rows: React.ReactNode;
  if (isPlainList(flatListEntries)) {
    rows = flatListEntries.map((itemId) => renderRow(itemId));
  } else {
    const groups = new Map<TreeItemId, Extract<FlatListEntry, { type: 'group-transition' }>>();
    for (const entry of flatListEntries) {
      if (entry.type === 'group-transition') {
        groups.set(entry.parentId, entry);
      }
    }
    rows = flatListEntries.flatMap((entry) => {
      if (entry.type !== 'item') {
        return [];
      }
      const group = groups.get(entry.itemId);
      // Shadow the parent's context so that a `Tree.GroupTransition` rendered by
      // an animating row does not consume the ancestor value and recursively
      // render the group again.
      return renderRow(
        entry.itemId,
        group
          ? {
              parentId: entry.itemId,
              animation: group.animation,
              children: group.childIds.map((childId) => renderRow(childId)),
            }
          : entry.itemId,
      );
    });
  }

  return <React.Fragment>{rows}</React.Fragment>;
}

export namespace TreeRows {
  export interface Props<TItem> {
    children: (item: TItem) => React.ReactNode;
  }
}

function isPlainList(entries: (TreeItemId | FlatListEntry)[]): entries is TreeItemId[] {
  return entries.length === 0 || typeof entries[0] === 'string' || typeof entries[0] === 'number';
}

/**
 * Benchmark-only (tree-nested-groups branch): the IDs of the visible rows, for
 * rendering `Tree.List` children through an external virtualizer. Rows inside an
 * animating group are left out; `Tree.unstable_Row` renders them inside the
 * group's `Tree.GroupTransition`, as `TreeRows` does.
 */
export function useTreeRowIds(): TreeItemId[] {
  const store = useTreeRootContext();
  const entries = useStore(store, selectors.flatListWithGroupTransitions);
  return React.useMemo(
    () =>
      isPlainList(entries)
        ? entries
        : entries.flatMap((entry) => (entry.type === 'item' ? [entry.itemId] : [])),
    [entries],
  );
}

/** Benchmark-only: one row of `useTreeRowIds`, with the context `TreeRows` gives it. */
export function TreeRow<TItem>(props: {
  itemId: TreeItemId;
  children: (item: TItem) => React.ReactNode;
}): React.JSX.Element {
  const { itemId, children } = props;
  const store = useTreeRootContext();
  const group = useStore(store, (state) => {
    const entries = selectors.flatListWithGroupTransitions(state);
    if (isPlainList(entries)) {
      return undefined;
    }
    return entries.find(
      (entry): entry is Extract<FlatListEntry, { type: 'group-transition' }> =>
        entry.type === 'group-transition' && entry.parentId === itemId,
    );
  });
  const contextValue = React.useMemo<TreeGroupTransitionContextValue>(
    () =>
      group
        ? {
            parentId: itemId,
            animation: group.animation,
            children: group.childIds.map((childId) => (
              <TreeGroupTransitionContext.Provider key={getItemIdKey(childId)} value={childId}>
                <TreeItemModelProvider store={store} itemId={childId}>
                  {children}
                </TreeItemModelProvider>
              </TreeGroupTransitionContext.Provider>
            )),
          }
        : itemId,
    [group, itemId, store, children],
  );
  return (
    <TreeGroupTransitionContext.Provider value={contextValue}>
      <TreeItemModelProvider store={store} itemId={itemId}>
        {children}
      </TreeItemModelProvider>
    </TreeGroupTransitionContext.Provider>
  );
}
