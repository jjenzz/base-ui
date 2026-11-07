import type * as React from 'react';

/** What the listbox knows about one item: its label, value and disabled state. */
export interface ListboxItemData {
  getLabel: () => string | null;
  value: any;
  disabled: boolean;
}

export interface ItemDataReader<T> {
  length: () => number;
  get: (index: number) => T;
}

/**
 * A list of one kind of item data, such as labels, by position. Rendered items write into it, or,
 * with a reader, each entry is read when it's accessed, so typeahead and selection can use it like
 * an array without the data of every item being loaded up front.
 */
export interface ItemDataRef<T> extends React.RefObject<T[]> {
  setReader: (reader: ItemDataReader<T> | null) => void;
}

function toIndex(property: string | symbol) {
  if (typeof property !== 'string') {
    return -1;
  }
  const index = Number(property);
  return Number.isInteger(index) && index >= 0 && String(index) === property ? index : -1;
}

export function createItemDataRef<T>(): ItemDataRef<T> {
  let values: T[] = [];
  let view: T[] | null = null;
  return {
    setReader(reader) {
      view = reader
        ? new Proxy([] as T[], {
            get(target, property, receiver) {
              if (property === 'length') {
                return reader.length();
              }
              const index = toIndex(property);
              return index === -1 ? Reflect.get(target, property, receiver) : reader.get(index);
            },
            has(target, property) {
              const index = toIndex(property);
              return index === -1 ? Reflect.has(target, property) : index < reader.length();
            },
            set() {
              return true;
            },
          })
        : null;
    },
    get current() {
      return view ?? values;
    },
    set current(next: T[]) {
      values = next;
    },
  };
}
