import { EMPTY_ARRAY } from '@base-ui/utils/empty';
import { compareItemEquality, removeItem } from '../../internals/itemEquality';

/**
 * Typed actions that describe selection intent. Both click handlers and
 * keyboard handlers produce these; the pure `selectionReducer` computes
 * the next value array.
 */
export type SelectionAction =
  | { type: 'select'; index: number }
  | { type: 'moveSelection'; index: number }
  | { type: 'toggle'; index: number }
  | { type: 'extendTo'; index: number; anchorIndex: number | null }
  | { type: 'selectRange'; from: number; to: number }
  | { type: 'selectAll' }
  | { type: 'clear' };

/** Reads the items the reducer selects from, by position. */
export interface SelectionItems {
  count: number;
  getValue: (index: number) => any;
  isDisabled: (index: number) => boolean;
}

/**
 * Pure reducer that computes the next selection value from an action.
 * Has no side effects — does not touch refs, store, or DOM.
 *
 * @param action - What the user intends to do.
 * @param currentValue - The current selected values array.
 * @param items - Reads each item's value and disabled state, by position.
 * @param isItemEqualToValue - Custom equality comparator.
 * @returns The new selected values array.
 */
export function selectionReducer(
  action: SelectionAction,
  currentValue: any[],
  items: SelectionItems,
  isItemEqualToValue: (a: any, b: any) => boolean,
): any[] {
  const { count, getValue, isDisabled } = items;
  switch (action.type) {
    case 'select': {
      const itemValue = getValue(action.index);
      if (itemValue === undefined || isDisabled(action.index)) {
        return currentValue;
      }
      return [itemValue];
    }

    // Moving focus in opt-in mode: the focused item becomes the selection, and a disabled one
    // can't be selected, so nothing is.
    case 'moveSelection': {
      const itemValue = getValue(action.index);
      if (itemValue === undefined || isDisabled(action.index)) {
        return EMPTY_ARRAY as any[];
      }
      return [itemValue];
    }

    case 'toggle': {
      const itemValue = getValue(action.index);
      if (itemValue === undefined || isDisabled(action.index)) {
        return currentValue;
      }
      const isSelected = currentValue.some((v) =>
        compareItemEquality(itemValue, v, isItemEqualToValue),
      );
      if (isSelected) {
        return removeItem(currentValue, itemValue, isItemEqualToValue);
      }
      return [...currentValue, itemValue];
    }

    case 'extendTo': {
      const anchorIndex = action.anchorIndex;
      if (anchorIndex === null) {
        // No anchor — treat as a single select
        const itemValue = getValue(action.index);
        return itemValue !== undefined && !isDisabled(action.index) ? [itemValue] : currentValue;
      }
      const start = Math.min(anchorIndex, action.index);
      const end = Math.max(anchorIndex, action.index);
      const rangeValues: any[] = [];
      for (let i = start; i <= end; i += 1) {
        const val = getValue(i);
        if (val !== undefined && !isDisabled(i)) {
          rangeValues.push(val);
        }
      }
      return rangeValues;
    }

    case 'selectRange': {
      const start = Math.min(action.from, action.to);
      const end = Math.max(action.from, action.to);
      const nextValue = [...currentValue];
      for (let i = start; i <= end; i += 1) {
        const val = getValue(i);
        if (
          val !== undefined &&
          !isDisabled(i) &&
          !nextValue.some((v) => compareItemEquality(val, v, isItemEqualToValue))
        ) {
          nextValue.push(val);
        }
      }
      return nextValue;
    }

    case 'selectAll': {
      const nextValue: any[] = [];
      for (let i = 0; i < count; i += 1) {
        const val = getValue(i);
        if (val !== undefined && !isDisabled(i)) {
          nextValue.push(val);
        }
      }
      return nextValue;
    }

    case 'clear': {
      return EMPTY_ARRAY as any[];
    }

    default:
      return currentValue;
  }
}
