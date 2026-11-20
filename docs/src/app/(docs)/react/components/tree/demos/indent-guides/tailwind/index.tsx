'use client';
import * as React from 'react';
import { Tree } from '@base-ui/react/tree';

const items: Tree.DefaultItem[] = [
  {
    id: 'src',
    label: 'src',
    children: [
      {
        id: 'components',
        label: 'components',
        children: [
          { id: 'button', label: 'Button.tsx' },
          { id: 'dialog', label: 'Dialog.tsx' },
        ],
      },
      { id: 'index', label: 'index.ts' },
      {
        id: 'utils',
        label: 'utils',
        children: [
          { id: 'format', label: 'format.ts' },
          { id: 'parse', label: 'parse.ts' },
        ],
      },
    ],
  },
  {
    id: 'public',
    label: 'public',
    children: [{ id: 'favicon', label: 'favicon.ico' }],
  },
  { id: 'package-json', label: 'package.json' },
  { id: 'readme', label: 'README.md' },
];

const ITEM_CLASS =
  'flex cursor-default items-center gap-2 py-1 pe-2 select-none text-sm/[1.5] outline-none ' +
  'ps-[calc(0.5rem+1.25rem*(var(--tree-item-level)-1))] ' +
  'border-s-2 border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 ' +
  'data-selected:border-neutral-950 data-selected:bg-neutral-200 ' +
  'dark:data-selected:border-white dark:data-selected:bg-neutral-700 ' +
  'focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-neutral-950 ' +
  'dark:focus-visible:outline-white ' +
  'forced-colors:border-[color:Canvas] forced-colors:data-selected:border-[color:Highlight] ' +
  // @highlight-start
  // One guide line per ancestor level, centered under each ancestor's icon
  'relative before:pointer-events-none before:absolute before:inset-y-0 before:left-2 ' +
  'before:w-[calc(1.25rem*(var(--tree-item-level)-1))] ' +
  'before:bg-[repeating-linear-gradient(to_right,transparent_0_0.5rem,var(--color-neutral-300)_0.5rem_calc(0.5rem+1px),transparent_calc(0.5rem+1px)_1.25rem)] ' +
  'dark:before:bg-[repeating-linear-gradient(to_right,transparent_0_0.5rem,var(--color-neutral-600)_0.5rem_calc(0.5rem+1px),transparent_calc(0.5rem+1px)_1.25rem)]';
// @highlight-end

const ICON_CLASS = 'inline-flex shrink-0 text-neutral-500 dark:text-neutral-400 [&_svg]:size-4';

export default function ExampleTreeIndentGuides() {
  return (
    <Tree.Root items={items} defaultExpandedItems={['src', 'components', 'utils', 'public']}>
      <Tree.List
        aria-label="Project files"
        className="box-content w-68 border border-neutral-200 bg-white p-1 text-neutral-950 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
      >
        {(item: Tree.DefaultItem) => (
          <Tree.Item itemId={item.id} className={ITEM_CLASS}>
            <Tree.ItemIndicator match="closed" className={ICON_CLASS}>
              <FolderIcon />
            </Tree.ItemIndicator>
            <Tree.ItemIndicator match="open" className={ICON_CLASS}>
              <FolderOpenIcon />
            </Tree.ItemIndicator>
            {item.children == null && (
              <span className={ICON_CLASS}>
                <FileIcon />
              </span>
            )}
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              {item.label}
            </span>
          </Tree.Item>
        )}
      </Tree.List>
    </Tree.Root>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3.4l1.8 1.7H13a1.5 1.5 0 0 1 1.5 1.5v5.3A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  );
}

function FolderOpenIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.5 11.5V4.5A1.5 1.5 0 0 1 3 3h3.4l1.8 1.7H12a1.5 1.5 0 0 1 1.5 1.5V7M1.5 11.5 3.2 7.6A1 1 0 0 1 4.1 7h10a.6.6 0 0 1 .55.83l-1.9 4.5A1 1 0 0 1 11.8 13H3a1.5 1.5 0 0 1-1.5-1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 1.5h5L12.5 5v8.5a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1ZM9 1.5V5h3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}
