'use client';
import * as React from 'react';

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

/**
 * A ref to a list of item data, such as labels, that can be built the first time it's read.
 * Without `resolve`, it's a plain ref that parts write into.
 */
export interface LazyArrayRef<T> extends React.RefObject<T[]> {
  /** Builds the list. Called when `current` is read after `invalidate()`. */
  resolve: (() => T[]) | null;
  /** Marks the list as out of date, so the next read builds it again. */
  invalidate: () => void;
}

export function createLazyArrayRef<T>(): LazyArrayRef<T> {
  let values: T[] = [];
  let stale = false;
  const ref: LazyArrayRef<T> = {
    resolve: null,
    invalidate() {
      stale = true;
    },
    get current() {
      if (stale && ref.resolve) {
        stale = false;
        values = ref.resolve();
      }
      return values;
    },
    set current(next: T[]) {
      stale = false;
      values = next;
    },
  };
  return ref;
}

export interface ListboxCollection {
  /**
   * Registers a hidden item's element, whose text is read only when its label is needed, or
   * forgets it when `element` is `null`.
   */
  record: (
    element: HTMLElement | null,
    index: number,
    label: string | undefined,
    disabled: boolean,
  ) => void;
}

/**
 * Present while `Listbox.Item` renders into the hidden copy, which holds the items whose label
 * can only be read from their rendered text.
 */
export const ListboxCollectionContext = React.createContext<ListboxCollection | null>(null);

export interface ListboxCollectionItemProps {
  label: string | undefined;
  disabled: boolean;
  children: React.ReactNode;
}

/**
 * An item in the hidden copy: a bare `<span>` that renders the item's text and registers itself
 * at its position. It takes only the data it uses, so it renders again only when that data
 * changes, not when the item's value or other props are new objects.
 */
export const ListboxCollectionItem = React.memo(function ListboxCollectionItem(
  props: ListboxCollectionItemProps,
) {
  const { label, disabled, children } = props;
  const collection = React.useContext(ListboxCollectionContext);
  const index = React.useContext(ListboxItemIndexContext) ?? -1;

  // `children` is a dependency so the label is read again when the text changes.
  const ref = React.useCallback(
    (element: HTMLElement | null) => collection?.record(element, index, label, disabled),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collection, index, label, disabled, children],
  );

  return <span ref={ref}>{label == null ? children : null}</span>;
});
