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
 * store.
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
  // Reading a value can render items that aren't rendered, which commits other store changes.
  // Those are part of the same highlight change, so they're ignored while it's being read.
  const resolvingRef = React.useRef(false);

  const resolveHighlightedItem = useStableCallback(
    (previous: ResolvedHighlight<Value> | null): ResolvedHighlight<Value> => {
      const highlightedIndex = getHighlightedIndex(store.state);

      if (highlightedIndex == null) {
        return { index: -1, value: undefined };
      }

      // With `range`, reading the value of an item that isn't rendered renders it, so the value is
      // only read when the highlight moves, which happens in event handlers, not when the store
      // changes for other reasons, such as an item mounting.
      if (store.state.range != null) {
        if (previous?.index === highlightedIndex) {
          return previous;
        }
        if (previous == null) {
          return {
            index: highlightedIndex,
            value: store.context.itemReader.peekValue(highlightedIndex),
          };
        }
      }

      return {
        index: highlightedIndex,
        value: store.context.itemReader.getValue(highlightedIndex) as Value | undefined,
      };
    },
  );

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

  React.useEffect(() => {
    if (!onItemHighlighted) {
      lastReportedHighlightRef.current = null;
      return undefined;
    }

    lastReportedHighlightRef.current = resolveHighlightedItem(null);

    return store.subscribe(() => {
      if (resolvingRef.current) {
        return;
      }
      resolvingRef.current = true;
      let nextHighlight: ResolvedHighlight<Value>;
      try {
        nextHighlight = resolveHighlightedItem(lastReportedHighlightRef.current);
      } finally {
        resolvingRef.current = false;
      }

      if (areHighlightsEqual(lastReportedHighlightRef.current, nextHighlight)) {
        return;
      }

      lastReportedHighlightRef.current = nextHighlight;

      const event = store.context.highlightEvent;
      stableOnItemHighlighted(
        nextHighlight.value,
        createGenericEventDetails(getHighlightReason(event), event, {
          index: nextHighlight.index,
        }) as ListboxRoot.HighlightEventDetails,
      );
    });
  }, [
    store,
    onItemHighlighted,
    stableOnItemHighlighted,
    resolveHighlightedItem,
    areHighlightsEqual,
  ]);
}
