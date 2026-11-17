import type { CollectionLookup, CollectionReadOptions } from '../../internals/collection';

/** What each `Listbox.Item` registers with the collection. */
export interface ListboxItemData {
  value: any;
  disabled: boolean;
  getLabel: () => string | null;
}

/**
 * What's kept of an item once it's read: its value, disabled state and, when its text was read,
 * its label as a string, so nothing it rendered is kept.
 */
export interface ListboxItemSnapshot {
  value: any;
  disabled: boolean;
  /** `undefined` when the item was read without its text. */
  label: string | null | undefined;
}

/**
 * Reads each item's label, value and disabled state by position: from the rendered items without
 * `range`, and through the collection with it, which also reads items that aren't rendered.
 */
export interface ListboxItemReader {
  count: () => number;
  /** The label, if it's known without rendering anything, or `undefined` when it isn't. */
  getLabel: (index: number) => string | null | undefined;
  /** The value, if it's known without rendering anything. */
  getValue: (index: number) => any;
  isDisabled: (index: number) => boolean;
  /**
   * Reads the items from `start` to `end` that aren't known yet, then calls `done`. Returns a
   * function that cancels it.
   */
  read: (
    start: number,
    end: number,
    options: CollectionReadOptions,
    done: (lookup: CollectionLookup<ListboxItemSnapshot>) => void,
  ) => () => void;
}
