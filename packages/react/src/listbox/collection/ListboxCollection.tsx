'use client';
import * as React from 'react';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import { EMPTY_ARRAY } from '@base-ui/utils/empty';
import { ListboxItemsContext, useListboxRootContext } from '../root/ListboxRootContext';
import { useListboxGroupContext } from '../group/ListboxGroupContext';
import { ListboxItemIndexContext, ListboxListGroupContext } from './ListboxCollectionContext';

/**
 * Renders the items: those of the enclosing `Listbox.Group` when it has `items`, otherwise every
 * item. With `range` on `Listbox.Root`, only the items in the range render.
 * Doesn't render its own HTML element.
 *
 * If rendering a flat list, pass a function child to the `List` component instead, which
 * implicitly wraps it.
 *
 * Documentation: [Base UI Listbox](https://base-ui.com/react/components/listbox)
 */
export function ListboxCollection(props: ListboxCollection.Props): React.JSX.Element {
  const { children } = props;

  const store = useListboxRootContext();
  const { items, range } = React.useContext(ListboxItemsContext);
  const listGroup = React.useContext(ListboxListGroupContext);
  const groupItems = useListboxGroupContext(true)?.items;

  // The listbox calls this function for items that aren't rendered, to read their labels and
  // disabled states.
  const groupIndex = listGroup?.index ?? -1;
  useIsoLayoutEffect(() => {
    store.context.itemTemplates.set(groupIndex, children);
  });

  const source = groupItems ?? items ?? EMPTY_ARRAY;
  // The position of the group's first item in the whole list.
  const offset = groupItems ? (listGroup?.offset ?? 0) : 0;
  let from = 0;
  let to = source.length - 1;
  if (range) {
    from = Math.max(from, range.start - offset);
    to = Math.min(to, range.end - offset);
  }

  const rendered: React.ReactNode[] = [];
  for (let position = from; position <= to; position += 1) {
    const index = offset + position;
    rendered.push(
      <ListboxItemIndexContext.Provider key={index} value={index}>
        {children(source[position], position)}
      </ListboxItemIndexContext.Provider>,
    );
  }

  return <React.Fragment>{rendered}</React.Fragment>;
}

export interface ListboxCollectionState {}

export interface ListboxCollectionProps {
  /**
   * Renders one item, called with the item and its index: within the enclosing `Listbox.Group`
   * when it has `items`, otherwise in the whole list.
   */
  children: (item: any, index: number) => React.ReactNode;
}

export namespace ListboxCollection {
  export type State = ListboxCollectionState;
  export type Props = ListboxCollectionProps;
}
