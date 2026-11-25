'use client';
import * as React from 'react';
import { Tree } from '@base-ui/react/tree';
import type { BenchItem } from './data';
import type { BenchTreeProps } from './types';
import styles from './bench.module.css';

/**
 * Flavien's Tree from `flaviendelangle/base-ui#tree`, unchanged: a flat list of rows, guides from
 * `Tree.ItemIndentGuide`, and `Tree.GroupTransition` after each item for animated expansion.
 * `Tree.List` renders every visible row; the PR has no virtualization API.
 */
export function FlavienTree(props: BenchTreeProps) {
  const { items, expanded, onExpandedChange } = props;
  return (
    <Tree.Root
      items={items}
      expandedItems={expanded}
      onExpandedItemsChange={(next) => onExpandedChange(next as string[])}
    >
      <Tree.List aria-label="Benchmark" className={styles.Tree} data-bench-scroller="">
        {(item: BenchItem) => (
          <React.Fragment>
            <Tree.Item itemId={item.id} className={styles.FlatRow}>
              <Tree.ItemIndentGuide className={styles.IndentGuide} />
              {item.children ? (
                <Tree.ItemExpansionTrigger className={styles.Chevron}>
                  <ChevronIcon />
                </Tree.ItemExpansionTrigger>
              ) : (
                <span className={styles.ChevronSpace} />
              )}
              <span className={styles.Label}>{item.label}</span>
            </Tree.Item>
            <Tree.GroupTransition className={styles.GroupTransition} />
          </React.Fragment>
        )}
      </Tree.List>
    </Tree.Root>
  );
}

export function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}
