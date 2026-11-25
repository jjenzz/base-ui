'use client';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { FlavienTree } from './_components/bench/FlavienTree';
import {
  FlatTree,
  FlatVirtualTree,
  NestedTree,
  NestedVirtualTree,
} from './_components/bench/PrototypeTrees';
import { collectFolders, datasets, middleFolder } from './_components/bench/data';
import type { DatasetName } from './_components/bench/data';
import type { BenchTreeProps } from './_components/bench/types';

/**
 * Benchmark harness: `?impl=flavien|nested|nested-virtual|flat|flat-virtual&dataset=large|deep|chain`.
 * Open two in side-by-side tabs to compare by hand; `window.treeBench` drives the automated runs.
 */

const implementations: Record<string, React.ComponentType<BenchTreeProps>> = {
  flavien: FlavienTree,
  nested: NestedTree,
  'nested-virtual': NestedVirtualTree,
  flat: FlatTree,
  'flat-virtual': FlatVirtualTree,
};

const implementationLabels: Record<string, string> = {
  flavien: "Flavien's Tree (flat list, ItemIndentGuide, GroupTransition)",
  nested: 'Nested prototype, every row rendered',
  'nested-virtual': 'Nested prototype, TanStack Virtual per level',
  flat: 'Flat control on the prototype store, every row rendered',
  'flat-virtual': 'Flat control on the prototype store, one TanStack virtualizer',
};

function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      // Runs after the frame that includes the commit has been painted.
      setTimeout(resolve, 0);
    });
  });
}

export default function TreeBenchmark() {
  const [params, setParams] = React.useState<{ impl: string; dataset: DatasetName } | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const [last, setLast] = React.useState<string>('');

  React.useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const impl = search.get('impl') ?? 'nested-virtual';
    const dataset = (search.get('dataset') ?? 'large') as DatasetName;
    setParams({ impl, dataset });
  }, []);

  const data = React.useMemo(() => {
    if (!params) {
      return null;
    }
    const items = datasets[params.dataset]();
    return { items, ...collectFolders(items) };
  }, [params]);

  const timed = React.useCallback(async (label: string, update: () => void) => {
    const start = performance.now();
    // Render and commit synchronously, then wait for the frame that paints it.
    ReactDOM.flushSync(update);
    await nextPaint();
    const ms = Math.round((performance.now() - start) * 10) / 10;
    setLast(`${label}: ${ms} ms`);
    return ms;
  }, []);

  React.useEffect(() => {
    if (!params || !data) {
      return;
    }
    const scroller = () => document.querySelector<HTMLElement>('[data-bench-scroller]');
    (window as any).treeBench = {
      ready: true,
      rows: data.rows,
      folders: data.folders.length,
      mount: (expandAll: boolean) =>
        timed('mount', () => {
          setExpanded(expandAll ? data.folders : []);
          setMounted(true);
        }),
      unmount: () => timed('unmount', () => setMounted(false)),
      expandAll: () => timed('expand all', () => setExpanded(data.folders)),
      collapseAll: () => timed('collapse all', () => setExpanded([])),
      collapseMiddle: () =>
        timed('collapse middle', () =>
          setExpanded((list) => list.filter((id) => id !== middleFolder[params.dataset])),
        ),
      expandMiddle: () =>
        timed('expand middle', () =>
          setExpanded((list) =>
            list.includes(middleFolder[params.dataset])
              ? list
              : [...list, middleFolder[params.dataset]],
          ),
        ),
      domNodes: () => scroller()?.getElementsByTagName('*').length ?? 0,
      rowsInDom: () => scroller()?.querySelectorAll('[role=treeitem]').length ?? 0,
      scrollHeight: () => scroller()?.scrollHeight ?? 0,
      /** Scrolls `distance` px per frame for `frames` frames; returns frame-time stats in ms. */
      scroll: (distance: number, frames: number) =>
        new Promise((resolve) => {
          const element = scroller()!;
          const times: number[] = [];
          let previous = performance.now();
          let count = 0;
          function step() {
            const now = performance.now();
            if (count > 0) {
              times.push(now - previous);
            }
            previous = now;
            if (count === frames) {
              times.sort((a, b) => a - b);
              const sum = times.reduce((total, time) => total + time, 0);
              resolve({
                mean: Math.round((sum / times.length) * 10) / 10,
                p95: Math.round(times[Math.floor(times.length * 0.95)] * 10) / 10,
                max: Math.round(times[times.length - 1] * 10) / 10,
                over20ms: times.filter((time) => time > 20).length,
                blankRows: countBlank(element),
              });
              return;
            }
            element.scrollTop += distance;
            count += 1;
            requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        }),
    };
  }, [params, data, timed]);

  if (!params || !data) {
    return null;
  }

  const Implementation = implementations[params.impl];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13 }}>
        <strong>{implementationLabels[params.impl]}</strong>
        <br />
        Dataset <code>{params.dataset}</code>: {data.rows.toLocaleString()} rows,{' '}
        {data.folders.length.toLocaleString()} folders
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => (window as any).treeBench.mount(false)}>
          Mount collapsed
        </button>
        <button type="button" onClick={() => (window as any).treeBench.mount(true)}>
          Mount expanded
        </button>
        <button type="button" onClick={() => (window as any).treeBench.expandAll()}>
          Expand all
        </button>
        <button type="button" onClick={() => (window as any).treeBench.collapseAll()}>
          Collapse all
        </button>
        <button type="button" onClick={() => (window as any).treeBench.collapseMiddle()}>
          Collapse middle
        </button>
        <button type="button" onClick={() => (window as any).treeBench.expandMiddle()}>
          Expand middle
        </button>
      </div>
      <div style={{ fontSize: 13 }} data-bench-last="">
        {last}
      </div>
      {mounted && (
        <Implementation items={data.items} expanded={expanded} onExpandedChange={setExpanded} />
      )}
    </div>
  );
}

/** Rows of the visible area that have nothing rendered under them, sampled every 28px. */
function countBlank(scroller: HTMLElement) {
  const rect = scroller.getBoundingClientRect();
  let blank = 0;
  for (let y = rect.top + 14; y < rect.bottom; y += 28) {
    const hit = scroller.ownerDocument.elementFromPoint(rect.left + rect.width / 2, y);
    if (!hit?.closest('[role=treeitem]')) {
      blank += 1;
    }
  }
  return blank;
}
