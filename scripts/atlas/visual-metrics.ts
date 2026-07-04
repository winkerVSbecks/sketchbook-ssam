/**
 * Compute per-sketch color metrics from the archived Cloudinary renders.
 * Self-contained: downloads 512px thumbs into a cache dir on first run.
 *
 * Usage:
 *   npx tsx scripts/atlas/visual-metrics.ts \
 *     [--cache /tmp/atlas-thumbs] [--out scripts/atlas/data/visual-metrics.json]
 *
 * Metrics per sketch (all from a 48×48 downsample):
 *   bg (border-median hex), bgL, meanL, meanC (OKLCH), ink (fraction of
 *   pixels far from bg), hue (dominant OKLCH hue deg or null), hueShare,
 *   colors (top quantized foreground colors).
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const require = createRequire(join(repoRoot, 'archive-app/package.json'));
const sharp = require('sharp');
const rootRequire = createRequire(join(repoRoot, 'package.json'));
const culori = rootRequire('culori');

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const cacheDir = arg('cache', '/tmp/atlas-thumbs');
const outPath = arg('out', join(repoRoot, 'scripts/atlas/data/visual-metrics.json'));

mkdirSync(cacheDir, { recursive: true });

const archive = JSON.parse(
  readFileSync(join(repoRoot, 'archive-app/archive.json'), 'utf8'),
) as { sketches: { id: string; cloudinary: { url: string } }[] };

const slugOf = (id: string) => id.replace('sketches/', '').split('/').join('__');

const toOklch = culori.converter('oklch');
const SIZE = 48;

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

async function thumbPath(id: string, url: string): Promise<string> {
  const p = join(cacheDir, `${slugOf(id)}.jpg`);
  if (!existsSync(p)) {
    const small = url.replace('/upload/', '/upload/w_512,q_80,f_jpg/');
    const res = await fetch(small);
    if (!res.ok) throw new Error(`fetch ${small}: ${res.status}`);
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  return p;
}

async function metrics(path: string) {
  const { data, info } = await sharp(path)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px: [number, number, number][] = [];
  for (let i = 0; i < info.width * info.height; i++) {
    px.push([data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]);
  }
  const border: [number, number, number][] = [];
  for (let x = 0; x < SIZE; x++) {
    for (const y of [0, 1, SIZE - 2, SIZE - 1]) {
      border.push(px[y * SIZE + x]!);
      border.push(px[x * SIZE + y]!);
    }
  }
  const med = (i: number) =>
    border.map((p) => p[i]).sort((a, b) => a - b)[Math.floor(border.length / 2)]!;
  const bg: [number, number, number] = [med(0), med(1), med(2)];
  const bgOk = toOklch({ mode: 'rgb', r: bg[0] / 255, g: bg[1] / 255, b: bg[2] / 255 });

  let ink = 0;
  let sumL = 0;
  let sumC = 0;
  const hueBins = new Array(12).fill(0) as number[];
  const counts = new Map<string, number>();
  for (const [r, g, b] of px) {
    const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
    if (d > 48) ink++;
    const ok = toOklch({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255 });
    sumL += ok.l;
    const c = ok.c ?? 0;
    sumC += c;
    if (c > 0.04 && ok.h !== undefined && !Number.isNaN(ok.h)) {
      hueBins[Math.floor((((ok.h % 360) + 360) % 360) / 30)] += c;
    }
    if (d > 48) {
      const q = hex((r >> 4) << 4, (g >> 4) << 4, (b >> 4) << 4);
      counts.set(q, (counts.get(q) ?? 0) + 1);
    }
  }
  const n = px.length;
  const totalHue = hueBins.reduce((a, b) => a + b, 0);
  let domHue: number | null = null;
  let hueShare = 0;
  if (totalHue > 0.5) {
    const maxBin = hueBins.indexOf(Math.max(...hueBins));
    domHue = maxBin * 30 + 15;
    hueShare = Math.max(...hueBins) / totalHue;
  }
  const domColors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);
  return {
    bg: hex(...bg),
    bgL: +(bgOk.l ?? 0).toFixed(3),
    meanL: +(sumL / n).toFixed(3),
    meanC: +(sumC / n).toFixed(4),
    ink: +(ink / n).toFixed(3),
    hue: domHue,
    hueShare: +hueShare.toFixed(3),
    colors: domColors,
  };
}

const out: Record<string, unknown> = {};
let done = 0;
for (const s of archive.sketches) {
  try {
    out[s.id] = await metrics(await thumbPath(s.id, s.cloudinary.url));
  } catch (e) {
    console.error('FAIL', s.id, (e as Error).message);
    out[s.id] = null;
  }
  if (++done % 50 === 0) console.log(done, '/', archive.sketches.length);
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`wrote ${outPath} for ${done} sketches`);
