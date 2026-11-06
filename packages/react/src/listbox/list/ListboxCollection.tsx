'use client';
import * as React from 'react';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import { useListboxRootContext } from '../root/ListboxRootContext';
import { ListboxItemContext } from '../item/ListboxItemContext';
import type { ListboxItem } from '../item/ListboxItem';

/**
 * The position of the item being rendered by `Listbox.List`'s render function.
 */
export const ListboxItemIndexContext = React.createContext<number | undefined>(undefined);

/**
 * Whether `Listbox.Item` renders into the hidden collection, which records every item's label
 * and disabled state so the listbox knows them for items that aren't rendered.
 */
export const ListboxCollectionContext = React.createContext(false);

const COLLECTION_ITEM_CONTEXT: ListboxItemContext = {
  selected: false,
  indexRef: { current: -1 },
  hasRegistered: false,
};

/**
 * `Listbox.Item` inside the hidden collection. Records the item's label and disabled state.
 */
export function ListboxCollectionItem(props: ListboxItem.Props) {
  const { label, disabled = false, children } = props;
  const index = React.useContext(ListboxItemIndexContext) ?? -1;
  const store = useListboxRootContext();
  const textRef = React.useRef<HTMLSpanElement>(null);

  useIsoLayoutEffect(() => {
    if (index === -1) {
      return undefined;
    }
    const labels = store.context.labelsRef.current;
    const disabledItems = store.context.disabledItemsRef.current;
    labels[index] = label ?? textRef.current?.textContent ?? null;
    disabledItems[index] = disabled;
    return () => {
      delete labels[index];
      delete disabledItems[index];
    };
  }, [disabled, index, label, store]);

  return (
    <ListboxItemContext.Provider value={COLLECTION_ITEM_CONTEXT}>
      <span ref={textRef}>{children}</span>
    </ListboxItemContext.Provider>
  );
}
