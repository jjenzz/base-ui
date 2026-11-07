'use client';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { useStableCallback } from '@base-ui/utils/useStableCallback';
import { useRefWithInit } from '@base-ui/utils/useRefWithInit';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import type { ListboxStore } from '../store';
import type { ListboxItemData } from '../utils/itemData';
import { useBrowserYield } from '../utils/useBrowserYield';
import type { ListboxHiddenBatch, ListboxHiddenRootProps } from './ListboxHiddenItems';

// Items are read in batches that start at this size and double while reads keep moving forward.
const MIN_BATCH_SIZE = 250;
const MAX_BATCH_SIZE = 2000;
// During a typing session, labels are read ahead this far past the highlighted item, in slices of
// about this long.
const READ_AHEAD_DISTANCE = 2000;
const READ_AHEAD_SLICE_MS = 8;

export interface GroupInfo {
  index: number;
  offset: number;
  size: number;
}

/** What's been read about an item that isn't rendered. `label` is set once it's been read. */
interface ReadItem {
  value: any;
  disabled: boolean;
  label?: string | null | undefined;
}

interface ReadCache {
  items: Array<ReadItem | undefined>;
  /** Where the last batch ended, and its size, so a batch that follows on can be larger. */
  batchEnd: number;
  batchSize: number;
}

function createCache(): ReadCache {
  return { items: [], batchEnd: -1, batchSize: 0 };
}

/**
 * Reads the labels, values and disabled states of items that aren't rendered, for typeahead,
 * selection and the tab stop. Rendered items register their own data. For the rest, a batch of
 * items renders into a hidden root with the latest render functions, and each registers its data.
 *
 * What's read is kept until the list renders again, since a render can change what the render
 * functions return. During a typing session it's kept until the session ends.
 */
export function useItemDataReader(params: {
  store: ListboxStore;
  enabled: boolean;
  groupInfos: GroupInfo[] | undefined;
}) {
  const { store, enabled, groupInfos } = params;
  const { typingRef } = store.context;

  const fragment = useRefWithInit(() =>
    typeof document === 'undefined' ? null : document.createDocumentFragment(),
  ).current;
  const registry = useRefWithInit(() => new Map<number, ListboxItemData>()).current;
  const controllerRef = React.useRef<((batch: ListboxHiddenBatch) => void) | null>(null);
  const cacheRef = React.useRef(createCache());

  // Renders an item with the render function of its group's `Listbox.Collection`. A group that
  // isn't rendered uses the render function of one that is.
  const renderItem = useStableCallback((index: number) => {
    const { itemTemplates } = store.context;
    let groupIndex = -1;
    let offset = 0;
    for (const info of groupInfos ?? []) {
      if (info.offset > index) {
        break;
      }
      groupIndex = info.index;
      offset = info.offset;
    }
    let template = itemTemplates.get(groupIndex);
    if (!template) {
      itemTemplates.forEach((candidate) => {
        template = candidate;
      });
    }
    return template ? template(store.state.items?.[index], index - offset) : null;
  });

  // Renders the items at `indexes` and passes what each registered to `read`.
  const renderAndRead = (
    indexes: number[],
    text: boolean,
    read: (index: number, data: ListboxItemData | undefined) => void,
  ) => {
    ReactDOM.flushSync(() => {
      controllerRef.current?.({ indexes, text });
    });
    for (const index of indexes) {
      read(index, registry.get(index));
    }
  };

  const remember = (index: number, data: ListboxItemData | undefined, withLabel: boolean) => {
    // Rendering can also commit a render of the list, which starts a new cache, so the data goes
    // into the current one.
    const value = data?.value;
    const disabled = data?.disabled ?? false;
    cacheRef.current.items[index] = withLabel
      ? { value, disabled, label: data ? data.getLabel() : null }
      : { value, disabled };
  };

  // Reads an item, and the items after it in the same batch.
  const readItem = useStableCallback((index: number, withLabel: boolean): ReadItem | undefined => {
    const cache = cacheRef.current;
    const isRead = (position: number) => {
      const item = cache.items[position];
      return item != null && (!withLabel || 'label' in item);
    };
    if (!isRead(index)) {
      const count = store.state.items?.length ?? 0;
      cache.batchSize =
        index === cache.batchEnd ? Math.min(cache.batchSize * 2, MAX_BATCH_SIZE) : MIN_BATCH_SIZE;
      cache.batchEnd = Math.min(count, index + cache.batchSize);
      const indexes: number[] = [];
      for (let position = index; position < cache.batchEnd; position += 1) {
        if (!isRead(position)) {
          indexes.push(position);
        }
      }
      renderAndRead(indexes, withLabel, (position, data) => remember(position, data, withLabel));
    }
    return cacheRef.current.items[index];
  });

  /** Reads the values and disabled states of the items from `start` up to `end`. */
  const readRange = useStableCallback(
    (start: number, end: number, values: any[], disabled: boolean[]) => {
      const missing: number[] = [];
      for (let index = start; index < end; index += 1) {
        const rendered = store.context.renderedItems.get(index);
        if (rendered) {
          values[index] = rendered.value;
          disabled[index] = rendered.disabled;
        } else {
          missing.push(index);
        }
      }
      if (missing.length > 0) {
        renderAndRead(missing, false, (index, data) => {
          values[index] = data?.value;
          disabled[index] = data?.disabled ?? false;
        });
      }
    },
  );

  // Typeahead and selection read the data through these, like arrays.
  useIsoLayoutEffect(() => {
    const { labelsRef, valuesRef, disabledItemsRef, renderedItems } = store.context;
    if (!enabled) {
      labelsRef.setReader(null);
      valuesRef.setReader(null);
      disabledItemsRef.setReader(null);
      return;
    }
    const length = () => store.state.items?.length ?? 0;
    labelsRef.setReader({
      length,
      get: (index) => {
        const rendered = renderedItems.get(index);
        return rendered ? rendered.getLabel() : (readItem(index, true)?.label ?? null);
      },
    });
    valuesRef.setReader({
      length,
      get: (index) => {
        const rendered = renderedItems.get(index);
        return rendered ? rendered.value : readItem(index, false)?.value;
      },
    });
    disabledItemsRef.setReader({
      length,
      get: (index) =>
        renderedItems.get(index)?.disabled ?? readItem(index, false)?.disabled ?? false,
    });
  }, [enabled, readItem, store]);

  useIsoLayoutEffect(() => {
    if (!typingRef.current) {
      cacheRef.current = createCache();
    }
  });

  // During a typing session, labels after the highlighted item are read ahead between keystrokes,
  // in the order typeahead searches them. Each key moves the window on from wherever the search
  // landed. Positions keep counting past the end, which wraps to the start like typeahead does.
  const readAheadYield = useBrowserYield();
  const readAheadRef = React.useRef<{ cursor: number; end: number; running: boolean } | null>(null);

  const stopReadAhead = useStableCallback(() => {
    readAheadYield.cancel();
    readAheadRef.current = null;
  });

  const startReadAhead = useStableCallback(() => {
    const count = store.state.items?.length ?? 0;
    if (!enabled || count === 0) {
      return;
    }
    const from = (store.state.activeIndex ?? -1) + 1;
    const end = from + Math.min(READ_AHEAD_DISTANCE, count);
    let state = readAheadRef.current;
    if (!state) {
      state = { cursor: from, end, running: false };
      readAheadRef.current = state;
    } else {
      state.cursor = Math.max(state.cursor, from);
      state.end = Math.max(state.end, end);
    }
    if (state.running) {
      return;
    }
    state.running = true;

    const current = state;
    const readSlice = () => {
      if (readAheadRef.current !== current) {
        return;
      }
      const sliceStart = performance.now();
      while (current.cursor < current.end && performance.now() - sliceStart < READ_AHEAD_SLICE_MS) {
        const index = current.cursor % count;
        const rendered = store.context.renderedItems.get(index);
        if (rendered) {
          // Kept, since the item may scroll out of the window before typeahead reads it.
          remember(index, rendered, true);
        } else {
          readItem(index, true);
        }
        current.cursor += 1;
      }
      if (current.cursor < current.end) {
        readAheadYield.schedule(readSlice);
      } else {
        current.running = false;
      }
    };
    readAheadYield.schedule(readSlice);
  });

  const hiddenRoot: { fragment: DocumentFragment; props: ListboxHiddenRootProps } | null =
    enabled && fragment ? { fragment, props: { controllerRef, registry, renderItem } } : null;

  return { hiddenRoot, readRange, startReadAhead, stopReadAhead };
}
