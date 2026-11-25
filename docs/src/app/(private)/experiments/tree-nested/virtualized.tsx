'use client';
import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Tree } from './_components/tree-parts';
import type { TreePath } from './_components/tree-parts';
import styles from './virtualized.module.css';

/**
 * A nested Tree (Item / Trigger / Group) virtualized with TanStack Virtual: one virtualizer per
 * expanded level, all sharing the list as their scroll element. The parts are a local prototype in
 * `_components/tree-parts.tsx`; this file is only consumer code.
 */

const ROW_SIZE = 28;

export default function NestedVirtualizedTree() {
  const [expanded, setExpanded] = React.useState<string[]>(['deep', ...deepChain]);
  const [scrollElement, setScrollElement] = React.useState<HTMLDivElement | null>(null);
  const [levels] = React.useState(createLevels);

  return (
    <div className={styles.Wrapper}>
      <div className={styles.Toolbar}>
        <button type="button" onClick={() => setExpanded(allFolders)}>
          Expand all ({fileCount.toLocaleString()} files)
        </button>
        <button type="button" onClick={() => setExpanded([])}>
          Collapse all
        </button>
      </div>
      <Tree.Root
        items={files}
        itemToValue={getPath}
        itemToChildren={getChildren}
        expandedItems={expanded}
        onExpandedItemsChange={setExpanded}
        onItemHighlighted={(_, { reason, path }) => {
          if (reason === 'keyboard') {
            levels.scrollToPath(path);
          }
        }}
      >
        <Tree.List ref={setScrollElement} aria-label="Project files" className={styles.Tree}>
          <Level
            nodes={files}
            parent={null}
            start={0}
            scrollElement={scrollElement}
            levels={levels}
          />
        </Tree.List>
      </Tree.Root>
    </div>
  );
}

/**
 * The rows of a level that overlap the viewport, plus one viewport above and below.
 * Count-based `overscan` compounds with depth (every mounted level renders at least one row, even
 * when the whole level is offscreen), so nested levels cull by pixels instead.
 */
function visibleRows(virtualizer: {
  getVirtualItems: () => VirtualRow[];
  scrollOffset: number | null;
  scrollRect: { height: number } | null;
}) {
  const offset = virtualizer.scrollOffset ?? 0;
  const height = virtualizer.scrollRect?.height ?? 0;
  return virtualizer
    .getVirtualItems()
    .filter((row) => row.end > offset - height && row.start < offset + 2 * height);
}

interface VirtualRow {
  key: React.Key;
  index: number;
  start: number;
  end: number;
}

/** Without a starting rect, each level renders empty until a layout effect measures it, and that
 * synchronous update cascades level by level past React's nested-update limit in deep trees. */
function initialRect(scrollElement: HTMLElement | null) {
  return scrollElement
    ? { width: scrollElement.clientWidth, height: scrollElement.clientHeight }
    : undefined;
}

function Level({
  nodes,
  parent,
  start,
  scrollElement,
  levels,
}: {
  nodes: FileNode[];
  parent: string | null;
  start: number;
  scrollElement: HTMLDivElement | null;
  levels: Levels;
}) {
  const getRowCount = Tree.useRowCount();

  const virtualizer = useVirtualizer({
    count: nodes.length,
    getScrollElement: () => scrollElement,
    // A folder's size is its own row plus its visible descendants.
    estimateSize: (index) => ROW_SIZE * getRowCount(nodes[index].path),
    getItemKey: (index) => nodes[index].path,
    // Where this level starts in the shared scroller.
    scrollMargin: start,
    // Levels mount as they scroll into view; without this, each one scrolls back to the top.
    initialOffset: () => scrollElement?.scrollTop ?? 0,
    initialRect: initialRect(scrollElement),
    overscan: 0,
  });

  // Expanding or collapsing changes the sizes of folders that aren't mounted to be measured.
  React.useEffect(() => virtualizer.measure(), [virtualizer, getRowCount]);
  React.useEffect(() => levels.register(parent, virtualizer), [levels, parent, virtualizer]);

  return (
    <div className={styles.Level} style={{ height: virtualizer.getTotalSize() }}>
      {visibleRows(virtualizer).map((row) => {
        const node = nodes[row.index];
        const position: React.CSSProperties = {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${row.start - start}px)`,
        };

        if (!node.children) {
          return (
            <Tree.Item
              key={row.key}
              value={node.path}
              ref={virtualizer.measureElement}
              data-index={row.index}
              className={`${styles.Row} ${styles.File}`}
              style={position}
            >
              {node.name}
            </Tree.Item>
          );
        }

        return (
          <Tree.Item
            key={row.key}
            value={node.path}
            ref={virtualizer.measureElement}
            data-index={row.index}
            style={position}
          >
            <Tree.Trigger className={styles.Row}>
              <Tree.ItemIndicator className={styles.Chevron}>
                <ChevronIcon />
              </Tree.ItemIndicator>
              {node.name}
            </Tree.Trigger>
            <Tree.Group className={styles.Group}>
              <Level
                nodes={node.children}
                parent={node.path}
                start={row.start + ROW_SIZE}
                scrollElement={scrollElement}
                levels={levels}
              />
            </Tree.Group>
          </Tree.Item>
        );
      })}
    </div>
  );
}

/**
 * Each mounted level registers its virtualizer under its parent's value. A path scrolls the deepest
 * mounted level on it; each deeper level finishes the scroll once it mounts.
 */
function createLevels() {
  const virtualizers = new Map<string | null, Virtualizer>();
  let pending: TreePath | null = null;

  function scroll(path: TreePath, depth: number) {
    const step = path[depth];
    const virtualizer = virtualizers.get(step.parent)!;
    const isTarget = depth === path.length - 1;
    pending = isTarget ? null : path.slice(depth + 1);

    if (!isTarget) {
      virtualizer.scrollToIndex(step.index, { align: 'start' });
      return;
    }

    // A folder's virtual item is its whole subtree, so `align: 'auto'` would line up the end of a
    // tall folder with the bottom. Bring only the target's own row into view.
    const row = virtualizer.measurementsCache[step.index];
    const top = virtualizer.scrollOffset ?? 0;
    const bottom = top + (virtualizer.scrollElement?.clientHeight ?? 0);
    if (row.start < top) {
      virtualizer.scrollToIndex(step.index, { align: 'start' });
    } else if (row.start + ROW_SIZE > bottom) {
      virtualizer.scrollBy(row.start + ROW_SIZE - bottom);
    }
  }

  return {
    register(parent: string | null, virtualizer: Virtualizer) {
      virtualizers.set(parent, virtualizer);
      const next = pending;
      if (next?.[0].parent === parent) {
        // After the commit: in Strict Mode, React re-runs the virtualizers' layout effects, and each
        // re-attach writes the offset it started from, which would undo a scroll made now.
        queueMicrotask(() => {
          if (pending === next && virtualizers.get(parent) === virtualizer) {
            scroll(next, 0);
          }
        });
      }
      return () => {
        if (virtualizers.get(parent) === virtualizer) {
          virtualizers.delete(parent);
        }
      };
    },
    scrollToPath(path: TreePath) {
      for (let depth = path.length - 1; depth >= 0; depth -= 1) {
        if (virtualizers.has(path[depth].parent)) {
          scroll(path, depth);
          return;
        }
      }
    },
  };
}

type Levels = ReturnType<typeof createLevels>;
type Virtualizer = ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

interface FileNode {
  path: string;
  name: string;
  children?: FileNode[];
}

function getPath(node: FileNode) {
  return node.path;
}

function getChildren(node: FileNode) {
  return node.children;
}

function pad(value: number, length = 2) {
  return String(value + 1).padStart(length, '0');
}

function createFiles(parent: string, count: number): FileNode[] {
  return Array.from({ length: count }, (_, index) => {
    const name = `file-${pad(index, 3)}.ts`;
    return { path: `${parent}/${name}`, name };
  });
}

// A chain 8 folders deep, to show guides at any depth.
function createChain(parent: string, depth: number): FileNode[] {
  const files3 = createFiles(parent, 3);
  if (depth === 0) {
    return files3;
  }
  const path = `${parent}/level-${9 - depth}`;
  return [{ path, name: `level-${9 - depth}`, children: createChain(path, depth - 1) }, ...files3];
}

// 50 folders × 20 modules × 50 files, after the deep chain.
const files: FileNode[] = [
  { path: 'deep', name: 'deep', children: createChain('deep', 8) },
  ...Array.from({ length: 50 }, (_, folderIndex): FileNode => {
    const folder = `folder-${pad(folderIndex)}`;
    return {
      path: folder,
      name: folder,
      children: Array.from({ length: 20 }, (__, moduleIndex): FileNode => {
        const path = `${folder}/module-${pad(moduleIndex)}`;
        return { path, name: `module-${pad(moduleIndex)}`, children: createFiles(path, 50) };
      }),
    };
  }),
];

const allFolders: string[] = [];
let fileCount = 0;
(function collect(nodes: FileNode[]) {
  for (const node of nodes) {
    if (node.children) {
      allFolders.push(node.path);
      collect(node.children);
    } else {
      fileCount += 1;
    }
  }
})(files);

const deepChain = allFolders.filter((path) => path.startsWith('deep/'));
