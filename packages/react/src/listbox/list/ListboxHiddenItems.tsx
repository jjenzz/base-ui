'use client';
import * as React from 'react';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import { ListboxItemIndexContext } from '../collection/ListboxCollectionContext';
import type { ListboxItemData } from '../utils/itemData';

/**
 * Present while items render into the hidden root, which renders the items whose data is being
 * read. Each item registers its data here, by position.
 */
export const ListboxHiddenItemsContext = React.createContext<Map<number, ListboxItemData> | null>(
  null,
);

/** Whether labels are being read, so items whose text is nested in elements render it. */
const ListboxHiddenTextContext = React.createContext(false);

function getPlainText(children: React.ReactNode): string | null {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  return null;
}

/**
 * Used by `Listbox.Item`. In the hidden root, registers the item's value, disabled state and how
 * to read its label, and returns whether the item needs to render its text: only while labels are
 * being read and its text is nested in elements. Returns `null` outside the hidden root.
 */
export function useListboxHiddenItemRegistration(props: {
  label: string | undefined;
  disabled: boolean | undefined;
  value: any;
  children: React.ReactNode;
}): { rendersText: boolean; textRef: React.RefObject<HTMLSpanElement | null> } | null {
  const { label, disabled = false, value = null, children } = props;
  const registry = React.useContext(ListboxHiddenItemsContext);
  const readingText = React.useContext(ListboxHiddenTextContext);
  const index = React.useContext(ListboxItemIndexContext) ?? -1;
  const textRef = React.useRef<HTMLSpanElement | null>(null);

  const plainText = registry ? (label ?? getPlainText(children)) : null;
  const rendersText = registry != null && readingText && plainText == null;

  useIsoLayoutEffect(() => {
    if (!registry || index === -1) {
      return undefined;
    }
    registry.set(index, {
      getLabel: () => plainText ?? textRef.current?.textContent ?? null,
      disabled,
      value,
    });
    return () => {
      registry.delete(index);
    };
  }, [registry, index, plainText, disabled, value, rendersText]);

  return registry ? { rendersText, textRef } : null;
}

export interface ListboxHiddenBatch {
  indexes: number[];
  /** Whether labels are being read, so nested text renders. */
  text: boolean;
}

export interface ListboxHiddenRootProps {
  /** Receives the function that sets which items render. */
  controllerRef: React.RefObject<((batch: ListboxHiddenBatch) => void) | null>;
  registry: Map<number, ListboxItemData>;
  /** Renders the item at a position with the latest render function. */
  renderItem: (index: number) => React.ReactNode;
}

const EMPTY_BATCH: ListboxHiddenBatch = { indexes: [], text: false };

/**
 * Renders the items whose data is being read into a detached fragment. It only renders when the
 * listbox asks it to, not when the list renders.
 */
export const ListboxHiddenRoot = React.memo(function ListboxHiddenRoot(
  props: ListboxHiddenRootProps,
) {
  const { controllerRef, registry, renderItem } = props;
  const [batch, setBatch] = React.useState(EMPTY_BATCH);

  useIsoLayoutEffect(() => {
    controllerRef.current = setBatch;
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef]);

  return (
    <ListboxHiddenItemsContext.Provider value={registry}>
      <ListboxHiddenTextContext.Provider value={batch.text}>
        {batch.indexes.map((index) => (
          <ListboxItemIndexContext.Provider key={index} value={index}>
            {renderItem(index)}
          </ListboxItemIndexContext.Provider>
        ))}
      </ListboxHiddenTextContext.Provider>
    </ListboxHiddenItemsContext.Provider>
  );
});
