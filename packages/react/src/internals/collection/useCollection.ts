'use client';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { useStableCallback } from '@base-ui/utils/useStableCallback';
import { useRefWithInit } from '@base-ui/utils/useRefWithInit';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import { useBrowserYield } from './useBrowserYield';

// Items that aren't rendered are read in batches that start at this size and double while reads
// keep moving forward.
const MIN_BATCH_SIZE = 250;
const MAX_BATCH_SIZE = 2000;
// `readSpan` and `readAhead` work in slices of about this long, yielding to the browser between.
const SLICE_MS = 8;
// `readSpan` reads this many items per batch.
const SPAN_CHUNK_SIZE = 250;
// `readAhead` reads this far past where it starts.
const READ_AHEAD_DISTANCE = 2000;

export interface CollectionOptions<Item> {
  /** Every item, including those that aren't rendered. */
  items: readonly Item[] | undefined;
  /** Renders one item, as the consumer would. Called for items that aren't rendered. */
  render: (item: Item, index: number) => React.ReactNode;
  /** Whether items can be unrendered, so their data has to be read from the hidden fragment. */
  enabled: boolean;
}

export interface CollectionReadOptions {
  /** Whether items with nested text should render it, such as to read labels from the DOM. */
  text?: boolean | undefined;
}

export interface Collection<Data> {
  /**
   * The data an item registered with `useCollectionItem`. A rendered item's is read directly;
   * otherwise a batch of items from `index` renders into the hidden fragment. Only call it from
   * event handlers, since it renders synchronously.
   */
  get: (index: number, options?: CollectionReadOptions) => Data | undefined;
  /** The data an item registered, if it's rendered or already read. Never renders. */
  peek: (index: number) => Data | undefined;
  /**
   * Reads the items from `start` to `end`, inclusive, in slices that yield to the browser between
   * them, then calls `onDone` with their data. Returns a function that cancels it.
   */
  readSpan: (
    start: number,
    end: number,
    onDone: (data: ReadonlyArray<Data | undefined>) => void,
  ) => () => void;
  /** Reads items ahead from `from`, with their text, in slices between other work. */
  readAhead: { start: (from: number) => void; stop: () => void };
  /**
   * Keeps what's been read when the list renders again, such as during a typing session. While
   * not held, what's read is forgotten on every render, since what the render function returns
   * may have changed.
   */
  hold: (held: boolean) => void;
}

/**
 * What `CollectionProvider` and `useCollectionItem` share with the collection. Created once and
 * never changed during render: the maps and the ref are only written in effects and handlers.
 */
export interface CollectionInternals<Data> {
  fragment: DocumentFragment | null;
  rendered: Map<number, Data>;
  hiddenRegistry: Map<number, Data>;
  controllerRef: React.RefObject<((batch: HiddenBatch) => void) | null>;
}

/**
 * The items to render into the hidden fragment. Their elements are created by the handler that
 * reads them, so the hidden fragment only renders what it's given.
 */
export interface HiddenBatch {
  entries: ReadonlyArray<{ index: number; element: React.ReactNode }>;
  text: boolean;
}

interface ReadItem<Data> {
  data: Data | undefined;
  /** Whether it was read with its text rendered. */
  text: boolean;
}

interface ReadCache<Data> {
  items: Array<ReadItem<Data> | undefined>;
  /** Where the last batch ended, and its size, so a batch that follows on can be larger. */
  batchEnd: number;
  batchSize: number;
}

function createCache<Data>(): ReadCache<Data> {
  return { items: [], batchEnd: -1, batchSize: 0 };
}

/**
 * A collection of items, only some of which may be rendered, whose data can still be read. Each
 * item registers its data with `useCollectionItem`. Items that aren't rendered render into a
 * hidden fragment, in batches, only when their data is read.
 */
export function useCollection<Item, Data>(
  options: CollectionOptions<Item>,
): Collection<Data> & { enabled: boolean; internals: CollectionInternals<Data> } {
  const { items, render, enabled } = options;

  // The latest options, for handlers. Updated after each commit, never during render.
  const itemsRef = React.useRef(items);
  const renderRef = React.useRef(render);
  const enabledRef = React.useRef(enabled);
  useIsoLayoutEffect(() => {
    itemsRef.current = items;
    renderRef.current = render;
    enabledRef.current = enabled;
  });
  const count = () => itemsRef.current?.length ?? 0;

  const internals = useRefWithInit((): CollectionInternals<Data> => ({
    fragment: typeof document === 'undefined' ? null : document.createDocumentFragment(),
    rendered: new Map(),
    hiddenRegistry: new Map(),
    controllerRef: { current: null },
  })).current;

  const cacheRef = React.useRef(createCache<Data>());
  const heldRef = React.useRef(false);

  useIsoLayoutEffect(() => {
    if (!heldRef.current) {
      cacheRef.current = createCache();
    }
  });

  // Renders the items at `indexes` into the hidden fragment and passes what each registered. Runs
  // in handlers, which create the elements with the latest render function.
  const renderAndRead = (
    indexes: number[],
    text: boolean,
    read: (index: number, data: Data | undefined) => void,
  ) => {
    const list = itemsRef.current ?? [];
    const renderItem = renderRef.current;
    const entries = indexes.map((index) => ({
      index,
      element: index < list.length ? renderItem(list[index], index) : null,
    }));
    ReactDOM.flushSync(() => {
      internals.controllerRef.current?.({ entries, text });
    });
    for (const index of indexes) {
      read(index, internals.hiddenRegistry.get(index));
    }
  };

  const remember = (index: number, data: Data | undefined, text: boolean) => {
    // Rendering can also commit a render of the list, which starts a new cache, so the data goes
    // into the current one.
    cacheRef.current.items[index] = { data, text };
  };

  const peek = useStableCallback((index: number) => {
    const rendered = internals.rendered.get(index);
    return rendered !== undefined ? rendered : cacheRef.current.items[index]?.data;
  });

  const get = useStableCallback((index: number, readOptions?: CollectionReadOptions) => {
    const rendered = internals.rendered.get(index);
    if (rendered !== undefined) {
      return rendered;
    }
    const text = readOptions?.text ?? false;
    const cache = cacheRef.current;
    const isRead = (position: number) => {
      const item = cache.items[position];
      return item != null && (!text || item.text);
    };
    if (!isRead(index)) {
      cache.batchSize =
        index === cache.batchEnd ? Math.min(cache.batchSize * 2, MAX_BATCH_SIZE) : MIN_BATCH_SIZE;
      cache.batchEnd = Math.min(count(), index + cache.batchSize);
      const indexes: number[] = [];
      for (let position = index; position < cache.batchEnd; position += 1) {
        if (!isRead(position) && !internals.rendered.has(position)) {
          indexes.push(position);
        }
      }
      renderAndRead(indexes, text, (position, data) => remember(position, data, text));
    }
    return cacheRef.current.items[index]?.data;
  });

  const spanYield = useBrowserYield();
  const readSpan = useStableCallback(
    (start: number, end: number, onDone: (data: ReadonlyArray<Data | undefined>) => void) => {
      spanYield.cancel();
      const token = spanYield.token();
      const data: Array<Data | undefined> = new Array(count());
      let next = start;
      const readSlice = () => {
        if (token !== spanYield.token()) {
          return;
        }
        const sliceStart = performance.now();
        while (next <= end && performance.now() - sliceStart < SLICE_MS) {
          const chunkEnd = Math.min(end + 1, next + SPAN_CHUNK_SIZE);
          const missing: number[] = [];
          for (let index = next; index < chunkEnd; index += 1) {
            const rendered = internals.rendered.get(index);
            if (rendered !== undefined) {
              data[index] = rendered;
            } else {
              missing.push(index);
            }
          }
          if (missing.length > 0) {
            renderAndRead(missing, false, (index, itemData) => {
              data[index] = itemData;
            });
          }
          next = chunkEnd;
        }
        if (next > end) {
          onDone(data);
        } else {
          spanYield.schedule(readSlice);
        }
      };
      spanYield.schedule(readSlice);
      return spanYield.cancel;
    },
  );

  // Reads ahead in the order typeahead searches: on from `from`, wrapping to the start. Starting
  // again moves the window on from wherever it's asked to start.
  const readAheadYield = useBrowserYield();
  const readAheadRef = React.useRef<{ cursor: number; end: number; running: boolean } | null>(null);

  const stopReadAhead = useStableCallback(() => {
    readAheadYield.cancel();
    readAheadRef.current = null;
  });

  const startReadAhead = useStableCallback((from: number) => {
    const total = count();
    if (!enabledRef.current || total === 0) {
      return;
    }
    const end = from + Math.min(READ_AHEAD_DISTANCE, total);
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
      while (current.cursor < current.end && performance.now() - sliceStart < SLICE_MS) {
        const index = current.cursor % total;
        const rendered = internals.rendered.get(index);
        if (rendered !== undefined) {
          // Kept, since the item may scroll out of view before it's read.
          remember(index, rendered, true);
        } else {
          get(index, { text: true });
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

  const hold = useStableCallback((held: boolean) => {
    heldRef.current = held;
  });

  const methods = useRefWithInit(() => ({
    get,
    peek,
    readSpan,
    readAhead: { start: startReadAhead, stop: stopReadAhead },
    hold,
  })).current;

  return React.useMemo(() => ({ ...methods, enabled, internals }), [methods, enabled, internals]);
}
