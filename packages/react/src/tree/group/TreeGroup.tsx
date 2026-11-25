'use client';
import * as React from 'react';
import { fastComponentRef } from '@base-ui/utils/fastHooks';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import { inertValue } from '@base-ui/utils/inertValue';
import type { BaseUIComponentProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement';
import { useTransitionStatus } from '../../internals/useTransitionStatus';
import type { TransitionStatus } from '../../internals/useTransitionStatus';
import { useOpenChangeComplete } from '../../internals/useOpenChangeComplete';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { useTreeRootContext } from '../root/TreeRootContext';
import { useTreeItemContext } from '../item/TreeItemContext';

/**
 * Wraps the children of a parent item. Renders while the item is expanded, and stays mounted
 * until its exit animation finishes, so it can be animated with CSS like a Collapsible panel.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Tree](https://base-ui.com/react/components/tree)
 */
export const TreeGroup = fastComponentRef(function TreeGroup(
  componentProps: TreeGroup.Props,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const { className, render, style, ...elementProps } = componentProps;
  const store = useTreeRootContext();
  const itemId = useTreeItemContext();
  const expanded = store.useState('isItemExpanded', itemId);
  const { mounted, setMounted, transitionStatus } = useTransitionStatus(expanded, false, true);

  const groupRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | undefined>(undefined);

  useIsoLayoutEffect(() => {
    if (mounted && groupRef.current) {
      setHeight(groupRef.current.scrollHeight);
    }
  }, [mounted, expanded]);

  useOpenChangeComplete({
    // Wait only once the ending style is applied, so the wait sees the exit transition.
    enabled: !expanded && transitionStatus === 'ending',
    open: expanded,
    ref: groupRef,
    restartKey: transitionStatus,
    onComplete() {
      if (!expanded) {
        setMounted(false);
      }
    },
  });

  const state: TreeGroup.State = { expanded, transitionStatus };

  const element = useRenderElement('div', componentProps, {
    state,
    ref: [forwardedRef, groupRef],
    props: [
      {
        style:
          height === undefined
            ? undefined
            : ({ '--tree-group-height': `${height}px` } as React.CSSProperties),
      },
      // A collapsing group leaves Tab and assistive technology at once, before it finishes.
      expanded ? undefined : { 'aria-hidden': true, inert: inertValue(true) },
      elementProps,
    ],
    stateAttributesMapping: transitionStatusMapping,
  });

  return mounted ? element : null;
});

export interface TreeGroupState {
  /**
   * Whether the parent item is expanded.
   */
  expanded: boolean;
  /**
   * The transition status of the group.
   */
  transitionStatus: TransitionStatus;
}

export interface TreeGroupProps extends BaseUIComponentProps<'div', TreeGroupState> {}

export namespace TreeGroup {
  export type State = TreeGroupState;
  export type Props = TreeGroupProps;
}
