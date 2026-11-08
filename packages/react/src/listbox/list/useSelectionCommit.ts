'use client';
import * as React from 'react';
import { useStableCallback } from '@base-ui/utils/useStableCallback';
import type { ListboxStore } from '../store';
import type { ListboxRoot } from '../root/ListboxRoot';
import type { ListboxItemData } from '../utils/itemData';
import type { Collection } from '../../internals/collection';
import { selectionReducer } from '../utils/selectionReducer';
import type { SelectionAction } from '../utils/selectionReducer';

// With `range`, a selection that spans more items than this reads them over several tasks.
const ASYNC_THRESHOLD = 1000;

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
 * Commits selection actions. A span of many items that aren't rendered, such as Ctrl/Cmd+A, is
 * read without blocking the page, then committed once. `cancelPendingSelection` drops one that's
 * still being read.
 */
export function useSelectionCommit(params: {
  store: ListboxStore;
  collection: Collection<ListboxItemData>;
}) {
  const { store, collection } = params;
  const cancelRef = React.useRef<(() => void) | null>(null);

  const cancelPendingSelection = useStableCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
  });

  const commitSelection = useStableCallback(
    (action: SelectionAction, eventDetails: ListboxRoot.ChangeEventDetails) => {
      cancelPendingSelection();
      const { setValue, itemReader } = store.context;
      const { value, isItemEqualToValue, range } = store.state;
      const count = itemReader.count();

      const span = range != null ? getActionSpan(action, count) : null;
      if (!span || span[1] - span[0] + 1 <= ASYNC_THRESHOLD) {
        setValue(
          selectionReducer(
            action,
            value,
            { count, getValue: itemReader.getValue, isDisabled: itemReader.isDisabled },
            isItemEqualToValue,
          ),
          eventDetails,
        );
        return;
      }

      cancelRef.current = collection.readSpan(span[0], span[1], (data) => {
        cancelRef.current = null;
        setValue(
          selectionReducer(
            action,
            store.state.value,
            {
              count,
              getValue: (index) => data[index]?.value,
              isDisabled: (index) => store.state.disabled || (data[index]?.disabled ?? false),
            },
            store.state.isItemEqualToValue,
          ),
          eventDetails,
        );
      });
    },
  );
  store.useContextCallback('commitSelection', commitSelection);

  return { commitSelection, cancelPendingSelection };
}
