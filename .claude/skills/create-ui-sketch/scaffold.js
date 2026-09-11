#!/usr/bin/env node
// Scaffolds a new ssam sketch that uses the canvas-UI shell (src/ui/shell.ts).
//
// Usage:
//   node scaffold.js <name> <dir_or_dot>
//     [--params "label:min:max:value[:step][:#color],..."]
//     [--modes "dot,ring,line"]
//     [--grid cols[:subdivisions]]
//     [--dimensions WxH]
//     [--no-loupe]
//
// Defaults: params "weight:1:100:24", no modes, grid 4:6, 1080x1080, loupe on.
// Prints the created path and the run command. Refuses to overwrite.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const fail = (msg) => {
  console.error(`create-ui-sketch: ${msg}`);
  console.error('Usage: scaffold.js <name> <dir_or_dot> [--params "..."] [--modes "..."] [--grid cols[:subs]] [--dimensions WxH] [--no-loupe]');
  process.exit(1);
};

const positional = [];
const flags = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    if (key === 'no-loupe') flags.noLoupe = true;
    else {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) fail(`--${key} needs a value`);
      flags[key] = v;
      i++;
    }
  } else positional.push(a);
}

const [name, dir] = positional;
if (!name || !dir) fail('name and directory are required');
if (!/^[a-z0-9][a-z0-9-_]*$/i.test(name)) fail(`invalid sketch name "${name}"`);

// --- params: label:min:max:value[:step][:#color]
const toId = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const parseParams = (spec) =>
  spec.split(',').filter(Boolean).map((entry) => {
    const parts = entry.split(':').map((s) => s.trim());
    if (parts.length < 4) fail(`param "${entry}" must be label:min:max:value[:step][:#color]`);
    const [label, min, max, value, ...rest] = parts;
    const nums = [min, max, value].map(Number);
    if (nums.some((n) => Number.isNaN(n))) fail(`param "${entry}" has a non-numeric min/max/value`);
    let step, color;
    for (const r of rest) {
      if (r.startsWith('#')) color = r;
      else if (r !== '') {
        step = Number(r);
        if (Number.isNaN(step)) fail(`param "${entry}" has a non-numeric step`);
      }
    }
    return { id: toId(label), label, min: nums[0], max: nums[1], value: nums[2], step, color };
  });
const params = parseParams(flags.params ?? 'weight:1:100:24');
const paramsSrc =
  '[\n' +
  params
    .map((p) => {
      const fields = [`id: '${p.id}'`, `label: '${p.label.replace(/'/g, "\\'")}'`, `min: ${p.min}`, `max: ${p.max}`, `value: ${p.value}`];
      if (p.step !== undefined) fields.push(`step: ${p.step}`);
      if (p.color) fields.push(`knobColor: '${p.color}'`);
      return `      { ${fields.join(', ')} },`;
    })
    .join('\n') +
  '\n    ]';

// --- modes: comma list of built-in icon names
const validIcons = ['dot', 'ring', 'line', 'zoom'];
const modes = (flags.modes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
for (const m of modes) if (!validIcons.includes(m)) fail(`unknown mode icon "${m}" (use ${validIcons.join(', ')})`);
const modesSrc = modes.length ? `[${modes.map((m) => `{ id: '${m}', icon: '${m}' }`).join(', ')}]` : '[]';

// --- grid, dimensions, loupe
const [cols = '4', subs = '6'] = (flags.grid ?? '4:6').split(':');
if (!Number(cols) || !Number(subs)) fail(`--grid must be cols[:subdivisions], got "${flags.grid}"`);
const [w = '1080', h = '1080'] = (flags.dimensions ?? '1080x1080').toLowerCase().split('x');
if (!Number(w) || !Number(h)) fail(`--dimensions must be WxH, got "${flags.dimensions}"`);
const loupeSrc = flags.noLoupe ? 'false' : '{}';

// --- write
const destDir = dir === '.' ? 'src/sketches' : `src/sketches/${dir}`;
const dest = join(destDir, `${name}.ts`);
if (existsSync(dest)) fail(`${dest} already exists`);
mkdirSync(destDir, { recursive: true });

const uiImport = relative(destDir, 'src/ui').split('\\').join('/') || './ui';
const firstParam = params[0]?.id ?? null;
const sizeExpr = firstParam
  ? `Math.max(0.05, (view.params.${firstParam} - ${params[0].min}) / (${params[0].max} - ${params[0].min}) * 1.6 + 0.4) // driven by the first param`
  : '1.4';

const out = readFileSync(join(here, 'template.ts'), 'utf8')
  .replace('__UI_IMPORT__', uiImport.startsWith('.') ? uiImport : `./${uiImport}`)
  .replace('__COLS__', cols)
  .replace('__SUBDIVISIONS__', subs)
  .replace('__MODES__', modesSrc)
  .replace('__PARAMS__', paramsSrc)
  .replace('__LOUPE__', loupeSrc)
  .replace('__SIZE_EXPR__', sizeExpr)
  .replace('__WIDTH__', w)
  .replace('__HEIGHT__', h);

writeFileSync(dest, out);
console.log(dest);
console.log(`VITE_SKETCH="${dest.replace(/^src\//, '').replace(/\.ts$/, '')}" npm run dev`);
