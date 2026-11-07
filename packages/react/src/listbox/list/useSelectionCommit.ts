'use client';
import { useStableCallback } from '@base-ui/utils/useStableCallback';
import type { ListboxStore } from '../store';
import type { ListboxRoot } from '../root/ListboxRoot';
import { selectionReducer } from '../utils/selectionReducer';
import type { SelectionAction } from '../utils/selectionReducer';
import { useBrowserYield } from '../utils/useBrowserYield';

// With `range`, a selection that spans more items than this resolves over several tasks, each
// working for about SLICE_MS, reading CHUNK_SIZE items at a time.
const ASYNC_THRESHOLD = 1000;
const CHUNK_SIZE = 250;
const SLICE_MS = 8;

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
 * Commits selection actions. A span of many items that aren't rendered, such as Ctrl/Cmd+A, has
 * to render them to read their values and disabled states, so it resolves a chunk at a time
 * without blocking the page, and commits once. `cancel` drops one that's still resolving.
 */
export function useSelectionCommit(params: {
  store: ListboxStore;
  readRange: (start: number, end: number, values: any[], disabled: boolean[]) => void;
}) {
  const { store, readRange } = params;
  const resolveYield = useBrowserYield();

  const commitSelection = useStableCallback(
    (action: SelectionAction, eventDetails: ListboxRoot.ChangeEventDetails) => {
      resolveYield.cancel();
      const { setValue, valuesRef, disabledItemsRef } = store.context;
      const commit = (values: any[], disabled: Array<boolean | undefined>) => {
        setValue(
          selectionReducer(
            action,
            store.state.value,
            values,
            disabled,
            store.state.isItemEqualToValue,
          ),
          eventDetails,
        );
      };

      const count = store.state.items?.length ?? 0;
      const span = store.state.range != null ? getActionSpan(action, count) : null;
      if (!span || span[1] - span[0] + 1 <= ASYNC_THRESHOLD) {
        commit(valuesRef.current, disabledItemsRef.current);
        return;
      }

      const values: any[] = new Array(count);
      const disabled: boolean[] = new Array(count);
      const token = resolveYield.token();
      let next = span[0];
      const resolveSlice = () => {
        if (token !== resolveYield.token()) {
          return;
        }
        const sliceStart = performance.now();
        while (next <= span[1] && performance.now() - sliceStart < SLICE_MS) {
          const end = Math.min(span[1] + 1, next + CHUNK_SIZE);
          readRange(next, end, values, disabled);
          next = end;
        }
        if (next > span[1]) {
          commit(values, disabled);
        } else {
          resolveYield.schedule(resolveSlice);
        }
      };
      resolveYield.schedule(resolveSlice);
    },
  );
  store.useContextCallback('commitSelection', commitSelection);

  return { commitSelection, cancelPendingSelection: resolveYield.cancel };
}
