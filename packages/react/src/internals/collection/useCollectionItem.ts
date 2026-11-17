'use client';
import * as React from 'react';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import {
  CollectionContext,
  CollectionHiddenContext,
  CollectionItemIndexContext,
} from './CollectionContext';

export interface CollectionItem {
  /** The position the item registered at, or `-1` when it didn't register. */
  index: number;
  /** Whether the item is rendering into the hidden fragment, only so its data can be read. */
  hidden: boolean;
  /** In the hidden fragment, whether the read needs the item's nested text rendered. */
  text: boolean;
}

/**
 * Registers an item's data with its collection. `data` is whatever the item's component wants the
 * collection to know, such as its value and how to read its label. Registering writes to a map
 * keyed by position; it never renders anything.
 *
 * - In the hidden fragment, the collection gives the item its position, and `index` is ignored.
 * - When rendered, the item registers at `index`, the position its list gave it. Without `index`,
 *   a rendered item doesn't register, so a component can call this once to learn whether it's
 *   hidden, and again where it knows its position.
 */
export function useCollectionItem<Data>(data: Data, index?: number): CollectionItem {
  const indexFromCollection = React.useContext(CollectionItemIndexContext);
  const hiddenContext = React.useContext(CollectionHiddenContext);
  const collection = React.useContext(CollectionContext);

  let position = -1;
  let registry: Map<number, Data> | null = null;
  if (hiddenContext) {
    position = indexFromCollection ?? -1;
    registry = hiddenContext.registry;
  } else if (index !== undefined && collection) {
    position = index;
    registry = collection.rendered;
  }

  useIsoLayoutEffect(() => {
    if (!registry || position === -1) {
      return undefined;
    }
    registry.set(position, data);
    return () => {
      // A later item may have registered at this position in the same commit.
      if (registry.get(position) === data) {
        registry.delete(position);
      }
    };
  }, [registry, position, data]);

  return { index: position, hidden: hiddenContext != null, text: hiddenContext?.text ?? false };
}

/** Whether the component is rendering inside the hidden fragment. */
export function useIsHiddenCollectionItem() {
  return React.useContext(CollectionHiddenContext) != null;
}
