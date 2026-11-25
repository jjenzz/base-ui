'use client';
import * as React from 'react';
import { fastComponentRef } from '@base-ui/utils/fastHooks';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement';
import type { TreeItemId } from '../store/types';

import { useTreeRootContext } from '../root/TreeRootContext';
import { TreeItemContext } from './TreeItemContext';
import { useTreeItem } from '../utils/useTreeItem';
import type { TreeItemBaseState } from '../utils/useTreeItem';
import { expansionMapping, itemMapping } from '../utils/stateAttributesMapping';

/**
 * An individual item in a hierarchical collection, and a row in a tree grid. Clicking it selects it and deselects other items.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Tree](https://base-ui.com/react/components/tree)
 */
export const TreeItem = fastComponentRef(function TreeItem(
  componentProps: TreeItem.Props,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const { itemId } = componentProps;
  const store = useTreeRootContext();
  // A parent node in a plain tree is a wrapper around its `Tree.GroupLabel` (the row) and its
  // `Tree.Group` (the children). The store knows which items are parents, so this is right on the
  // first render and on the server. Tree grid rows stay flat.
  const isParentWrapper = store.useState('isItemExpandable', itemId) && store.grid == null;
  if (isParentWrapper) {
    return <TreeParentItem componentProps={componentProps} forwardedRef={forwardedRef} />;
  }
  return <TreeItemRow componentProps={componentProps} forwardedRef={forwardedRef} />;
});

function TreeParentItem(props: {
  componentProps: TreeItem.Props;
  forwardedRef: React.ForwardedRef<HTMLDivElement>;
}) {
  const { componentProps, forwardedRef } = props;
  const { className, render, style, itemId, ...elementProps } = componentProps;
  const store = useTreeRootContext();
  const expanded = store.useState('isItemExpanded', itemId);
  const element = useRenderElement<{ expanded: boolean }, HTMLDivElement, 'div'>(
    'div',
    componentProps as any,
    {
      state: { expanded },
      ref: forwardedRef,
      props: [elementProps],
      stateAttributesMapping: expansionMapping,
    },
  );
  return <TreeItemContext.Provider value={itemId}>{element}</TreeItemContext.Provider>;
}

function TreeItemRow(props: {
  componentProps: TreeItem.Props;
  forwardedRef: React.ForwardedRef<HTMLDivElement>;
}) {
  const { componentProps, forwardedRef } = props;
  const { className, render, style, itemId, ...elementProps } = componentProps;
  const store = useTreeRootContext();
  const sharedItemResponse = useTreeItem({ store, itemId });
  const { selected, selectionSupported } = sharedItemResponse;

  const state: TreeItem.State = { ...sharedItemResponse.state, selected };

  const element = useRenderElement('div', componentProps, {
    state,
    ref: [forwardedRef, sharedItemResponse.ref],
    props: [
      sharedItemResponse.props,
      // Per WAI-ARIA, when selection is supported, all focusable rows must have
      // aria-selected set to true or false — a disabled row included, and a
      // *selected* disabled row above all. Only a row that cannot be selected at all
      // (`selectionMode="none"`, or `isItemSelectionDisabled`) omits it.
      selectionSupported ? { 'aria-selected': selected } : undefined,
      elementProps,
    ],
    stateAttributesMapping: itemMapping,
  });

  return <TreeItemContext.Provider value={itemId}>{element}</TreeItemContext.Provider>;
}

export interface TreeItemState extends TreeItemBaseState {
  /**
   * Whether the item is currently selected.
   */
  selected: boolean;
}

export interface TreeItemProps extends BaseUIComponentProps<'div', TreeItemState> {
  /**
   * The id of the item.
   */
  itemId: TreeItemId;
}

export namespace TreeItem {
  export type State = TreeItemState;
  export type Props = TreeItemProps;
}
