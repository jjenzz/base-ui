# Listbox fragment prototype benchmark

Compares the document-fragment prototype on this branch (`prototype`) with the `items`-based Listbox it was measured against (`baseline`, commit `95114a3a5`), in production builds in headless Chromium.

Each round runs every step in a fresh list and records main-thread task time, as median and p95 across rounds. Some steps also record extra numbers, such as the slowest keystroke while typing or the time until `onValueChange` after Ctrl+A.

## Running it

1. Check out the baseline in a separate worktree and install it:

   ```sh
   git worktree add --detach ../base-ui-listbox-bench-pr 95114a3a5
   (cd ../base-ui-listbox-bench-pr && pnpm i)
   ```

2. Build both variants from this folder:

   ```sh
   VITE=../performance/node_modules/.bin/vite
   WT=$(git rev-parse --show-toplevel) VARIANT=prototype $VITE build --config vite.config.mjs
   WT=$(git rev-parse --show-toplevel)/../base-ui-listbox-bench-pr VARIANT=baseline $VITE build --config vite.config.mjs
   ```

3. Run them. Arguments are the variant, the number of measured rounds and the number of warm-up rounds:

   ```sh
   COUNTS=10000 RATES=1,4 node run.mjs baseline 15 2
   COUNTS=10000 RATES=1,4 node run.mjs prototype 15 2
   ```

   Results are written to `results-<variant>.json`.

## Options

- `COUNTS`: list sizes, comma-separated. Default `1000,3000,10000`.
- `RATES`: CPU throttling rates, comma-separated. Default `1,4`.
- `STEPS`: the steps to run, comma-separated. Defaults to every step in `src/main.tsx`.
- `LABELS=colours`: labels the items with the colours of the rainbow, each numbered from `00001`, instead of `Item 00001` onwards. Typeahead then jumps between colours rather than through one long run of `Item`.
- `CHROME_PATH`: a Chrome build to use instead of Playwright's own.
