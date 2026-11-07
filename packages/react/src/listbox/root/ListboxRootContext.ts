'use client';
import * as React from 'react';
import type { ListboxStore } from '../store';

export const ListboxRootContext = React.createContext<ListboxStore | null>(null);

export interface ListboxItemsContext {
  /** Every item, flattened when grouped. */
  items: readonly any[] | undefined;
  itemGroups: ReadonlyArray<{ items: readonly any[] }> | undefined;
  range: { start: number; end: number } | undefined;
}

/**
 * The items and range from the latest render of `Listbox.Root`. The parts that render items read
 * them from here rather than the store, which only updates after the render, so a new range
 * renders once rather than first with the previous range.
 */
export const ListboxItemsContext = React.createContext<ListboxItemsContext>({
  items: undefined,
  itemGroups: undefined,
  range: undefined,
});

export function useListboxRootContext() {
  const store = React.useContext(ListboxRootContext);
  if (store === null) {
    throw new Error(
      'Base UI: ListboxRootContext is missing. Listbox parts must be placed within <Listbox.Root>.',
    );
  }
  return store;
}
