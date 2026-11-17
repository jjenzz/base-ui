'use client';
import * as React from 'react';
import { useStableCallback } from '@base-ui/utils/useStableCallback';
import { useRefWithInit } from '@base-ui/utils/useRefWithInit';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import { useBrowserYield } from './useBrowserYield';

// Reads render this many items that aren't rendered at a time, unless the caller asks otherwise.
const DEFAULT_CHUNK_SIZE = 100;
// Reads work for about this long, or this many chunks, then yield to the browser.
const SLICE_MS = 8;
const SLICE_CHUNKS = 4;
// `readAhead` reads this far past where it starts.
const READ_AHEAD_DISTANCE = 2000;
const READ_AHEAD_CHUNK_SIZE = 200;

export interface CollectionOptions<Item, Data, Snapshot> {
  /**
   * Every item, including those that aren't rendered. Without them, the collection only knows the
   * rendered items.
   */
  items: readonly Item[] | undefined;
  /** Renders one item, as the consumer would. Called for items that aren't rendered. */
  render: (item: Item, index: number) => React.ReactNode;
  /** Whether items can be unrendered, so their data has to be read from the hidden fragment. */
  enabled: boolean;
  /**
   * Copies what's kept of an item's registered data, while the item is mounted. `text` says
   * whether the item's nested text was rendered, such as to read its label.
   */
  snapshot: (data: Data, text: boolean) => Snapshot;
}

export interface CollectionReadOptions {
  /** Whether items with nested text should render it, such as to read labels from the DOM. */
  text?: boolean | undefined;
  /** How many items that aren't rendered to render at a time. */
  chunkSize?: number | undefined;
  /**
   * Whether the read goes ahead of background reads, and continues straight after each chunk
   * while within its time slice, rather than yielding to the browser first.
   */
  urgent?: boolean | undefined;
}

/** Looks up what a read found, by position. */
export type CollectionLookup<Snapshot> = (index: number) => Snapshot | undefined;

export interface Collection<Snapshot> {
  /** How many items there are: every item with `items`, otherwise the rendered ones. */
  count: () => number;
  /**
   * What's known about an item without rendering anything: a rendered item's data, or what an
   * earlier read kept. `undefined` when the item hasn't been read, or was read without its text
   * when `text` is set.
   */
  peek: (index: number, options?: { text?: boolean | undefined }) => Snapshot | undefined;
  /**
   * Reads the items from `start` to `end`, inclusive. Items that haven't been read render into the
   * hidden fragment as a normal update, in chunks, and `done` is called once they've all been
   * read. Returns a function that cancels it.
   */
  read: (
    start: number,
    end: number,
    options: CollectionReadOptions,
    done: (lookup: CollectionLookup<Snapshot>) => void,
  ) => () => void;
  /** Reads labels ahead from `from`, wrapping round, in the background. */
  readAhead: { start: (from: number) => void; stop: () => void };
  /**
   * Keeps what's been read when the list renders again, such as during a typing session. While
   * not held, what's read is forgotten on every render, since what the render function returns
   * may have changed.
   */
  hold: (held: boolean) => void;
}

/**
 * The items to render into the hidden fragment, with the render function and items the read
 * started with.
 */
export interface HiddenBatch {
  indexes: readonly number[];
  items: readonly any[];
  render: (item: any, index: number) => React.ReactNode;
  text: boolean;
}

/**
 * What `CollectionProvider` and `useCollectionItem` share with the collection. Created once and
 * never changed during render: the maps and the refs are only written in effects and handlers.
 */
export interface CollectionInternals<Data> {
  fragment: DocumentFragment | null;
  rendered: Map<number, Data>;
  hiddenRegistry: Map<number, Data>;
  /** Renders a batch into the hidden fragment. Set by the hidden root. */
  controllerRef: React.RefObject<((batch: HiddenBatch) => void) | null>;
  /** Called by the hidden root once a batch has committed, while its items are mounted. */
  committedRef: React.RefObject<((batch: HiddenBatch) => void) | null>;
}

interface Cached<Snapshot> {
  snapshot: Snapshot;
  /** Whether it was read with its text rendered. */
  text: boolean;
}

interface ReadJob<Snapshot> {
  next: number;
  end: number;
  text: boolean;
  chunkSize: number;
  urgent: boolean;
  /** What this read found, kept even if the cache is forgotten while it runs. */
  results: Map<number, Snapshot>;
  done: (lookup: CollectionLookup<Snapshot>) => void;
}

/**
 * A collection of items, only some of which may be rendered, whose data can still be read. Each
 * item registers its data with `useCollectionItem`. Items that aren't rendered render into a
 * hidden fragment, in chunks, only when their data is read, and what each registered is copied
 * and kept, so each is only rendered once.
 */
export function useCollection<Item, Data, Snapshot>(
  options: CollectionOptions<Item, Data, Snapshot>,
): Collection<Snapshot> & { enabled: boolean; internals: CollectionInternals<Data> } {
  const { items, render, enabled, snapshot } = options;

  // The latest options, for handlers. Updated after each commit, never during render.
  const itemsRef = React.useRef(items);
  const renderRef = React.useRef(render);
  const enabledRef = React.useRef(enabled);
  const snapshotRef = React.useRef(snapshot);
  useIsoLayoutEffect(() => {
    itemsRef.current = items;
    renderRef.current = render;
    enabledRef.current = enabled;
    snapshotRef.current = snapshot;
  });

  const internals = useRefWithInit((): CollectionInternals<Data> => ({
    fragment: typeof document === 'undefined' ? null : document.createDocumentFragment(),
    rendered: new Map(),
    hiddenRegistry: new Map(),
    controllerRef: { current: null },
    committedRef: { current: null },
  })).current;

  const count = useStableCallback(() => {
    if (itemsRef.current) {
      return itemsRef.current.length;
    }
    let last = -1;
    internals.rendered.forEach((_, index) => {
      last = Math.max(last, index);
    });
    return last + 1;
  });

  const cacheRef = React.useRef(new Map<number, Cached<Snapshot>>());
  const heldRef = React.useRef(false);

  useIsoLayoutEffect(() => {
    if (!heldRef.current) {
      cacheRef.current = new Map();
    }
  });

  const peek = useStableCallback((index: number, peekOptions?: { text?: boolean | undefined }) => {
    const rendered = internals.rendered.get(index);
    if (rendered !== undefined) {
      return snapshotRef.current(rendered, true);
    }
    const cached = cacheRef.current.get(index);
    if (cached && (!peekOptions?.text || cached.text)) {
      return cached.snapshot;
    }
    return undefined;
  });

  const jobsRef = React.useRef<Array<ReadJob<Snapshot>>>([]);
  // The read whose batch is rendering, if any.
  const activeRef = React.useRef<ReadJob<Snapshot> | null>(null);
  const sliceStartRef = React.useRef(0);
  const sliceChunksRef = React.useRef(0);
  const pumpYield = useBrowserYield();

  const finish = (job: ReadJob<Snapshot>) => {
    jobsRef.current = jobsRef.current.filter((candidate) => candidate !== job);
    job.done((index) => job.results.get(index) ?? peek(index, { text: job.text }));
  };

  // Starts the next chunk of the most urgent read: collects up to `chunkSize` items it still
  // needs, keeping those already known, and renders them. A read with nothing left finishes.
  const pump = (): void => {
    if (activeRef.current) {
      return;
    }
    const job = jobsRef.current.find((candidate) => candidate.urgent) ?? jobsRef.current[0];
    if (!job) {
      return;
    }
    const indexes: number[] = [];
    while (job.next <= job.end && indexes.length < job.chunkSize) {
      const index = job.next;
      job.next += 1;
      const known = peek(index, { text: job.text });
      if (known !== undefined) {
        job.results.set(index, known);
        // A rendered item is kept too, since it may scroll out of view before it's needed.
        if (internals.rendered.has(index)) {
          cacheRef.current.set(index, { snapshot: known, text: true });
        }
      } else {
        indexes.push(index);
      }
    }
    if (indexes.length === 0) {
      finish(job);
      pump();
      return;
    }
    activeRef.current = job;
    internals.controllerRef.current?.({
      indexes,
      items: itemsRef.current ?? [],
      render: renderRef.current,
      text: job.text,
    });
  };

  // Starts a new time slice of reading.
  const startSlice = () => {
    sliceStartRef.current = performance.now();
    sliceChunksRef.current = 0;
    pump();
  };

  // Called by the hidden root once a batch has committed, while its items are mounted: copies what
  // each item registered, then moves on, yielding to the browser when the slice is used up.
  const onCommitted = useStableCallback((batch: HiddenBatch) => {
    const job = activeRef.current;
    activeRef.current = null;
    if (!job) {
      return;
    }
    const cache = cacheRef.current;
    for (const index of batch.indexes) {
      const data = internals.hiddenRegistry.get(index);
      if (data !== undefined) {
        const copy = snapshotRef.current(data, batch.text);
        cache.set(index, { snapshot: copy, text: batch.text });
        job.results.set(index, copy);
      }
    }
    sliceChunksRef.current += 1;
    if (
      job.urgent &&
      sliceChunksRef.current < SLICE_CHUNKS &&
      performance.now() - sliceStartRef.current < SLICE_MS
    ) {
      pump();
    } else {
      pumpYield.schedule(startSlice);
    }
  });

  useIsoLayoutEffect(() => {
    internals.committedRef.current = onCommitted;
    return () => {
      internals.committedRef.current = null;
    };
  }, [internals, onCommitted]);

  const read = useStableCallback(
    (
      start: number,
      end: number,
      readOptions: CollectionReadOptions,
      done: (lookup: CollectionLookup<Snapshot>) => void,
    ) => {
      // Without a hidden fragment, only rendered items can be known.
      if (!enabledRef.current) {
        done((index) => peek(index, readOptions));
        return () => {};
      }
      const job: ReadJob<Snapshot> = {
        next: Math.max(0, start),
        end: Math.min(end, count() - 1),
        text: readOptions.text ?? false,
        chunkSize: readOptions.chunkSize ?? DEFAULT_CHUNK_SIZE,
        urgent: readOptions.urgent ?? false,
        results: new Map(),
        done,
      };
      jobsRef.current = [...jobsRef.current, job];
      if (!activeRef.current) {
        // An urgent read starts at once; others wait for the browser first.
        if (job.urgent) {
          startSlice();
        } else {
          pumpYield.schedule(startSlice);
        }
      }
      return () => {
        jobsRef.current = jobsRef.current.filter((candidate) => candidate !== job);
        // A batch that's rendering for it still commits and is kept.
        job.next = job.end + 1;
      };
    },
  );

  // Reads ahead in the order typeahead searches: on from `from`, wrapping to the start.
  const readAheadRef = React.useRef<Array<() => void>>([]);

  const stopReadAhead = useStableCallback(() => {
    readAheadRef.current.forEach((cancel) => cancel());
    readAheadRef.current = [];
  });

  const startReadAhead = useStableCallback((from: number) => {
    const total = count();
    if (!enabledRef.current || total === 0) {
      return;
    }
    stopReadAhead();
    const start = ((from % total) + total) % total;
    const end = start + Math.min(READ_AHEAD_DISTANCE, total) - 1;
    const readOptions = { text: true, chunkSize: READ_AHEAD_CHUNK_SIZE };
    const noop = () => {};
    readAheadRef.current = [read(start, Math.min(end, total - 1), readOptions, noop)];
    if (end >= total) {
      readAheadRef.current.push(read(0, end - total, readOptions, noop));
    }
  });

  const hold = useStableCallback((held: boolean) => {
    heldRef.current = held;
  });

  const methods = useRefWithInit(() => ({
    count,
    peek,
    read,
    readAhead: { start: startReadAhead, stop: stopReadAhead },
    hold,
  })).current;

  return React.useMemo(() => ({ ...methods, enabled, internals }), [methods, enabled, internals]);
}
