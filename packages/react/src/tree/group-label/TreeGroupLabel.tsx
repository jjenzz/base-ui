'use client';
import type * as React from 'react';
import { fastComponentRef } from '@base-ui/utils/fastHooks';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement';
import { useTreeRootContext } from '../root/TreeRootContext';
import { useTreeItemContext } from '../item/TreeItemContext';
import { useTreeItem } from '../utils/useTreeItem';
import type { TreeItemBaseState } from '../utils/useTreeItem';
import { itemMapping } from '../utils/stateAttributesMapping';

/**
 * The row of a parent item: the focusable `treeitem` that labels its group and toggles it.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Tree](https://base-ui.com/react/components/tree)
 */
export const TreeGroupLabel = fastComponentRef(function TreeGroupLabel(
  componentProps: TreeGroupLabel.Props,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const { className, render, style, ...elementProps } = componentProps;
  const store = useTreeRootContext();
  const itemId = useTreeItemContext();
  const sharedItemResponse = useTreeItem({ store, itemId });
  const { selected, selectionSupported } = sharedItemResponse;
  const state: TreeGroupLabel.State = { ...sharedItemResponse.state, selected };

  return useRenderElement('div', componentProps, {
    state,
    ref: [forwardedRef, sharedItemResponse.ref],
    props: [
      sharedItemResponse.props,
      selectionSupported ? { 'aria-selected': selected } : undefined,
      elementProps,
    ],
    stateAttributesMapping: itemMapping,
  });
});

export interface TreeGroupLabelState extends TreeItemBaseState {
  /**
   * Whether the item is currently selected.
   */
  selected: boolean;
}

export interface TreeGroupLabelProps extends BaseUIComponentProps<'div', TreeGroupLabelState> {}

export namespace TreeGroupLabel {
  export type State = TreeGroupLabelState;
  export type Props = TreeGroupLabelProps;
}
