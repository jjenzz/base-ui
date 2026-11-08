/** What each `Listbox.Item` registers with the collection. */
export interface ListboxItemData {
  value: any;
  disabled: boolean;
  getLabel: () => string | null;
}

/**
 * Reads each item's label, value and disabled state by position: from the rendered items without
 * `range`, and through the collection with it, which also reads items that aren't rendered.
 */
export interface ListboxItemReader {
  count: () => number;
  getLabel: (index: number) => string | null;
  getValue: (index: number) => any;
  isDisabled: (index: number) => boolean;
}
