'use client';
import * as React from 'react';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';

/**
 * The position of the item being rendered by `Listbox.List`'s render function.
 */
export const ListboxItemIndexContext = React.createContext<number | undefined>(undefined);

/**
 * The group being rendered by `Listbox.List`'s render function, with the position of its first
 * item in the whole list.
 */
export const ListboxListGroupContext = React.createContext<
  { index: number; offset: number } | undefined
>(undefined);

export interface ItemDataReader<T> {
  length: () => number;
  get: (index: number) => T;
}

/**
 * A ref to a list of item data, such as labels. Parts write into it directly, or, with a reader,
 * each entry is read when it's accessed, so data is only loaded for the items that need it.
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

export interface ListboxHiddenItemEntry {
  getLabel: () => string | null;
  disabled: boolean;
}

/**
 * Present while `Listbox.Item` renders into the hidden root, which renders the items whose data
 * is being read. Each item registers how to read its label and disabled state here.
 */
export const ListboxCollectionContext = React.createContext<Map<
  number,
  ListboxHiddenItemEntry
> | null>(null);

export interface ListboxCollectionItemProps {
  label: string | undefined;
  disabled: boolean;
  children: React.ReactNode;
}

/**
 * An item in the hidden root: a bare `<span>` that renders the item's text when it has no
 * `label`, and registers how to read its label and disabled state. The text is only read when
 * it's needed.
 */
export const ListboxCollectionItem = React.memo(function ListboxCollectionItem(
  props: ListboxCollectionItemProps,
) {
  const { label, disabled, children } = props;
  const registry = React.useContext(ListboxCollectionContext);
  const index = React.useContext(ListboxItemIndexContext) ?? -1;

  const ref = React.useCallback(
    (element: HTMLElement | null) => {
      if (!registry || index === -1) {
        return;
      }
      if (element) {
        registry.set(index, { getLabel: () => label ?? element.textContent, disabled });
      } else {
        registry.delete(index);
      }
    },
    [registry, index, label, disabled],
  );

  return <span ref={ref}>{label == null ? children : null}</span>;
});

export interface ListboxHiddenRootProps {
  /** Receives the function that sets which items render. */
  controllerRef: React.RefObject<((indexes: number[]) => void) | null>;
  registry: Map<number, ListboxHiddenItemEntry>;
  /** Renders the item at an index with the latest render function. */
  renderItem: (index: number) => React.ReactNode;
}

/**
 * Renders the items whose data is being read, into a detached fragment. It only renders when
 * asked to, not when the list renders.
 */
export const ListboxHiddenRoot = React.memo(function ListboxHiddenRoot(
  props: ListboxHiddenRootProps,
) {
  const { controllerRef, registry, renderItem } = props;
  const [indexes, setIndexes] = React.useState<number[]>([]);

  useIsoLayoutEffect(() => {
    controllerRef.current = setIndexes;
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef]);

  return (
    <ListboxCollectionContext.Provider value={registry}>
      {indexes.map((index) => (
        <ListboxItemIndexContext.Provider key={index} value={index}>
          {renderItem(index)}
        </ListboxItemIndexContext.Provider>
      ))}
    </ListboxCollectionContext.Provider>
  );
});
