'use client';
import * as React from 'react';

/**
 * The position in the whole list of the item being rendered by a render function.
 */
export const ListboxItemIndexContext = React.createContext<number | undefined>(undefined);

/**
 * The group being rendered by `Listbox.List`'s render function, and the position in the whole
 * list of its first item.
 */
export const ListboxListGroupContext = React.createContext<
  { index: number; offset: number } | undefined
>(undefined);
