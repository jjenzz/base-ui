'use client';
import * as React from 'react';
import { useStore } from '@base-ui/utils/store';
import type { TreeItemId } from '../store/types';
import { selectors } from '../store/selectors';
import { useTreeRootContext } from '../root/TreeRootContext';
import { getItemIdKey } from './itemIdKey';

/**
 * Returns how many visible rows an item takes up, counting itself and its expanded
 * descendants, so a virtualizer can size a nested group before it renders.
 * Changes identity only when the visible rows change.
 */
export function useTreeRowCount(): (itemId: TreeItemId) => number {
  const store = useTreeRootContext();
  const flatList = useStore(store, selectors.flatList);
  return React.useMemo(() => {
    const counts = new Map<string, number>();
    const stack: Array<{ key: string; level: number }> = [];
    for (const itemId of flatList) {
      const level = selectors.itemLevel(store.state, itemId);
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      for (const ancestor of stack) {
        counts.set(ancestor.key, counts.get(ancestor.key)! + 1);
      }
      const key = getItemIdKey(itemId);
      counts.set(key, 1);
      stack.push({ key, level });
    }
    return (itemId: TreeItemId) => counts.get(getItemIdKey(itemId)) ?? 1;
  }, [flatList, store]);
}
