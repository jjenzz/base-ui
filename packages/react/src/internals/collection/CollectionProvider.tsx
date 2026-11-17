'use client';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { useIsoLayoutEffect } from '@base-ui/utils/useIsoLayoutEffect';
import {
  CollectionContext,
  CollectionHiddenContext,
  CollectionItemIndexContext,
} from './CollectionContext';
import type { CollectionInternals, HiddenBatch } from './useCollection';

/**
 * Renders the items whose data is being read into the detached fragment. It only renders the
 * batch it's given, when the collection asks it to, not when the list renders, and tells the
 * collection once the batch has committed, while its items are mounted.
 */
const CollectionHiddenRoot = React.memo(function CollectionHiddenRoot(props: {
  internals: CollectionInternals<any>;
}) {
  const { internals } = props;
  const [batch, setBatch] = React.useState<HiddenBatch | null>(null);

  useIsoLayoutEffect(() => {
    internals.controllerRef.current = setBatch;
    return () => {
      internals.controllerRef.current = null;
    };
  }, [internals]);

  // Runs after the items' own layout effects, so each has registered its data.
  useIsoLayoutEffect(() => {
    if (batch) {
      internals.committedRef.current?.(batch);
    }
  }, [internals, batch]);

  const text = batch?.text ?? false;
  const hiddenContext = React.useMemo(
    () => ({ registry: internals.hiddenRegistry, text }),
    [internals, text],
  );

  return (
    <CollectionHiddenContext.Provider value={hiddenContext}>
      {batch?.indexes.map((index) => (
        <CollectionItemIndexContext.Provider key={index} value={index}>
          {batch.render(batch.items[index], index)}
        </CollectionItemIndexContext.Provider>
      ))}
    </CollectionHiddenContext.Provider>
  );
});

/**
 * Provides a collection to the items rendered inside it, and renders the hidden fragment its
 * items render into when their data is read.
 */
export function CollectionProvider(props: {
  collection: { enabled: boolean; internals: CollectionInternals<any> };
  children?: React.ReactNode;
}) {
  const { collection, children } = props;
  const { enabled, internals } = collection;

  const context = React.useMemo(
    () => ({ rendered: internals.rendered, enabled }),
    [internals, enabled],
  );

  return (
    <CollectionContext.Provider value={context}>
      {enabled &&
        internals.fragment &&
        ReactDOM.createPortal(<CollectionHiddenRoot internals={internals} />, internals.fragment)}
      {children}
    </CollectionContext.Provider>
  );
}

/** Gives the item rendered inside it its position in the whole collection. */
export function CollectionItemIndex(props: { value: number; children?: React.ReactNode }) {
  return (
    <CollectionItemIndexContext.Provider value={props.value}>
      {props.children}
    </CollectionItemIndexContext.Provider>
  );
}
