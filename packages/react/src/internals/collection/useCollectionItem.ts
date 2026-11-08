'use client';
import * as React from 'react';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import {
  CollectionContext,
  CollectionHiddenContext,
  CollectionItemIndexContext,
} from './CollectionContext';

export interface CollectionItem {
  /** The item's position in the whole collection, or `-1` outside one. */
  index: number;
  /** Whether the item is rendering into the hidden fragment, only so its data can be read. */
  hidden: boolean;
  /** In the hidden fragment, whether the read needs the item's nested text rendered. */
  text: boolean;
}

/**
 * Registers an item's data with its collection, at the position `CollectionItemIndex` gives it.
 * `data` is whatever the item's component wants the collection to know, such as its value and
 * how to read its label. Registering writes to a map; it never renders anything.
 */
export function useCollectionItem<Data>(data: Data): CollectionItem {
  const index = React.useContext(CollectionItemIndexContext) ?? -1;
  const hiddenContext = React.useContext(CollectionHiddenContext);
  const collection = React.useContext(CollectionContext);

  // Hidden items register for the read in progress; rendered ones with the collection.
  let registry: Map<number, Data> | null = null;
  if (hiddenContext) {
    registry = hiddenContext.registry;
  } else if (collection?.enabled) {
    registry = collection.rendered;
  }

  useIsoLayoutEffect(() => {
    if (!registry || index === -1) {
      return undefined;
    }
    registry.set(index, data);
    return () => {
      // A later item may have registered at this position in the same commit.
      if (registry.get(index) === data) {
        registry.delete(index);
      }
    };
  }, [registry, index, data]);

  return { index, hidden: hiddenContext != null, text: hiddenContext?.text ?? false };
}

/** Whether the component is rendering inside the hidden fragment. */
export function useIsHiddenCollectionItem() {
  return React.useContext(CollectionHiddenContext) != null;
}
