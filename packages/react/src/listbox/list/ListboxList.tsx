'use client';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { platform } from '@base-ui/utils/platform';
import { useStableCallback } from '@base-ui/utils/useStableCallback';
import { useRefWithInit } from '@base-ui/utils/useRefWithInit';
import { useTimeout } from '@base-ui/utils/useTimeout';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import { EMPTY_ARRAY } from '@base-ui/utils/empty';
import { ownerDocument } from '@base-ui/utils/owner';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { useRenderElement } from '../../internals/useRenderElement';
import { useDirection } from '../../internals/direction-context';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { TYPEAHEAD_RESET_MS } from '../../internals/constants';
import { compareItemEquality } from '../../internals/itemEquality';
import { useCompositeRoot, CompositeList } from '../../internals/composite';
import { activeElement, contains } from '../../floating-ui-react/utils';
import { stopEvent } from '../../floating-ui-react/utils/event';
import { useTypeahead } from '../../floating-ui-react';
import { ListboxItemsContext, useListboxRootContext } from '../root/ListboxRootContext';
import type { ListboxRoot } from '../root/ListboxRoot';
import { selectionReducer } from '../utils/selectionReducer';
import type { SelectionAction } from '../utils/selectionReducer';
import { ListboxHiddenRoot, ListboxListGroupContext } from './ListboxHiddenItems';
import type { ListboxHiddenItemEntry } from './ListboxHiddenItems';
import { ListboxCollection as ListboxCollectionPart } from '../collection/ListboxCollection';

// How many items are read at a time when the data of items that aren't rendered is needed.
const MIN_READ_BATCH = 250;
const MAX_READ_BATCH = 2000;
// Selections spanning more items than this resolve over several tasks, each working for about
// RANGE_SLICE_MS, reading RANGE_CHUNK_SIZE items at a time.
const ASYNC_RANGE_THRESHOLD = 1000;
const RANGE_CHUNK_SIZE = 250;
const RANGE_SLICE_MS = 8;
// How long each slice of reading labels ahead runs for during a typing session, and how far past
// the highlighted item it reads.
const READ_AHEAD_SLICE_MS = 8;
const READ_AHEAD_DISTANCE = 2000;

/**
 * Runs callbacks after yielding to the browser, with a message rather than a timer, since browsers
 * delay nested timers by at least 4 ms. `cancel` drops anything scheduled; `token` changes on each
 * cancel, so a loop can tell it was cancelled.
 */
function useBrowserYield() {
  const channelRef = React.useRef<MessageChannel | null>(null);
  const tokenRef = React.useRef(0);
  const timeout = useTimeout();

  React.useEffect(
    () => () => {
      tokenRef.current += 1;
      channelRef.current?.port1.close();
      channelRef.current = null;
    },
    [],
  );

  return useRefWithInit(() => ({
    token: () => tokenRef.current,
    cancel() {
      tokenRef.current += 1;
      timeout.clear();
    },
    schedule(callback: () => void) {
      if (typeof MessageChannel === 'undefined') {
        timeout.start(0, callback);
        return;
      }
      if (!channelRef.current) {
        channelRef.current = new MessageChannel();
      }
      channelRef.current.port1.onmessage = () => callback();
      channelRef.current.port2.postMessage(null);
    },
  })).current;
}

/** The first and last index a selection action reads, when it reads a range. */
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
 * A container for the listbox items.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Listbox](https://base-ui.com/react/components/listbox)
 */
export const ListboxList = React.forwardRef(function ListboxList(
  componentProps: ListboxList.Props,
  forwardedRef: React.ForwardedRef<HTMLDivElement>,
) {
  const { className, render, style, children, ...elementProps } = componentProps;

  const store = useListboxRootContext();

  const id = store.useState('id');
  const labelId = store.useState('labelId');
  const activeIndex = store.useState('activeIndex');
  const orientation = store.useState('orientation');
  const disabled = store.useState('disabled');
  const multiple = store.useState('multiple');
  const { items, itemGroups, range } = React.useContext(ListboxItemsContext);
  // With `items`, the list knows every item, including those that aren't rendered.
  const itemCount = items?.length;
  const activeItemRendered = store.useState('activeItemRendered');
  const optInMode = multiple === 'opt-in';
  const direction = useDirection();
  const { disabledItemsRef, labelsRef, lastSelectedIndexRef, setValue, typingRef, valuesRef } =
    store.context;

  // The keydown being handled by the list, so composite navigation can report it.
  const keyDownEventRef = React.useRef<KeyboardEvent | undefined>(undefined);
  // Where a Shift+Arrow range starts: the item focused when Shift was pressed.
  const shiftAnchorRef = React.useRef<number | null>(null);
  // In opt-in mode, an arrow key that moved focus to an item that isn't rendered selects it once
  // it renders and receives focus.
  const pendingSelectRef = React.useRef<{ index: number; event: KeyboardEvent } | null>(null);

  const onHighlightedIndexChange = useStableCallback((index: number) => {
    const event = keyDownEventRef.current;
    if (event) {
      // Keyboard navigation focuses the item next.
      store.highlightItem(index, event);
    } else {
      // Items were added or removed, so the tab stop moves without focus moving.
      store.setActiveIndex(index);
    }

    // In opt-in mode, moving focus with an arrow key and no modifier moves the selection to
    // the focused item (the APG alternative multiple selection model).
    if (
      optInMode &&
      event &&
      event.key.startsWith('Arrow') &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      dispatchSelection(
        { type: 'moveSelection', index },
        createChangeEventDetails(REASONS.listNavigation, event),
        index,
      );
    }
  });

  /**
   * The item that should receive focus when the list receives focus: the first selected item,
   * or the first item when nothing is selected, as the APG listbox pattern describes.
   */
  const getTabStopIndex = useStableCallback((scan = false): number | null => {
    const { value: selectedValues, isItemEqualToValue } = store.state;
    if (selectedValues.length === 0) {
      return 0;
    }
    // With `range`, finding the first selected item reads the values of items that aren't
    // rendered, which only happens in event handlers. Elsewhere, the list holds the tab stop and
    // finds the item when it receives focus.
    if (store.state.range != null && !scan) {
      return null;
    }
    const values = valuesRef.current;
    for (let index = 0; index < values.length; index += 1) {
      if (
        index in values &&
        selectedValues.some((selectedValue) =>
          compareItemEquality(values[index], selectedValue, isItemEqualToValue),
        )
      ) {
        return index;
      }
    }
    return 0;
  });

  const composite = useCompositeRoot({
    orientation,
    // The APG listbox pattern doesn't wrap focus from the last option to the first.
    loopFocus: false,
    highlightedIndex: activeIndex ?? 0,
    onHighlightedIndexChange,
    direction,
    enableHomeAndEndKeys: true,
    stopEventPropagation: false,
    // Listbox items remain keyboard-focusable even when disabled; selection
    // logic still guards against activating them.
    disabledIndices: EMPTY_ARRAY as number[],
  });

  /**
   * Highlights an item and moves focus to it. In a virtualized list, the item may not be rendered
   * yet, so the list holds focus until it renders and the item takes focus from the list.
   */
  const focusItem = useStableCallback((index: number, event: Event | undefined) => {
    const { pendingFocusIndexRef } = store.context;
    pendingFocusIndexRef.current = null;
    store.highlightItem(index, event);

    const element = composite.elementsRef.current[index];
    if (element) {
      element.focus();
      return;
    }

    pendingFocusIndexRef.current = index;
    store.state.listElement?.focus({ preventScroll: true });
  });

  // An item that an arrow key moved focus to in opt-in mode is selected once it renders.
  const onItemFocus = useStableCallback((index: number) => {
    const pendingSelect = pendingSelectRef.current;
    if (pendingSelect?.index !== index) {
      return;
    }
    pendingSelectRef.current = null;
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    dispatchSelection(
      { type: 'moveSelection', index },
      createChangeEventDetails(REASONS.listNavigation, pendingSelect.event),
      index,
    );
  });
  store.useContextCallback('onItemFocus', onItemFocus);

  /**
   * Arrow keys, Home and End with `items`. The composite only knows the rendered items, so the
   * list moves by index instead, through every item.
   */
  const handleVirtualizedNavigation = useStableCallback((event: React.KeyboardEvent) => {
    if (itemCount == null || itemCount === 0) {
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const isRtl = direction === 'rtl';
    let forwardKey = 'ArrowDown';
    let backwardKey = 'ArrowUp';
    if (orientation === 'horizontal') {
      forwardKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
      backwardKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
    }
    const currentIndex = store.state.activeIndex ?? 0;

    let targetIndex: number;
    if (event.key === forwardKey) {
      targetIndex = Math.min(currentIndex + 1, itemCount - 1);
    } else if (event.key === backwardKey) {
      targetIndex = Math.max(currentIndex - 1, 0);
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = itemCount - 1;
    } else {
      return;
    }

    event.preventDefault();
    if (targetIndex === currentIndex) {
      return;
    }

    pendingSelectRef.current = null;
    focusItem(targetIndex, event.nativeEvent);

    // In opt-in mode, the selection follows focus (the APG alternative multiple selection model).
    if (optInMode && event.key.startsWith('Arrow')) {
      if (composite.elementsRef.current[targetIndex]) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        dispatchSelection(
          { type: 'moveSelection', index: targetIndex },
          createChangeEventDetails(REASONS.listNavigation, event.nativeEvent),
          targetIndex,
        );
      } else {
        pendingSelectRef.current = { index: targetIndex, event: event.nativeEvent };
      }
    }
  });

  // Typeahead, like Select and Menu: keys typed in quick succession build one search, which resets
  // after a pause, and typing the same letter again cycles through the items that start with it.
  const typeahead = useTypeahead({
    listRef: labelsRef,
    elementsRef: composite.elementsRef,
    activeIndex,
    enabled: !disabled,
    resetMs: TYPEAHEAD_RESET_MS,
    onTyping(isTyping) {
      typingRef.current = isTyping;
      if (!isTyping) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        stopReadAhead();
      }
    },
    onMatch(index, event) {
      focusItem(index, event.nativeEvent);
    },
  });

  /**
   * Dispatches a selection action through the reducer and commits the result.
   * Centralizes the pattern of: compute next value → setValue → update anchor.
   */
  const dispatchSelection = useStableCallback(
    (
      action: SelectionAction,
      eventDetails: ListboxRoot.ChangeEventDetails,
      anchorIndex?: number,
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      commitSelection(action, eventDetails);
      if (anchorIndex !== undefined) {
        lastSelectedIndexRef.current = anchorIndex;
      }
    },
  );

  /**
   * Maps keyboard events to selection actions based on the current selection mode.
   * Only handles multi-item keyboard shortcuts (Shift+Arrow, Ctrl+Shift+Home/End, Ctrl+A).
   * Single-item selection (Enter/Space) is handled in ListboxItem.
   */
  const handleSelectionKeyDown = useStableCallback((event: React.KeyboardEvent) => {
    if (!multiple) {
      return;
    }

    const isVertical = orientation === 'vertical';
    const currentIndex = store.state.activeIndex;
    const elements = composite.elementsRef.current;

    const count = itemCount ?? elements.length;

    // Opt-in mode: Ctrl+Arrow moves focus without changing the selection. macOS reserves
    // Ctrl+Arrow and uses Cmd+Arrow to jump to the ends, so Option+Arrow does it there.
    const isMoveWithoutSelecting = platform.os.mac
      ? event.altKey && !event.ctrlKey && !event.metaKey
      : event.ctrlKey || event.metaKey;
    if (optInMode && isMoveWithoutSelecting && !event.shiftKey) {
      const isRtl = direction === 'rtl';
      const isPrev =
        (isVertical && event.key === 'ArrowUp') ||
        (!isVertical && (isRtl ? event.key === 'ArrowRight' : event.key === 'ArrowLeft'));
      const isNext =
        (isVertical && event.key === 'ArrowDown') ||
        (!isVertical && (isRtl ? event.key === 'ArrowLeft' : event.key === 'ArrowRight'));

      if ((isPrev || isNext) && currentIndex != null) {
        event.preventDefault();
        const targetIndex = isPrev ? currentIndex - 1 : currentIndex + 1;
        if (store.isIndexInList(targetIndex, elements)) {
          focusItem(targetIndex, event.nativeEvent);
        }
      }
    }

    // Shift+Arrow: Move focus and select the range from the anchor to the focused item,
    // replacing the rest of the selection, so the range grows and shrinks as focus moves.
    if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
      const isRtl = direction === 'rtl';
      const isPrev =
        (isVertical && event.key === 'ArrowUp') ||
        (!isVertical && (isRtl ? event.key === 'ArrowRight' : event.key === 'ArrowLeft'));
      const isNext =
        (isVertical && event.key === 'ArrowDown') ||
        (!isVertical && (isRtl ? event.key === 'ArrowLeft' : event.key === 'ArrowRight'));

      if ((isPrev || isNext) && currentIndex != null) {
        const targetIndex = isPrev ? currentIndex - 1 : currentIndex + 1;

        if (store.isIndexInList(targetIndex, elements)) {
          event.preventDefault();
          if (shiftAnchorRef.current === null) {
            shiftAnchorRef.current = currentIndex;
          }
          const anchorIndex = shiftAnchorRef.current;
          focusItem(targetIndex, event.nativeEvent);

          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          commitSelection(
            { type: 'extendTo', index: targetIndex, anchorIndex },
            createChangeEventDetails(REASONS.listNavigation, event.nativeEvent, undefined, {
              range: {
                from: Math.min(anchorIndex, targetIndex),
                to: Math.max(anchorIndex, targetIndex),
                mode: 'replace',
              },
            }),
          );
        }
      }
    }

    // Ctrl+Shift+Home: Select from focus to first
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Home') {
      event.preventDefault();
      if (currentIndex != null) {
        dispatchSelection(
          { type: 'selectRange', from: 0, to: currentIndex },
          createChangeEventDetails(REASONS.listNavigation, event.nativeEvent, undefined, {
            range: { from: 0, to: currentIndex, mode: 'add' },
          }),
          0,
        );
        focusItem(0, event.nativeEvent);
      }
    }

    // Ctrl+Shift+End: Select from focus to last
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'End') {
      event.preventDefault();
      if (currentIndex != null) {
        const lastIndex = count - 1;
        dispatchSelection(
          { type: 'selectRange', from: currentIndex, to: lastIndex },
          createChangeEventDetails(REASONS.listNavigation, event.nativeEvent, undefined, {
            range: { from: currentIndex, to: lastIndex, mode: 'add' },
          }),
          lastIndex,
        );
        focusItem(lastIndex, event.nativeEvent);
      }
    }

    // Ctrl+A / Cmd+A: Select all. The APG makes deselecting a fully selected list optional, and
    // Escape already clears the selection.
    if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
      event.preventDefault();
      dispatchSelection(
        { type: 'selectAll' },
        createChangeEventDetails(REASONS.listNavigation, event.nativeEvent, undefined, {
          range: { from: 0, to: count - 1, mode: 'replace' },
        }),
      );
    }
  });

  const setListElement = useStableCallback((element: HTMLElement | null) => {
    store.set('listElement', element);
  });

  // In a virtualized list, the item that holds the tab stop may not be rendered, so the list takes
  // its place in the tab order until it renders.
  let tabIndex: number | undefined = -1;
  if (disabled) {
    tabIndex = undefined;
  } else if (itemCount != null && itemCount > 0 && !activeItemRendered) {
    tabIndex = 0;
  }

  const state: ListboxListState = {
    disabled,
    orientation,
  };

  const defaultProps: HTMLProps = {
    id: id ? `${id}-list` : undefined,
    role: 'listbox',
    'aria-labelledby': labelId,
    'aria-multiselectable': multiple ? true : undefined,
    'aria-orientation': orientation,
    tabIndex,
    onFocus(event) {
      const elements = composite.elementsRef.current;
      if (event.target !== event.currentTarget) {
        return;
      }
      // The list holds focus until the item it's waiting for renders.
      if (store.context.pendingFocusIndexRef.current !== null) {
        return;
      }
      // The list isn't a tab stop, but it can receive focus programmatically, such as from a
      // `Listbox.Label` click. Pass focus on to the item that holds the tab stop.
      const index = store.state.activeIndex ?? getTabStopIndex(true) ?? 0;
      if (elements[index]) {
        elements[index].focus();
      } else if (itemCount != null && itemCount > 0) {
        // The item isn't rendered, so highlight it to have it scrolled into view.
        focusItem(index, event.nativeEvent);
      }
    },
    onBlur(event) {
      if (contains(event.currentTarget, event.relatedTarget)) {
        return;
      }
      store.context.pendingFocusIndexRef.current = null;
      pendingSelectRef.current = null;
      typeahead.endSession();
      if (event.target === event.currentTarget) {
        // Focus left while the list held it for an item that isn't rendered.
        store.unhighlightItem(event.nativeEvent);
      }
      store.setActiveIndex(getTabStopIndex(), event.nativeEvent);
    },
    onMouseLeave(event) {
      store.hoverItem(null, event.nativeEvent);
    },
    onPointerDown() {
      // A new pointer press starts a new Shift+Arrow range from wherever focus lands.
      shiftAnchorRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      cancelResolve();
    },
    onKeyDownCapture(event: React.KeyboardEvent) {
      // A selection still being resolved is replaced by whatever this key does.
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      cancelResolve();
      // Typeahead runs before the items' handlers, so a typed key doesn't reach the item it moved
      // focus away from, and Space continues a search in progress instead of selecting.
      if (event.key === ' ') {
        if (typingRef.current) {
          typeahead.onKeyDown(event);
        }
        return;
      }
      if (
        !disabled &&
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        stopEvent(event);
        typingRef.current = true;
        // The keyboard takes over from the pointer.
        if (store.state.hoveredIndex !== null) {
          store.hoverItem(null, event.nativeEvent);
        }
      }
      typeahead.onKeyDown(event);
      if (typingRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        startReadAhead();
      }
    },
    onKeyDown(event: React.KeyboardEvent) {
      if (disabled) {
        return;
      }

      if (event.key === 'Shift') {
        shiftAnchorRef.current = store.state.activeIndex;
      } else if (!event.shiftKey) {
        shiftAnchorRef.current = null;
      }

      // Let composite handle unmodified arrow keys, Home, End
      keyDownEventRef.current = event.nativeEvent;
      if (itemCount != null) {
        handleVirtualizedNavigation(event);
      } else {
        composite.props.onKeyDown?.(event);
      }
      keyDownEventRef.current = undefined;

      // Escape: deselect all items (multi-select modes only)
      if (event.key === 'Escape' && multiple) {
        const currentValue = store.state.value;
        if (Array.isArray(currentValue) && currentValue.length > 0) {
          dispatchSelection(
            { type: 'clear' },
            createChangeEventDetails(REASONS.escapeKey, event.nativeEvent),
          );
        }
      }

      // Selection keyboard shortcuts (multiple selection only)
      handleSelectionKeyDown(event);

      // The keyboard takes over from the pointer, so the highlight returns to the focused item
      // until the pointer moves again.
      if (store.state.hoveredIndex !== null) {
        store.hoverItem(null, event.nativeEvent);
      }
    },
  };

  // While no item has focus, keep the tab stop on the first selected item, including when the
  // selection or the items change.
  const value = store.useState('value');
  const onMapChange = useStableCallback((map: Parameters<typeof composite.onMapChange>[0]) => {
    // With `items`, positions come from the items, so they don't shift as items render.
    if (store.state.items != null) {
      if (store.state.activeIndex === null) {
        store.setActiveIndex(getTabStopIndex());
      }
      return;
    }
    composite.onMapChange(map);
    if (!store.state.itemFocused) {
      store.setActiveIndex(getTabStopIndex());
      return;
    }
    // Items can move around the focused item, such as when reordering them, so the tab stop
    // follows the focused item to its new index.
    const focusedElement = activeElement(ownerDocument(store.state.listElement));
    const focusedIndex = composite.elementsRef.current.findIndex(
      (element) => element != null && element === focusedElement,
    );
    if (focusedIndex !== -1) {
      store.setActiveIndex(focusedIndex);
    }
  });
  useIsoLayoutEffect(() => {
    if (!store.state.itemFocused) {
      store.setActiveIndex(getTabStopIndex());
    }
  }, [value, store, getTabStopIndex]);

  // Each group's position and the position of its first item in the whole list.
  const groupInfos = React.useMemo(() => {
    if (!itemGroups) {
      return undefined;
    }
    let offset = 0;
    return itemGroups.map((group, index) => {
      const info = { index, offset, size: group.items.length };
      offset += group.items.length;
      return info;
    });
  }, [itemGroups]);

  // With `items`, the children render one item, or one group when the items are grouped. Only the
  // groups with items in `range` render.
  let content: React.ReactNode;
  if (typeof children === 'function') {
    if (itemGroups && groupInfos) {
      content = groupInfos
        .filter(
          (info) =>
            !range || (info.offset <= range.end && info.offset + info.size - 1 >= range.start),
        )
        .map((info) => (
          <ListboxListGroupContext.Provider key={info.index} value={info}>
            {children(itemGroups[info.index], info.index)}
          </ListboxListGroupContext.Provider>
        ));
    } else {
      content = <ListboxCollectionPart>{children}</ListboxCollectionPart>;
    }
  } else {
    content = children;
  }

  // With `range`, the listbox reads the labels and disabled states of items that aren't rendered
  // only when something needs them, such as typeahead or selecting a range. It renders a batch of
  // items around the one being read into a detached fragment, with the latest render function,
  // and reads what each item registers. Nothing is kept between renders, so it's never stale.
  const hasCollection = range != null;
  const fragment = useRefWithInit(() =>
    typeof document === 'undefined' ? null : document.createDocumentFragment(),
  ).current;
  const registry = useRefWithInit(() => new Map<number, ListboxHiddenItemEntry>()).current;
  const hiddenControllerRef = React.useRef<((indexes: number[]) => void) | null>(null);

  const renderHiddenItem = useStableCallback((index: number) => {
    const { itemTemplates } = store.context;
    let groupIndex = -1;
    let offset = 0;
    if (groupInfos) {
      for (const info of groupInfos) {
        if (info.offset > index) {
          break;
        }
        groupIndex = info.index;
        offset = info.offset;
      }
    }
    // A group that isn't rendered uses the render function of a group that is.
    let template = itemTemplates.get(groupIndex);
    if (!template) {
      itemTemplates.forEach((candidate) => {
        template = candidate;
      });
    }
    return template ? template(store.state.items?.[index], index - offset) : null;
  });

  // What's been read since the list last rendered. Batches grow while a scan keeps going in one
  // direction, so reading every item takes a handful of batches.
  const readCacheRef = React.useRef({
    labels: [] as Array<string | null>,
    disabled: [] as boolean[],
    values: [] as any[],
    batchStart: -1,
    batchEnd: -1,
    batchSize: 0,
  });

  // Reads the data of an item that isn't rendered, rendering a batch of items around it. Labels
  // are only read when asked for, since nested text has to render to be read.
  const readItem = useStableCallback((index: number, label: boolean) => {
    const cache = readCacheRef.current;
    const isRead = (position: number) =>
      label ? position in cache.labels : position in cache.disabled;
    if (isRead(index)) {
      return;
    }
    const count = store.state.items?.length ?? 0;
    let start: number;
    let end: number;
    if (index === cache.batchEnd) {
      cache.batchSize = Math.min(cache.batchSize * 2, MAX_READ_BATCH);
      start = index;
      end = Math.min(count, index + cache.batchSize);
    } else if (index === cache.batchStart - 1) {
      cache.batchSize = Math.min(cache.batchSize * 2, MAX_READ_BATCH);
      start = Math.max(0, index - cache.batchSize + 1);
      end = index + 1;
    } else {
      // Reads usually continue forward, such as typeahead searching on from the highlighted item.
      cache.batchSize = MIN_READ_BATCH;
      start = index;
      end = Math.min(count, index + MIN_READ_BATCH);
    }
    cache.batchStart = start;
    cache.batchEnd = end;

    const indexes: number[] = [];
    for (let position = start; position < end; position += 1) {
      if (!isRead(position)) {
        indexes.push(position);
      }
    }
    ReactDOM.flushSync(() => {
      hiddenControllerRef.current?.({ indexes, text: label });
    });
    // Flushing can also commit a render of the list, which starts a new cache, so the data goes
    // into the current one.
    const current = readCacheRef.current;
    for (const position of indexes) {
      const entry = registry.get(position);
      current.values[position] = entry?.value;
      current.disabled[position] = entry?.disabled ?? false;
      if (label) {
        current.labels[position] = entry ? entry.getLabel() : null;
      }
    }
  });

  // Reads the values and disabled states of a span of items into `values` and `disabled`.
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
      if (missing.length === 0) {
        return;
      }
      ReactDOM.flushSync(() => {
        hiddenControllerRef.current?.({ indexes: missing, text: false });
      });
      for (const index of missing) {
        const entry = registry.get(index);
        values[index] = entry?.value;
        disabled[index] = entry?.disabled ?? false;
      }
    },
  );

  // A selection that spans many items resolves a chunk at a time, so it doesn't block the page,
  // and commits once. A new key or pointer press cancels it.
  const resolveYield = useBrowserYield();
  const cancelResolve = resolveYield.cancel;

  const commitSelection = useStableCallback(
    (action: SelectionAction, eventDetails: ListboxRoot.ChangeEventDetails) => {
      cancelResolve();
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
      if (!span || span[1] - span[0] + 1 <= ASYNC_RANGE_THRESHOLD) {
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
        while (next <= span[1] && performance.now() - sliceStart < RANGE_SLICE_MS) {
          const end = Math.min(span[1] + 1, next + RANGE_CHUNK_SIZE);
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

  // During a typing session, labels after the highlighted item are read ahead between keystrokes,
  // in the order typeahead searches them, so a match further down the list is usually already
  // read. Each key moves the window to READ_AHEAD_DISTANCE items past wherever the search landed.
  // Positions keep counting past the end of the list, which wraps to the start like typeahead.
  const readAheadYield = useBrowserYield();
  const readAheadRef = React.useRef<{ cursor: number; end: number; running: boolean } | null>(null);
  const stopReadAhead = useStableCallback(() => {
    readAheadYield.cancel();
    readAheadRef.current = null;
  });
  const startReadAhead = useStableCallback(() => {
    const count = store.state.items?.length ?? 0;
    if (store.state.range == null || count === 0) {
      return;
    }
    const from = (store.state.activeIndex ?? -1) + 1;
    const end = from + Math.min(READ_AHEAD_DISTANCE, count);
    let state = readAheadRef.current;
    if (!state) {
      state = { cursor: from, end, running: false };
      readAheadRef.current = state;
    } else {
      // Skip what the search has already moved past, and read on from where it landed.
      if (from > state.cursor) {
        state.cursor = from;
      }
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
          // Kept too, since the item may scroll out of the window before typeahead reads it.
          const cache = readCacheRef.current;
          cache.labels[index] = rendered.getLabel();
          cache.values[index] = rendered.value;
          cache.disabled[index] = rendered.disabled;
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

  useIsoLayoutEffect(() => {
    const { labelsRef: labelData, disabledItemsRef: disabledData } = store.context;
    const { valuesRef: valueData } = store.context;
    if (!hasCollection) {
      labelData.setReader(null);
      disabledData.setReader(null);
      valueData.setReader(null);
      return;
    }
    const length = () => store.state.items?.length ?? 0;
    labelData.setReader({
      length,
      get(index) {
        const rendered = store.context.renderedItems.get(index);
        if (rendered) {
          return rendered.getLabel();
        }
        readItem(index, true);
        return readCacheRef.current.labels[index] ?? null;
      },
    });
    disabledData.setReader({
      length,
      get(index) {
        const rendered = store.context.renderedItems.get(index);
        if (rendered) {
          return rendered.disabled;
        }
        readItem(index, false);
        return readCacheRef.current.disabled[index] ?? false;
      },
    });
    valueData.setReader({
      length,
      get(index) {
        const rendered = store.context.renderedItems.get(index);
        if (rendered) {
          return rendered.value;
        }
        readItem(index, false);
        return readCacheRef.current.values[index];
      },
    });
  }, [hasCollection, readItem, store]);

  // Any render can change what the render functions return, so reads start fresh. What's read
  // during a typing session is kept until it ends: typing moves the highlight, which usually
  // scrolls and renders the list, and the search is for what the user saw when they started typing.
  useIsoLayoutEffect(() => {
    if (typingRef.current) {
      return;
    }
    readCacheRef.current = {
      labels: [],
      disabled: [],
      values: [],
      batchStart: -1,
      batchEnd: -1,
      batchSize: 0,
    };
  });

  const collection =
    hasCollection && fragment
      ? ReactDOM.createPortal(
          <ListboxHiddenRoot
            controllerRef={hiddenControllerRef}
            registry={registry}
            renderItem={renderHiddenItem}
          />,
          fragment,
        )
      : null;

  const element = useRenderElement('div', componentProps, {
    ref: [forwardedRef, setListElement, composite.props.ref],
    state,
    props: [defaultProps, elementProps, { children: content }],
  });

  // Use composite's elementsRef for the CompositeList so that keyboard navigation
  // and item registration share the same ref.
  return (
    <React.Fragment>
      {collection}
      <CompositeList
        elementsRef={composite.elementsRef}
        // With `range`, the labels come from every item instead of the rendered ones.
        labelsRef={hasCollection ? undefined : labelsRef}
        onMapChange={onMapChange}
      >
        {element}
      </CompositeList>
    </React.Fragment>
  );
});

export interface ListboxListState {
  /**
   * Whether the listbox is disabled.
   */
  disabled: boolean;
  /**
   * The orientation of the listbox.
   */
  orientation: 'vertical' | 'horizontal';
}

export interface ListboxListProps extends Omit<
  BaseUIComponentProps<'div', ListboxListState>,
  'children'
> {
  /**
   * The items. With `items` on `Listbox.Root`, a function that renders one item, called with
   * the item and its index, or one group when the items are grouped.
   */
  children?: React.ReactNode | ((item: any, index: number) => React.ReactNode);
}

export namespace ListboxList {
  export type Props = ListboxListProps;
  export type State = ListboxListState;
}
