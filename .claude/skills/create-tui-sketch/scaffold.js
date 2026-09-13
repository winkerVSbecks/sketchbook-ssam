#!/usr/bin/env node
// Scaffolds a new ssam sketch on the terminal desktop (src/tui/desktop.ts).
//
// Usage:
//   node scaffold.js <name> <dir_or_dot>
//     [--controls "range:label:min:max:value[:step],toggle:label[:on],button:label,..."]
//     [--windows "title:row:col:rows:cols,..."]
//     [--bar bottom|top]
//     [--dimensions WxH]
//     [--font size:lineH]
//
// Defaults: controls "range:level:0:1:0.5:0.05,toggle:grid:on", windows
// "main:2:2:14:40", bar bottom, 1080x1080, font 14:20.
// Prints the created path and the run command. Refuses to overwrite.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const fail = (msg) => {
  console.error(`create-tui-sketch: ${msg}`);
  console.error(
    'Usage: scaffold.js <name> <dir_or_dot> [--controls "..."] [--windows "..."] [--bar bottom|top] [--dimensions WxH] [--font size:lineH]',
  );
  process.exit(1);
};

const positional = [];
const flags = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) fail(`--${key} needs a value`);
    flags[key] = v;
    i++;
  } else positional.push(a);
}

const [name, dir] = positional;
if (!name || !dir) fail('name and directory are required');
if (!/^[a-z0-9][a-z0-9-_]*$/i.test(name)) fail(`invalid sketch name "${name}"`);

const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const toId = (label) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const num = (s, what) => {
  const n = Number(s);
  if (s === '' || Number.isNaN(n)) fail(`${what} is not a number: "${s}"`);
  return n;
};

// --- controls: range:label:min:max:value[:step] | toggle:label[:on|off] | button:label
const parseControls = (spec) =>
  spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(':').map((s) => s.trim());
      const [kind, label] = parts;
      if (!label) fail(`control "${entry}" needs a label`);
      const id = toId(label);
      if (!id) fail(`control "${entry}" has a label with no letters or digits`);
      if (kind === 'range') {
        if (parts.length < 5 || parts.length > 6) fail(`range "${entry}" must be range:label:min:max:value[:step]`);
        const [, , min, max, value, step] = parts;
        const r = { kind, id, label, min: num(min, 'min'), max: num(max, 'max'), value: num(value, 'value') };
        if (step !== undefined) r.step = num(step, 'step');
        if (r.max <= r.min) fail(`range "${entry}" needs max > min`);
        return r;
      }
      if (kind === 'toggle') {
        if (parts.length > 3) fail(`toggle "${entry}" must be toggle:label[:on|off]`);
        const flag = parts[2] ?? 'off';
        if (flag !== 'on' && flag !== 'off') fail(`toggle "${entry}" flag must be on or off`);
        return { kind, id, label, on: flag === 'on' };
      }
      if (kind === 'button') {
        if (parts.length !== 2) fail(`button "${entry}" must be button:label`);
        return { kind, id, label };
      }
      return fail(`unknown control kind "${kind}" in "${entry}" (use range, toggle, button)`);
    });
const controls = parseControls(flags.controls ?? 'range:level:0:1:0.5:0.05,toggle:grid:on');
{
  const seen = new Set();
  for (const c of controls) {
    if (seen.has(c.id)) fail(`duplicate control id "${c.id}"`);
    seen.add(c.id);
  }
}

// state object: one field per range/toggle
const stateFields = controls
  .filter((c) => c.kind !== 'button')
  .map((c) => `    ${c.id}: ${c.kind === 'range' ? c.value : c.on},`);
const stateSrc = stateFields.length ? `{\n${stateFields.join('\n')}\n  }` : '{}';

// controls array: consecutive toggles share one checkbox group
const controlEntries = [];
for (let i = 0; i < controls.length; i++) {
  const c = controls[i];
  if (c.kind === 'range') {
    const fields = [`id: ${quote(c.id)}`, `label: ${quote(c.label)}`, `min: ${c.min}`, `max: ${c.max}`, `value: ${c.value}`];
    if (c.step !== undefined) fields.push(`step: ${c.step}`);
    controlEntries.push(
      `    createRange({\n      ${fields.join(',\n      ')},\n      inline: true,\n      onChange: (v) => {\n        state.${c.id} = v;\n      },\n    }),`,
    );
  } else if (c.kind === 'toggle') {
    const group = [c];
    while (controls[i + 1]?.kind === 'toggle') group.push(controls[++i]);
    const items = group.map((t) => `{ id: ${quote(t.id)}, label: ${quote(t.label)} }`).join(', ');
    const active = group.filter((t) => t.on).map((t) => quote(t.id));
    const assigns = group.map((t) => `        state.${t.id} = active.includes(${quote(t.id)});`).join('\n');
    controlEntries.push(
      `    createToggleGroup({\n      items: [${items}],\n      active: [${active.join(', ')}],\n      onChange: (active) => {\n${assigns}\n      },\n    }),`,
    );
  } else {
    controlEntries.push(
      `    createButton({\n      id: ${quote(c.id)},\n      label: ${quote(c.label)},\n      onPress: () => {\n        // ${c.label}: replace me\n      },\n    }),`,
    );
  }
}
const controlsSrc = controlEntries.length ? `[\n${controlEntries.join('\n')}\n  ]` : '[]';

// --- windows: title:row:col:rows:cols
const parseWindows = (spec) =>
  spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(':').map((s) => s.trim());
      if (parts.length !== 5) fail(`window "${entry}" must be title:row:col:rows:cols`);
      const [title, ...geom] = parts;
      if (!title) fail(`window "${entry}" needs a title`);
      const [row, col, rows, cols] = geom.map((g, i) => num(g, ['row', 'col', 'rows', 'cols'][i]));
      if (![row, col, rows, cols].every(Number.isInteger)) fail(`window "${entry}" geometry must be whole cells`);
      if (row < 0 || col < 0) fail(`window "${entry}" row/col must be ≥ 0`);
      if (rows < 3 || cols < 8) fail(`window "${entry}" needs rows ≥ 3 and cols ≥ 8`);
      return { title, row, col, rows, cols };
    });
const windows = parseWindows(flags.windows ?? 'main:2:2:14:40');
{
  const seen = new Set();
  for (const w of windows) {
    if (seen.has(w.title)) fail(`duplicate window title "${w.title}"`);
    seen.add(w.title);
  }
}
const windowsSrc = windows.length
  ? '[\n' + windows.map((w) => `  { title: ${quote(w.title)}, rect: cellRect(${w.row}, ${w.col}, ${w.rows}, ${w.cols}) },`).join('\n') + '\n]'
  : '[]';
const casesSrc = windows.length
  ? windows.map((w) => `      case ${quote(w.title)}:\n        placeholder(buf, inner, win);\n        break;`).join('\n')
  : '      // case \'title\': … break;';

// --- bar, dimensions, font
const bar = flags.bar ?? 'bottom';
if (bar !== 'bottom' && bar !== 'top') fail(`--bar must be bottom or top, got "${bar}"`);
const [w = '1080', h = '1080'] = (flags.dimensions ?? '1080x1080').toLowerCase().split('x');
if (!Number(w) || !Number(h)) fail(`--dimensions must be WxH, got "${flags.dimensions}"`);
const [fontSize = '14', lineH = '20'] = (flags.font ?? '14:20').split(':');
if (!Number(fontSize) || !Number(lineH)) fail(`--font must be size:lineH, got "${flags.font}"`);

// --- write
const destDir = dir === '.' ? 'src/sketches' : `src/sketches/${dir}`;
const dest = join(destDir, `${name}.ts`);
if (existsSync(dest)) fail(`${dest} already exists`);
mkdirSync(destDir, { recursive: true });

const importPath = (target) => {
  const p = relative(destDir, target).split('\\').join('/');
  return p.startsWith('.') ? p : `./${p}`;
};
const firstRange = controls.find((c) => c.kind === 'range');
const levelExpr = firstRange
  ? `(state.${firstRange.id} - ${firstRange.min}) / (${firstRange.max} - ${firstRange.min}) // driven by the first range`
  : '0.5';

const out = readFileSync(join(here, 'template.ts'), 'utf8')
  .replace('__COLORS_IMPORT__', importPath('src/colors'))
  .replace('__TUI_IMPORT__', importPath('src/tui'))
  .replace('__WINDOWS__', windowsSrc)
  .replace('__STATE__', stateSrc)
  .replace('__CONTROLS__', controlsSrc)
  .replace('__CASES__', casesSrc)
  .replace('__LEVEL_EXPR__', levelExpr)
  .replace('__FONT_SIZE__', fontSize)
  .replace('__FONT_LINE_H__', lineH)
  .replace('__BAR__', bar)
  .replace('__NAME__', name.replace(/'/g, "\\'"))
  .replace('__WIDTH__', w)
  .replace('__HEIGHT__', h);

writeFileSync(dest, out);
console.log(dest);
console.log(`VITE_SKETCH="${dest.replace(/^src\//, '').replace(/\.ts$/, '')}" npm run dev`);
