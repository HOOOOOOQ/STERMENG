import { build } from 'esbuild';
import { mkdir, copyFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = `${root}public`;
await mkdir(target, { recursive: true });
await build({
  entryPoints: [`${root}frontend/app.js`, `${root}frontend/styles.css`],
  outdir: target, bundle: true, minify: true, target: ['es2022'], legalComments: 'eof',
  loader: { '.woff2': 'file' },
});
await copyFile(`${root}frontend/index.html`, `${target}/index.html`);
await cp(`${root}frontend/public`, target, { recursive: true });
console.log('666 Streaming: production assets built (no CDN required).');

await mkdir(`${target}/licenses`, { recursive: true });
for (const [from, to] of [
  ['hls.js', 'hls.js-LICENSE.txt'],
  ['@fontsource-variable/manrope', 'Manrope-OFL.txt'],
  ['@fontsource/barlow-condensed', 'Barlow-Condensed-OFL.txt'],
]) await copyFile(`${root}node_modules/${from}/LICENSE`, `${target}/licenses/${to}`);
