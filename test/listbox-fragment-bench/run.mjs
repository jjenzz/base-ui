// Usage: node run.mjs <variant> [rounds] [warmup]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [variant, roundsArg = '30', warmupArg = '5'] = process.argv.slice(2);
const ROUNDS = Number(roundsArg);
const WARMUP = Number(warmupArg);
const COUNTS = (process.env.COUNTS ?? '1000,3000,10000').split(',').map(Number);
const RATES = (process.env.RATES ?? '1,4').split(',').map(Number);
const STEPS = (process.env.STEPS ?? 'mount,focus,arrowDown,end,home,typeahead,selectAll,scroll,scrollThenType,scrollThenSelectAll,typeaheadPaced,scrollThenTypePaced,rebuild,append,prepend,unmount').split(',');
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), `dist-${variant}`);

const server = http.createServer((req, res) => {
  const file = path.join(dir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, resolve));
const url = `http://localhost:${server.address().port}/`;

// Set CHROME_PATH to use a Chrome build other than Playwright's own.
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--js-flags=--expose-gc', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const results = {};
for (const rate of RATES) {
  for (const count of COUNTS) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const cdp = await page.context().newCDPSession(page);
    await page.goto(url);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await cdp.send('Performance.enable');
    const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value * 1000;
    const samples = Object.fromEntries([...STEPS, 'total', 'background'].map((s) => [s, []]));
    // Waits until the page has had no task time for 100 ms, and returns the task time it took.
    const idle = async () => {
      const start = await task();
      let last = start;
      for (let i = 0; i < 40; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const now = await task();
        if (now - last < 1) break;
        last = now;
      }
      return (await task()) - start;
    };
    await page.evaluate(([c, labels]) => window.bench.setCount(c, labels), [count, process.env.LABELS]);
    for (let round = 0; round < WARMUP + ROUNDS; round += 1) {
      await page.evaluate(() => { window.gc?.(); return window.bench.settle(); });
      let total = 0;
      let background = 0;
      for (const step of STEPS) {
        await page.evaluate((s) => window.bench.prepare(s), step);
        await idle();
        const before = await task();
        const extra = await page.evaluate((s) => window.bench.run(s), step);
        const after = await task();
        if (extra && round >= WARMUP) {
          for (const [name, value] of Object.entries(extra)) {
            (samples[`${step}.${name}`] ??= []).push(value);
          }
        }
        const quiet = await idle();
        total += after - before;
        background += quiet;
        if (round >= WARMUP) samples[step].push(after - before);
      }
      if (round >= WARMUP) {
        samples.total.push(total);
        samples.background.push(background);
      }
    }
    if (errors.length) { console.error(`ERRORS ${variant} ${count}@${rate}x:`, errors.slice(0, 3)); }
    const key = `${count}@${rate}x`;
    results[key] = Object.fromEntries(Object.entries(samples).map(([s, v]) => {
      const sorted = [...v].sort((a, b) => a - b);
      return [s, { median: +quantile(sorted, 0.5).toFixed(1), p95: +quantile(sorted, 0.95).toFixed(1) }];
    }));
    console.log(key, JSON.stringify(Object.fromEntries(Object.entries(results[key]).map(([s, r]) => [s, `${r.median}/${r.p95}`]))));
    await page.close();
  }
}
fs.writeFileSync(path.join(path.dirname(dir), `results-${variant}.json`), JSON.stringify(results, null, 2));
await browser.close();
server.close();
