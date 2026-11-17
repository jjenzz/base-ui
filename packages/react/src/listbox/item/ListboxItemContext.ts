'use client';
import * as React from 'react';

export interface ListboxItemContext {
  selected: boolean;
  indexRef: React.RefObject<number>;
  hasRegistered: boolean;
}

export const ListboxItemContext = React.createContext<ListboxItemContext | undefined>(undefined);

export function useListboxItemContext(): ListboxItemContext;
export function useListboxItemContext(optional: boolean): ListboxItemContext | undefined;
export function useListboxItemContext(optional = false) {
  const context = React.useContext(ListboxItemContext);
  if (!context && !optional) {
    throw new Error(
      'Base UI: ListboxItemContext is missing. ListboxItem parts must be placed within <Listbox.Item>.',
    );
  }
  return context;
}
