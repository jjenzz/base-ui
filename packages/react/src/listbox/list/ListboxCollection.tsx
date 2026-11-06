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

export interface ListboxCollectionItemProps {
  label: string | undefined;
  disabled: boolean;
  children: React.ReactNode;
}

/**
 * An item in the hidden copy: a bare `<span>` that records its label and disabled state at its
 * position. It takes only the data it records, so it renders again only when that data changes,
 * not when the item's value or other props are new objects.
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
