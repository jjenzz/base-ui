/**
 * Benchmark data shared by every implementation. Every row is 28px tall in every implementation,
 * so the same expanded state gives the same scroll height.
 */
export interface BenchItem {
  id: string;
  label: string;
  children?: BenchItem[];
}

export const ROW_SIZE = 28;

function files(parent: string, count: number): BenchItem[] {
  return Array.from({ length: count }, (_, index) => {
    const label = `file-${String(index + 1).padStart(3, '0')}.ts`;
    return { id: `${parent}/${label}`, label };
  });
}

/** Wide and shallow: 50 folders × 20 modules × 50 files, 51,050 rows over 3 levels. */
function large(): BenchItem[] {
  return Array.from({ length: 50 }, (_, folderIndex) => {
    const folder = `folder-${String(folderIndex + 1).padStart(2, '0')}`;
    return {
      id: folder,
      label: folder,
      children: Array.from({ length: 20 }, (__, moduleIndex) => {
        const label = `module-${String(moduleIndex + 1).padStart(2, '0')}`;
        const id = `${folder}/${label}`;
        return { id, label, children: files(id, 50) };
      }),
    };
  });
}

/** Deep and large: every folder has 3 children, 9 levels, 29,523 rows. */
function deep(): BenchItem[] {
  function level(parent: string, depth: number): BenchItem[] {
    return Array.from({ length: 3 }, (_, index) => {
      const id = parent ? `${parent}-${index + 1}` : `n${index + 1}`;
      return depth === 9
        ? { id, label: `${id}.ts` }
        : { id, label: id, children: level(id, depth + 1) };
    });
  }
  return level('', 1);
}

/** Very deep: a chain of 100 folders, each with 5 files, 600 rows over 101 levels. */
function chain(): BenchItem[] {
  function link(depth: number, parent: string): BenchItem[] {
    const own = files(parent || 'root', 5);
    if (depth > 100) {
      return own;
    }
    const id = `c${depth}`;
    return [{ id, label: id, children: link(depth + 1, id) }, ...own];
  }
  return link(1, '');
}

export const datasets = { large, deep, chain };
export type DatasetName = keyof typeof datasets;

/** Which folder each benchmark collapses and expands again: one in the middle of the tree. */
export const middleFolder: Record<DatasetName, string> = {
  large: 'folder-25',
  deep: 'n2',
  chain: 'c50',
};

export function collectFolders(items: BenchItem[]) {
  const folders: string[] = [];
  let rows = 0;
  (function walk(list: BenchItem[]) {
    for (const item of list) {
      rows += 1;
      if (item.children) {
        folders.push(item.id);
        walk(item.children);
      }
    }
  })(items);
  return { folders, rows };
}
