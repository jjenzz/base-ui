'use client';
import * as React from 'react';

/**
 * The position of the item being rendered by `Listbox.List`'s render function.
 */
export const ListboxItemIndexContext = React.createContext<number | undefined>(undefined);

export interface ListboxCollection {
  /**
   * Records an item's label and disabled state, or forgets them when `element` is `null`.
   */
  record: (
    element: HTMLElement | null,
    index: number,
    label: string | undefined,
    disabled: boolean,
  ) => void;
}

/**
 * Present while `Listbox.Item` renders into the hidden copy of every item, which records each
 * label and disabled state so the listbox knows them for items that aren't rendered.
 */
export const ListboxCollectionContext = React.createContext<ListboxCollection | null>(null);

/**
 * A stable key for each item, so an item keeps its rendered element when other items are added,
 * removed or moved. Object items get a generated key; primitive items are keyed by their value.
 * Duplicates get a suffix.
 */
export function createItemKeys() {
  const objectKeys = new WeakMap<object, string>();
  let nextKey = 0;

  return function getKeys(items: readonly any[]): string[] {
    const seen = new Map<string, number>();
    return items.map((item) => {
      let key: string;
      if ((typeof item === 'object' && item !== null) || typeof item === 'function') {
        key = objectKeys.get(item) ?? '';
        if (!key) {
          key = `o${nextKey}`;
          nextKey += 1;
          objectKeys.set(item, key);
        }
      } else {
        key = `${typeof item}:${String(item)}`;
      }
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      return count === 0 ? key : `${key}#${count}`;
    });
  };
}
