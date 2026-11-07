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
  value: any;
}

/**
 * Present while `Listbox.Item` renders into the hidden root, which renders the items whose data
 * is being read. Each item registers how to read its data here.
 */
export const ListboxCollectionContext = React.createContext<Map<
  number,
  ListboxHiddenItemEntry
> | null>(null);

/** Whether the hidden root is reading labels, so items whose text is nested need to render it. */
const ListboxHiddenTextContext = React.createContext(false);

function getPlainText(children: React.ReactNode): string | null {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  return null;
}

/**
 * Used by `Listbox.Item`. In the hidden root, the item registers its value, disabled state and
 * how to read its label, and renders nothing, except a bare `<span>` with its text when labels are
 * being read and its text is nested in elements. Returns `undefined` outside the hidden root.
 */
export function useListboxHiddenItem(props: {
  label: string | undefined;
  disabled: boolean | undefined;
  value: any;
  children: React.ReactNode;
}): { element: React.ReactElement | null } | undefined {
  const { label, disabled = false, value = null, children } = props;
  const registry = React.useContext(ListboxCollectionContext);
  const readingText = React.useContext(ListboxHiddenTextContext);
  const index = React.useContext(ListboxItemIndexContext) ?? -1;
  const textRef = React.useRef<HTMLSpanElement>(null);

  const plainText = registry ? (label ?? getPlainText(children)) : null;
  const rendersText = registry != null && readingText && plainText == null;

  useIsoLayoutEffect(() => {
    if (!registry || index === -1) {
      return undefined;
    }
    registry.set(index, {
      getLabel: () => plainText ?? textRef.current?.textContent ?? null,
      disabled,
      value,
    });
    return () => {
      registry.delete(index);
    };
  }, [registry, index, plainText, disabled, value, rendersText]);

  if (!registry) {
    return undefined;
  }
  return { element: rendersText ? <span ref={textRef}>{children}</span> : null };
}

export interface ListboxHiddenBatch {
  indexes: number[];
  /** Whether labels are being read, so nested text renders. */
  text: boolean;
}

export interface ListboxHiddenRootProps {
  /** Receives the function that sets which items render. */
  controllerRef: React.RefObject<((batch: ListboxHiddenBatch) => void) | null>;
  registry: Map<number, ListboxHiddenItemEntry>;
  /** Renders the item at an index with the latest render function. */
  renderItem: (index: number) => React.ReactNode;
}

const EMPTY_BATCH: ListboxHiddenBatch = { indexes: [], text: false };

/**
 * Renders the items whose data is being read, into a detached fragment. It only renders when
 * asked to, not when the list renders.
 */
export const ListboxHiddenRoot = React.memo(function ListboxHiddenRoot(
  props: ListboxHiddenRootProps,
) {
  const { controllerRef, registry, renderItem } = props;
  const [batch, setBatch] = React.useState(EMPTY_BATCH);

  useIsoLayoutEffect(() => {
    controllerRef.current = setBatch;
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef]);

  return (
    <ListboxCollectionContext.Provider value={registry}>
      <ListboxHiddenTextContext.Provider value={batch.text}>
        {batch.indexes.map((index) => (
          <ListboxItemIndexContext.Provider key={index} value={index}>
            {renderItem(index)}
          </ListboxItemIndexContext.Provider>
        ))}
      </ListboxHiddenTextContext.Provider>
    </ListboxCollectionContext.Provider>
  );
});
