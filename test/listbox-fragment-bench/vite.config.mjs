import path from 'node:path';
const wt = process.env.WT;
const pr = path.join(wt, 'packages/react');
export default {
  root: path.dirname(new URL(import.meta.url).pathname),
  mode: 'production',
  define: { 'process.env.NODE_ENV': '"production"' },
  resolve: {
    alias: [
      { find: /^@base-ui\/react\/(.*)$/, replacement: `${pr}/src/$1/index.ts` },
      { find: /^react$/, replacement: `${pr}/node_modules/react/index.js` },
      { find: /^react\/jsx-runtime$/, replacement: `${pr}/node_modules/react/jsx-runtime.js` },
      { find: /^react-dom$/, replacement: `${pr}/node_modules/react-dom/index.js` },
      { find: /^react-dom\/client$/, replacement: `${pr}/node_modules/react-dom/client.js` },
      { find: /^@tanstack\/react-virtual$/, replacement: `${pr}/node_modules/@tanstack/react-virtual` },
      { find: './variant', replacement: path.join(path.dirname(new URL(import.meta.url).pathname), 'src', process.env.VARIANT + '.tsx') },
    ],
  },
  build: { outDir: `dist-${process.env.VARIANT}`, emptyOutDir: true, minify: true },
};
