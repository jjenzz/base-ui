'use client';
import * as React from 'react';
import { useStableCallback } from '@base-ui/utils/useStableCallback';
import { createGenericEventDetails } from '../../internals/createBaseUIEventDetails';
import { getHighlightReason } from '../../utils/getHighlightReason';
import { getHighlightedIndex } from '../store';
import type { ListboxStore } from '../store';
import type { ListboxRoot } from '../root/ListboxRoot';

interface ResolvedHighlight<Value> {
  index: number;
  value: Value | undefined;
}

/**
 * Calls `onItemHighlighted` when the highlighted item changes.
 *
 * Subscribes to the store's highlighted item (the hovered item, or the focused item when the pointer
 * isn't over an item), resolves its value, and derives the reason from the event recorded by the
 * store. With `range`, the value of an item that hasn't been read is read first, and the change
 * is reported once it has, unless the highlight has moved on.
 */
export function useHighlightChangeNotifier<Value>(params: {
  store: ListboxStore;
  onItemHighlighted:
    | ((itemValue: Value | undefined, eventDetails: ListboxRoot.HighlightEventDetails) => void)
    | undefined;
}): void {
  const { store, onItemHighlighted } = params;

  const stableOnItemHighlighted = useStableCallback(
    (itemValue: Value | undefined, eventDetails: ListboxRoot.HighlightEventDetails) => {
      onItemHighlighted?.(itemValue, eventDetails);
    },
  );

  const lastReportedHighlightRef = React.useRef<ResolvedHighlight<Value> | null>(null);
  const cancelReadRef = React.useRef<(() => void) | null>(null);
  // The item whose value is being read, before its highlight is reported.
  const readingIndexRef = React.useRef<number | null>(null);

  const areHighlightsEqual = useStableCallback(
    (prev: ResolvedHighlight<Value> | null, next: ResolvedHighlight<Value>) => {
      if (prev == null || prev.index !== next.index) {
        return false;
      }
      if (prev.value == null || next.value == null) {
        return prev.value === next.value;
      }
      return store.state.isItemEqualToValue(prev.value, next.value);
    },
  );

  const report = useStableCallback((next: ResolvedHighlight<Value>, event: Event | undefined) => {
    if (areHighlightsEqual(lastReportedHighlightRef.current, next)) {
      return;
    }
    lastReportedHighlightRef.current = next;
    stableOnItemHighlighted(
      next.value,
      createGenericEventDetails(getHighlightReason(event), event, {
        index: next.index,
      }) as ListboxRoot.HighlightEventDetails,
    );
  });

  const onStoreChange = useStableCallback(() => {
    const highlightedIndex = getHighlightedIndex(store.state);
    const hasRange = store.state.range != null;
    // With `range`, changes are told apart by position, so the value is only read when the
    // highlight moves, not when the store changes for other reasons, such as an item mounting.
    if (
      hasRange &&
      (readingIndexRef.current != null
        ? highlightedIndex === readingIndexRef.current
        : highlightedIndex === lastReportedHighlightRef.current?.index)
    ) {
      return;
    }
    // The store clears the event once the update that set it is done.
    const event = store.context.highlightEvent;
    cancelReadRef.current?.();
    cancelReadRef.current = null;
    readingIndexRef.current = null;

    if (highlightedIndex == null) {
      report({ index: -1, value: undefined }, event);
      return;
    }

    const { itemReader } = store.context;
    const value = itemReader.getValue(highlightedIndex) as Value | undefined;
    if (value !== undefined || !hasRange) {
      report({ index: highlightedIndex, value }, event);
      return;
    }

    readingIndexRef.current = highlightedIndex;
    cancelReadRef.current = itemReader.read(
      highlightedIndex,
      highlightedIndex,
      { urgent: true, chunkSize: 1 },
      (lookup) => {
        cancelReadRef.current = null;
        readingIndexRef.current = null;
        if (getHighlightedIndex(store.state) === highlightedIndex) {
          report({ index: highlightedIndex, value: lookup(highlightedIndex)?.value }, event);
        }
      },
    );
  });

  React.useEffect(() => {
    if (!onItemHighlighted) {
      lastReportedHighlightRef.current = null;
      return undefined;
    }

    // Records where the highlight starts, without reporting it. With `range`, changes are told
    // apart by position, so it needs no value.
    const highlightedIndex = getHighlightedIndex(store.state);
    lastReportedHighlightRef.current =
      highlightedIndex == null
        ? { index: -1, value: undefined }
        : {
            index: highlightedIndex,
            value:
              store.state.range != null
                ? undefined
                : (store.context.itemReader.getValue(highlightedIndex) as Value | undefined),
          };

    const unsubscribe = store.subscribe(onStoreChange);
    return () => {
      unsubscribe();
      cancelReadRef.current?.();
      cancelReadRef.current = null;
      readingIndexRef.current = null;
    };
  }, [store, onItemHighlighted, onStoreChange]);
}
