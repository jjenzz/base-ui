'use client';
import * as React from 'react';

/** Where rendered items register, and whether they should. */
export const CollectionContext = React.createContext<{
  rendered: Map<number, any>;
  enabled: boolean;
} | null>(null);

/**
 * Present while items render into the hidden fragment. `registry` collects what each item
 * registers, by position, and `text` says whether the current read needs nested text rendered.
 */
export const CollectionHiddenContext = React.createContext<{
  registry: Map<number, any>;
  text: boolean;
} | null>(null);

/** The position in the whole collection of the item being rendered. */
export const CollectionItemIndexContext = React.createContext<number | undefined>(undefined);
