import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import { createColourItems, createItems } from './shared';
import { BenchList } from './variant';

let root: ReactDOMClient.Root | null = null;
let mutations = 0;
new MutationObserver((records) => {
  mutations += records.length;
}).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}
async function settle() {
  let quiet = 0;
  while (quiet < 2) {
    const before = mutations;
    // eslint-disable-next-line no-await-in-loop
    await nextFrame();
    quiet = mutations === before ? quiet + 1 : 0;
  }
}
function inTask(fn: () => void) {
  return new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      try { fn(); resolve(); } catch (error) { reject(error); }
    }, 0);
  });
}
function pressKey(key: string, init: KeyboardEventInit = {}) {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}
function active() {
  return document.activeElement?.textContent ?? '';
}
function list() {
  return document.querySelector<HTMLElement>('[role="listbox"]')!;
}
function check(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

let items = createItems(1);

// Presses Ctrl+A and reports the longest gap between heartbeat tasks (roughly the longest task the
// page couldn't respond during) and the time until onValueChange fired.
async function measureSelectAll(press: () => void) {
  let longest = 0;
  let last = performance.now();
  let beating = true;
  const beat = () => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
    if (beating) setTimeout(beat, 0);
  };
  setTimeout(beat, 0);
  (window as any).valueChangedAt = 0;
  const pressedAt = performance.now();
  await inTask(press);
  const deadline = pressedAt + 3000;
  while (!(window as any).valueChangedAt && performance.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await nextFrame();
  }
  beating = false;
  await settle();
  const changedAt = (window as any).valueChangedAt;
  check(Boolean(changedAt), 'selectAll: onValueChange never fired');
  return { longest, untilChange: changedAt - pressedAt };
}

const steps: Record<string, () => Promise<void | Record<string, number>>> = {
  async mount() {
    await inTask(() => {
      const container = document.getElementById('root')!;
      root = ReactDOMClient.createRoot(container);
      ReactDOM.flushSync(() => root!.render(<BenchList items={items} />));
    });
  },
  async focus() {
    await inTask(() => list().querySelector<HTMLElement>('[role="option"]')!.focus());
    await settle();
    check(active() === items[0].label, `focus: ${active()}`);
  },
  async arrowDown() {
    await inTask(() => pressKey('ArrowDown'));
    await settle();
    check(active() === items[1].label, `arrowDown: ${active()}`);
  },
  async end() {
    await inTask(() => pressKey('End'));
    await settle();
    check(active().startsWith(items[items.length - 1].label), `end: ${active()}`);
  },
  async home() {
    await inTask(() => pressKey('Home'));
    await settle();
    check(active() === items[0].label, `home: ${active()}`);
  },
  async typeahead() {
    // A label in the middle of the list, typed one key per task.
    const target = items[Math.floor(items.length / 2) + 1].label;
    const result = await typeKeys(target, 0);
    check(active() === target, `typeahead: ${active()} != ${target}`);
    return result;
  },

  async selectAll() {
    return measureSelectAll(() => pressKey('a', { ctrlKey: true }));
  },
  async scroll() {
    await inTask(() => {
      list().scrollTop += 3200;
    });
    await settle();
  },
  async scrollThenType() {
    // Scrolls a little, then types the label of an item near the end straight away.
    const target = items[items.length - 10].label;
    await inTask(() => {
      list().scrollTop += 64;
    });
    const result = await typeKeys(target, 0);
    check(active() === target, `scrollThenType: ${active()} != ${target}`);
    return result;
  },

  async scrollThenSelectAll() {
    await inTask(() => {
      list().scrollTop += 64;
    });
    return measureSelectAll(() => pressKey('a', { ctrlKey: true }));
  },
  async typeaheadPaced() {
    const target = items[Math.floor(items.length / 2) + 7].label;
    const result = await typeKeys(target, 120);
    check(active() === target, `typeaheadPaced: ${active()} != ${target}`);
    return result;
  },
  async scrollThenTypePaced() {
    const target = items[items.length - 10].label;
    await inTask(() => {
      list().scrollTop += 64;
    });
    const result = await typeKeys(target, 120);
    check(active() === target, `scrollThenTypePaced: ${active()} != ${target}`);
    return result;
  },
  async rebuild() {
    // New objects with the same data, as when items are mapped from fetched data again.
    await inTask(() =>
      ReactDOM.flushSync(() => root!.render(<BenchList items={items.map((row) => ({ ...row }))} />)),
    );
    await settle();
  },
  async append() {
    // Adds one item to the end, so no existing item moves.
    const extra = { value: 'new', label: 'A new item', disabled: false };
    await inTask(() => ReactDOM.flushSync(() => root!.render(<BenchList items={[...items, extra]} />)));
    await settle();
  },
  async prepend() {
    // Adds one item to the start, so every existing item moves down one position.
    const extra = { value: 'new', label: 'A new item', disabled: false };
    await inTask(() => ReactDOM.flushSync(() => root!.render(<BenchList items={[extra, ...items]} />)));
    await settle();
  },
  async unmount() {
    await inTask(() => ReactDOM.flushSync(() => root!.unmount()));
    root = null;
    await settle();
  },
};

// Types one key per task, `gap` ms apart, and reports the slowest keystroke: from dispatching it
// to its render finishing.
async function typeKeys(text: string, gap: number) {
  // A heartbeat records the longest stretch the page couldn't respond during, including work that
  // a key press leaves for later tasks.
  let longestTask = 0;
  let last = performance.now();
  let beating = true;
  const beat = () => {
    const now = performance.now();
    longestTask = Math.max(longestTask, now - last);
    last = now;
    if (beating) {
      setTimeout(beat, 0);
    }
  };
  setTimeout(beat, 0);

  let slowestKey = 0;
  let lastKeyAt = 0;
  for (const key of text.toLowerCase()) {
    const start = performance.now();
    lastKeyAt = start;
    // eslint-disable-next-line no-await-in-loop
    await inTask(() => pressKey(key));
    slowestKey = Math.max(slowestKey, performance.now() - start);
    if (gap > 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, gap));
    }
  }
  // A search can finish after the key press, once the labels it reached have been read.
  while (active() !== text && performance.now() - lastKeyAt < 3000) {
    // eslint-disable-next-line no-await-in-loop
    await nextFrame();
  }
  const untilMatch = performance.now() - lastKeyAt;
  beating = false;
  await settle();
  return { slowestKey, longestTask, untilMatch };
}

// Unmeasured setup before a step: focus a rendered item and let any typing session end.
const preparations: Record<string, () => Promise<void>> = {
  async scrollThenType() {
    // Back to the top, which renders the list again, so nothing read earlier is reused.
    await inTask(() => {
      list().scrollTop = 0;
    });
    await settle();
    await inTask(() => list().querySelector<HTMLElement>('[role="option"]')!.focus());
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await settle();
  },
};
preparations.typeaheadPaced = preparations.scrollThenType;
preparations.scrollThenTypePaced = preparations.scrollThenType;
preparations.typeahead = preparations.scrollThenType;
preparations.scrollThenSelectAll = async () => {
  await preparations.scrollThenType();
  await inTask(() => pressKey('Escape'));
  await settle();
};
preparations.selectAll = async () => {
  await inTask(() => pressKey('Escape'));
  await settle();
};

(window as any).bench = {
  async prepare(step: string) {
    await preparations[step]?.();
  },
  setCount(count: number, labels?: string) {
    items = labels === 'colours' ? createColourItems(Math.round(count / 7)) : createItems(count);
  },
  async run(step: string) {
    return (await steps[step]()) ?? null;
  },
  settle,
};
