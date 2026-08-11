/**
 * Prerenders the archive pages from archive-app/archive.json into dist/:
 *   dist/index.html          — by year
 *   dist/series/index.html   — by series
 * and copies the design-system stylesheet to dist/style.css.
 *
 * The client filter island (dist/filter.js) is built first by Vite;
 * `npm run build` in this workspace runs both steps.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { Archive } from './types.ts';
import { buildModel } from './model.ts';
import { SeriesPage, YearPage } from './pages.tsx';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '../..');
const distDir = resolve(here, '../dist');

const jsonPath = resolve(here, '../archive.json');
if (!existsSync(jsonPath)) {
  console.error('[archive-app] archive-app/archive.json not found — run `npm run archive` first.');
  process.exit(1);
}
let archive: Archive;
try {
  archive = JSON.parse(readFileSync(jsonPath, 'utf8')) as Archive;
} catch (err) {
  console.error(`[archive-app] archive-app/archive.json is not valid JSON: ${err}`);
  process.exit(1);
}
const model = buildModel(archive);

mkdirSync(distDir, { recursive: true });
copyFileSync(resolve(here, 'style.css'), resolve(distDir, 'style.css'));

// style.css / filter.js ship unhashed at stable URLs; a content stamp on the
// query string keeps long-TTL static hosts from serving stale assets. runner.js
// is pulled in by filter.js rather than by a stamped tag of its own, so it
// feeds the same hash — otherwise a runner-only change would leave a cached
// filter.js, and with it a cached import, in place.
const chunkPaths = ['filter.js', 'runner.js'].map((f) => resolve(distDir, f));
const stamp =
  '?v=' +
  createHash('sha1')
    .update(readFileSync(resolve(distDir, 'style.css')))
    .update(chunkPaths.map((p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')).join(''))
    .digest('hex')
    .slice(0, 8);

const page = (element: ReactElement) =>
  '<!doctype html>\n' + renderToStaticMarkup(element) + '\n';

writeFileSync(
  resolve(distDir, 'index.html'),
  page(<YearPage model={model} projectRoot={projectRoot} stamp={stamp} />),
);

mkdirSync(resolve(distDir, 'series'), { recursive: true });
writeFileSync(
  resolve(distDir, 'series/index.html'),
  page(<SeriesPage model={model} projectRoot={projectRoot} stamp={stamp} />),
);

console.log(
  `[archive-app] prerendered ${model.total} sketches → index.html (${model.years.length} years), ` +
    `series/index.html (${model.series.length} series + ${model.oneOffs.length} one-offs)`,
);
