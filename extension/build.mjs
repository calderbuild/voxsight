import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = resolve(__dirname, 'dist');

// Clean and create dist
mkdirSync(dist, { recursive: true });

// Bundle background service worker
await build({
  entryPoints: [resolve(__dirname, 'src/background/index.ts')],
  bundle: true,
  outfile: resolve(dist, 'background.js'),
  format: 'esm',
  target: 'chrome114',
  minify: false,
});

// Bundle content script
await build({
  entryPoints: [resolve(__dirname, 'src/content/index.ts')],
  bundle: true,
  outfile: resolve(dist, 'content.js'),
  format: 'iife',
  target: 'chrome114',
  minify: false,
});

// Bundle side panel script
await build({
  entryPoints: [resolve(__dirname, 'src/sidepanel/main.ts')],
  bundle: true,
  outfile: resolve(dist, 'sidepanel/main.js'),
  format: 'esm',
  target: 'chrome114',
  minify: false,
});

// Copy static files
cpSync(resolve(__dirname, 'src/sidepanel/styles'), resolve(dist, 'sidepanel/styles'), { recursive: true });
cpSync(resolve(__dirname, 'src/content/highlight.css'), resolve(dist, 'content.css'));
cpSync(resolve(__dirname, 'assets'), resolve(dist, 'assets'), { recursive: true });

// Write side panel HTML with correct JS path
const html = readFileSync(resolve(__dirname, 'src/sidepanel/index.html'), 'utf-8')
  .replace('main.ts', 'main.js');
writeFileSync(resolve(dist, 'sidepanel/index.html'), html);

// Write manifest with correct paths
const manifest = JSON.parse(readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8'));
manifest.side_panel.default_path = 'sidepanel/index.html';
manifest.background.service_worker = 'background.js';
manifest.content_scripts[0].js = ['content.js'];
manifest.content_scripts[0].css = ['content.css'];
writeFileSync(resolve(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log('Build complete: extension/dist/');
