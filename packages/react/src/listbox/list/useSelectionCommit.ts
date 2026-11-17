'use client';
import * as React from 'react';
import { useStableCallback } from '@base-ui/utils/useStableCallback';
import type { ListboxStore } from '../store';
import type { ListboxRoot } from '../root/ListboxRoot';
import { selectionReducer } from '../utils/selectionReducer';
import type { SelectionAction } from '../utils/selectionReducer';

// Selection reads the items in a span this many at a time.
const SPAN_CHUNK = 250;

/** The first and last position a selection action reads, when it reads a span of items. */
function getActionSpan(action: SelectionAction, count: number): [number, number] | null {
  switch (action.type) {
    case 'selectAll':
      return count > 0 ? [0, count - 1] : null;
    case 'selectRange':
      return [Math.min(action.from, action.to), Math.max(action.from, action.to)];
    case 'extendTo':
      return action.anchorIndex === null
        ? null
        : [Math.min(action.anchorIndex, action.index), Math.max(action.anchorIndex, action.index)];
    default:
      return null;
  }
}

/**
 * Commits selection actions. With `range`, an action that spans items, such as Ctrl/Cmd+A, first
 * reads the items it covers that aren't known yet, without blocking the page, then commits once.
 * `cancelPendingSelection` drops one that's still being read.
 */
export function useSelectionCommit(params: { store: ListboxStore }) {
  const { store } = params;
  const cancelRef = React.useRef<(() => void) | null>(null);

  const cancelPendingSelection = useStableCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
  });

  const commitSelection = useStableCallback(
    (action: SelectionAction, eventDetails: ListboxRoot.ChangeEventDetails) => {
      cancelPendingSelection();
      const { itemReader } = store.context;
      const count = itemReader.count();

      const commit = (getValue: (index: number) => any, isDisabled: (index: number) => boolean) => {
        store.context.setValue(
          selectionReducer(
            action,
            store.state.value,
            { count, getValue, isDisabled },
            store.state.isItemEqualToValue,
          ),
          eventDetails,
        );
      };

      // Other actions only involve the item that was pressed or focused, which is rendered.
      const span = store.state.range != null ? getActionSpan(action, count) : null;
      if (!span) {
        commit(itemReader.getValue, itemReader.isDisabled);
        return;
      }

      cancelRef.current = itemReader.read(
        span[0],
        span[1],
        { urgent: true, chunkSize: SPAN_CHUNK },
        (lookup) => {
          cancelRef.current = null;
          commit(
            (index) => lookup(index)?.value,
            (index) => lookup(index)?.disabled ?? false,
          );
        },
      );
    },
  );
  store.useContextCallback('commitSelection', commitSelection);

  return { commitSelection, cancelPendingSelection };
}
