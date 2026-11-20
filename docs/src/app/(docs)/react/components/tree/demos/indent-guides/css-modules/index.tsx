'use client';
import * as React from 'react';
import { Tree } from '@base-ui/react/tree';
import styles from './index.module.css';

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

export default function ExampleTreeIndentGuides() {
  return (
    <Tree.Root items={items} defaultExpandedItems={['src', 'components', 'utils', 'public']}>
      <Tree.List aria-label="Project files" className={styles.Tree}>
        {(item: Tree.DefaultItem) => (
          <Tree.Item itemId={item.id} className={styles.Item}>
            <Tree.ItemIndicator match="closed" className={styles.Icon}>
              <FolderIcon />
            </Tree.ItemIndicator>
            <Tree.ItemIndicator match="open" className={styles.Icon}>
              <FolderOpenIcon />
            </Tree.ItemIndicator>
            {item.children == null && (
              <span className={styles.Icon}>
                <FileIcon />
              </span>
            )}
            <span className={styles.Label}>{item.label}</span>
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
