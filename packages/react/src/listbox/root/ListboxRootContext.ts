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

export interface ListboxConfigContext {
  id: string | undefined;
  disabled: boolean;
  multiple: boolean | 'opt-in';
  orientation: 'vertical' | 'horizontal';
  highlightItemOnHover: boolean;
  /** Every item, flattened when grouped. */
  items: readonly any[] | undefined;
  /** Whether only some of the items render, so the rest are read through the collection. */
  hasRange: boolean;
}

/**
 * The Root's settings, which rarely change and are the same for every part. Parts read them from
 * here rather than each subscribing to the store, which is for state that changes often, such as
 * which item is highlighted or selected.
 */
export const ListboxConfigContext = React.createContext<ListboxConfigContext | null>(null);

export function useListboxConfigContext() {
  const config = React.useContext(ListboxConfigContext);
  if (config === null) {
    throw new Error(
      'Base UI: ListboxConfigContext is missing. Listbox parts must be placed within <Listbox.Root>.',
    );
  }
  return config;
}

export function useListboxRootContext() {
  const store = React.useContext(ListboxRootContext);
  if (store === null) {
    throw new Error(
      'Base UI: ListboxRootContext is missing. Listbox parts must be placed within <Listbox.Root>.',
    );
  }
  return store;
}
