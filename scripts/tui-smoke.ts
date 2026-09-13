/**
 * Node smoke test for the pure parts of `src/tui`.
 * Run: `npx tsx scripts/tui-smoke.ts` — exits non-zero on the first failure.
 * Wave-2 tasks append their own sections below.
 */
import assert from 'node:assert/strict';

import Random from 'canvas-sketch-util/random';

import { randomPalette } from '../src/colors';
import {
  createGlyphBuffer,
  createMetrics,
  centredBaseline,
  themeFromPalette,
  contrastRatio,
  MIN_CONTRAST,
  AA_CONTRAST,
  composite,
  legibleOn,
  parseColor,
  fallbackTheme,
  withAlpha,
  cellRect,
  intersectCellRect,
  insetCellRect,
  createDesktop,
  createButton,
  createRange,
  createToggleGroup,
  settingsRect,
} from '../src/tui';
import type { BlitContext, DesktopContext } from '../src/tui';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

/** Render a buffer to text: one line per row, '.' for empty cells. */
function dump(buf: ReturnType<typeof createGlyphBuffer>): string[] {
  return buf.cells.map((line) => line.map((g) => g?.ch ?? '.').join(''));
}

console.log('grid');

test('5×10 round box', () => {
  const buf = createGlyphBuffer(5, 10);
  buf.box(cellRect(0, 0, 5, 10), 'round', '#fff');
  assert.deepEqual(dump(buf), [
    '╭────────╮',
    '│........│',
    '│........│',
    '│........│',
    '╰────────╯',
  ]);
});

test('double / heavy / single corners + degenerate boxes', () => {
  const buf = createGlyphBuffer(3, 3);
  buf.box(cellRect(0, 0, 3, 3), 'double', '#fff');
  assert.deepEqual(dump(buf), ['╔═╗', '║.║', '╚═╝']);
  buf.clear();
  buf.box(cellRect(0, 0, 3, 3), 'heavy', '#fff');
  assert.deepEqual(dump(buf), ['┏━┓', '┃.┃', '┗━┛']);
  buf.clear();
  buf.box(cellRect(1, 0, 1, 3), 'single', '#fff');
  buf.box(cellRect(0, 2, 3, 1), 'single', '#fff');
  assert.deepEqual(dump(buf), ['..│', '──│', '..│']);
});

test('text truncates at maxLen and at the buffer edge', () => {
  const buf = createGlyphBuffer(1, 10);
  assert.equal(buf.text(0, 0, 'hello world', '#fff', undefined, 5), 5);
  assert.deepEqual(dump(buf), ['hello.....']);
  buf.clear();
  assert.equal(buf.text(0, 7, 'hello', '#fff'), 3);
  assert.deepEqual(dump(buf), ['.......hel']);
  buf.clear();
  assert.equal(buf.text(0, -2, 'hello', '#fff'), 3);
  assert.deepEqual(dump(buf), ['llo.......']);
});

test('text is code-point based (box glyphs are one cell each)', () => {
  const buf = createGlyphBuffer(1, 4);
  assert.equal(buf.text(0, 0, '░▒▓█', '#fff'), 4);
  assert.deepEqual(dump(buf), ['░▒▓█']);
});

test('clipped text truncates at the clip edge', () => {
  const buf = createGlyphBuffer(3, 10);
  buf.clip(cellRect(1, 2, 1, 4), () => {
    assert.equal(buf.text(1, 0, 'abcdefghij', '#fff'), 4);
    assert.equal(buf.text(0, 2, 'zzz', '#fff'), 0);
    buf.put(2, 3, 'z', '#fff');
  });
  assert.deepEqual(dump(buf), ['..........', '..cdef....', '..........']);
  assert.deepEqual(buf.clipRect(), cellRect(0, 0, 3, 10));
});

test('nested clips intersect and unwind', () => {
  const buf = createGlyphBuffer(4, 8);
  buf.clip(cellRect(0, 0, 3, 5), () => {
    buf.clip(cellRect(1, 2, 5, 5), () => {
      assert.deepEqual(buf.clipRect(), cellRect(1, 2, 2, 3));
      buf.fill(cellRect(0, 0, 4, 8), '#', '#fff');
    });
    assert.deepEqual(buf.clipRect(), cellRect(0, 0, 3, 5));
    buf.put(0, 0, 'a', '#fff');
    buf.put(3, 0, 'x', '#fff');
  });
  assert.deepEqual(dump(buf), ['a.......', '..###...', '..###...', '........']);
});

test('fill / hline / vline / put store fg+bg, get is bounds-safe', () => {
  const buf = createGlyphBuffer(3, 3);
  buf.fill(cellRect(0, 0, 3, 3), ' ', '#fff', '#000');
  buf.hline(1, 0, 3, '#f00');
  buf.vline(0, 1, 3, '#0f0', '#111', '┃');
  buf.put(5, 5, 'x', '#fff');
  assert.deepEqual(buf.get(1, 0), { ch: '─', fg: '#f00' });
  assert.deepEqual(buf.get(0, 1), { ch: '┃', fg: '#0f0', bg: '#111' });
  assert.deepEqual(buf.get(2, 2), { ch: ' ', fg: '#fff', bg: '#000' });
  assert.equal(buf.get(5, 5), null);
  assert.equal(buf.get(-1, 0), null);
});

test('clear(bg) fills spaces on bg; clear() empties', () => {
  const buf = createGlyphBuffer(2, 2);
  buf.clear('#123');
  assert.deepEqual(buf.get(1, 1), { ch: ' ', fg: '#123', bg: '#123' });
  buf.clear();
  assert.equal(buf.get(1, 1), null);
});

console.log('metrics');

test('toCell / toPx round-trip at charW 8.43, lineH 20', () => {
  const m = createMetrics(null, { charW: 8.43, lineH: 20 });
  assert.equal(m.font, `14px 'Menlo', 'Monaco', 'DejaVu Sans Mono', monospace`);
  // Cap height 0.72 × 14 = 10.08 centred in 20 → baseline at round(10 + 5.04) = 15.
  assert.equal(m.baselineOffset, 15);
  for (let row = 0; row < 60; row++) {
    for (let col = 0; col < 140; col++) {
      const px = m.toPx({ row, col });
      assert.deepEqual(m.toCell(px), { row, col }, `corner ${row},${col}`);
      assert.deepEqual(
        m.toCell({ x: px.x + 8.43 / 2, y: px.y + 10 }),
        { row, col },
        `center ${row},${col}`,
      );
      assert.deepEqual(
        m.toCell({ x: px.x + 8.43 - 1e-3, y: px.y + 20 - 1e-3 }),
        { row, col },
        `far corner ${row},${col}`,
      );
    }
  }
  assert.deepEqual(m.toCell({ x: 8.43, y: 20 }), { row: 1, col: 1 });
});

test('cols / rows floor the canvas size; cellRectToPx', () => {
  const m = createMetrics(null, { charW: 8.43, lineH: 20 });
  assert.equal(m.cols(1080), Math.floor(1080 / 8.43));
  assert.equal(m.rows(1080), 54);
  assert.equal(m.cols(8.43 * 128), 128);
  assert.deepEqual(m.cellRectToPx(cellRect(2, 3, 4, 5)), {
    x: 3 * 8.43,
    y: 40,
    w: 5 * 8.43,
    h: 80,
  });
});

test('createMetrics measures with the font set and restores it', () => {
  const calls: string[] = [];
  const ctx = {
    font: 'orig',
    measureText(s: string) {
      calls.push(`${this.font}|${s}`);
      return { width: 7.5 };
    },
  };
  const m = createMetrics(ctx, { fontSize: 12, lineH: 16, family: 'Mono' });
  assert.equal(m.charW, 7.5);
  assert.equal(m.font, '12px Mono');
  assert.deepEqual(calls, ['12px Mono|M']);
  assert.equal(ctx.font, 'orig');
  assert.throws(() => createMetrics(null));
});

test('createMetrics centres the measured cap height; explicit baselineOffset wins', () => {
  // Menlo 14 px in Chrome: M is 10.17 px above the alphabetic baseline, nothing below.
  const ctx = {
    font: '',
    textBaseline: 'top' as CanvasTextBaseline,
    seen: [] as CanvasTextBaseline[],
    measureText(this: { seen: CanvasTextBaseline[]; textBaseline: CanvasTextBaseline }) {
      this.seen.push(this.textBaseline);
      return { width: 8.43, actualBoundingBoxAscent: 10.172, actualBoundingBoxDescent: 0 };
    },
  };
  const m = createMetrics(ctx, { lineH: 20 });
  assert.equal(m.baselineOffset, 15, '(20 - 10.17) / 2 + 10.17 = 15.09 → 15');
  assert.deepEqual(ctx.seen, ['alphabetic'], 'measured relative to the alphabetic baseline');
  assert.equal(ctx.textBaseline, 'top', 'and restored');
  assert.equal(centredBaseline(16, 8.6, 0), 12);
  assert.equal(centredBaseline(20, 13.617, 4.225), 15, '│ in Menlo lands on the same baseline');
  assert.equal(createMetrics(ctx, { lineH: 20, baselineOffset: 2 }).baselineOffset, 2);
  assert.equal(createMetrics(null, { charW: 8, fontSize: 12, lineH: 16 }).baselineOffset, 12, 'heuristic: round(8 + 0.36 × 12)');
});

console.log('theme');

test('themeFromPalette maps palette[0] → bg deterministically', () => {
  const t = themeFromPalette(['#111', '#eee', '#f80', '#345']);
  assert.equal(t.bg, '#111');
  assert.equal(t.fg, '#eee');
  assert.equal(t.accent, '#f80');
  assert.equal(t.chromeBg, '#eee', '#345 is under 3:1 against #111 → chrome falls back to fg');
  assert.equal(t.chromeFg, '#111');
  assert.equal(t.dim, 'rgba(238, 238, 238, 0.45)');
  assert.equal(t.selectionBg, 'rgba(255, 136, 0, 0.3)');
  assert.equal(t.font, fallbackTheme.font);
  assert.deepEqual(themeFromPalette(['#111', '#eee', '#f80', '#345']), t);
});

test('themeFromPalette picks fg / chromeBg by contrast, accent by saturation', () => {
  // Pale palette from the verification report: positional fg (#FEEEEE) was invisible.
  const pale = themeFromPalette(['#FCFAFA', '#FEEEEE', '#F7D7D7', '#3A3A3A']);
  assert.equal(pale.bg, '#FCFAFA');
  assert.equal(pale.fg, '#3A3A3A', 'darkest entry is the ink');
  assert.ok(contrastRatio(pale.fg, pale.bg) >= MIN_CONTRAST);
  assert.equal(pale.accent, '#3A3A3A', 'the most saturated remaining entry (#F7D7D7) is illegible → accent uses the ink');
  const paleVivid = themeFromPalette(['#FCFAFA', '#FEEEEE', '#C0392B', '#3A3A3A']);
  assert.equal(paleVivid.fg, '#3A3A3A');
  assert.equal(paleVivid.accent, '#C0392B', 'a legible saturated entry is the accent');
  assert.equal(pale.chromeBg, '#3A3A3A', 'no remaining entry reaches 3:1 → chrome uses the ink');
  assert.equal(pale.chromeFg, '#FCFAFA');
  // Dark bg keeps a light ink; a legible mid-tone becomes the chrome.
  const dark = themeFromPalette(['#101010', '#ff3300', '#f0f0f0', '#9a9a9a']);
  assert.equal(dark.fg, '#f0f0f0');
  assert.equal(dark.accent, '#ff3300');
  assert.equal(dark.chromeBg, '#9a9a9a');
  // The most saturated entry is reserved for the accent even when it is the brightest.
  const vivid = themeFromPalette(['#202020', '#dddddd', '#00ff88']);
  assert.equal(vivid.fg, '#dddddd');
  assert.equal(vivid.accent, '#00ff88');
  // Palette order does not matter for the roles.
  assert.deepEqual(themeFromPalette(['#101010', '#9a9a9a', '#f0f0f0', '#ff3300']), dark);
  // Nothing legible: fall back to the fallback theme's paper (light bg) / ink (dark bg).
  assert.equal(themeFromPalette(['#ffffff', '#fefefe', '#f0f0f0']).fg, fallbackTheme.bg);
  assert.equal(themeFromPalette(['#000000', '#101010']).fg, fallbackTheme.fg);
  // auto-albers (oklab) and clrs (rgb()) palettes are read too: the pale entry becomes the ink.
  const ok = themeFromPalette(['oklab(0.44 -0.07 -0.08)', 'oklab(0.61 -0.06 -0.11)', 'oklab(0.78 -0.05 -0.14)', 'oklab(0.94 -0.04 -0.17)']);
  assert.equal(ok.fg, 'oklab(0.94 -0.04 -0.17)');
  assert.ok(contrastRatio(ok.fg, ok.bg) >= MIN_CONTRAST, `oklab contrast ${contrastRatio(ok.fg, ok.bg)}`);
  assert.match(ok.dim, /^rgba\(\d+, \d+, \d+, 0\.45\)$/, 'dim is derived from the parsed ink');
  const rgb = themeFromPalette(['rgb(247, 245, 238)', 'rgb(162, 168, 255)', 'rgb(34, 44, 50)']);
  assert.equal(rgb.fg, 'rgb(34, 44, 50)');
  assert.equal(rgb.accent, 'rgb(34, 44, 50)', 'lavender on near-white is ~1.9:1 → accent uses the ink');
  assert.deepEqual(parseColor('oklch(50% 0 0)')!.map((v) => Math.abs(v - 99) <= 1), [true, true, true], 'oklch L 50 % is the grey #636363');
  assert.deepEqual(parseColor('oklab(1 0 0)'), [255, 255, 255]);
  assert.deepEqual(parseColor('oklab(0 0 0)'), [0, 0, 0]);
  assert.equal(parseColor('rebeccapurple'), null);
  // Unreadable backgrounds keep the positional mapping.
  const raw = themeFromPalette(['hsl(0 0% 5%)', 'white', 'red']);
  assert.equal(raw.fg, 'white');
  assert.equal(raw.accent, 'red');
});

test('themeFromPalette falls back for short palettes', () => {
  const two = themeFromPalette(['#000000', '#ffffff']);
  assert.equal(two.accent, '#ffffff');
  assert.equal(two.chromeBg, '#ffffff');
  const one = themeFromPalette(['#202020']);
  assert.equal(one.fg, fallbackTheme.fg);
  assert.deepEqual(themeFromPalette([]), fallbackTheme);
  assert.equal(withAlpha('hsl(1 2% 3%)', 0.5), 'hsl(1 2% 3%)');
  assert.equal(withAlpha('#80ff00ff', 0.2), 'rgba(128, 255, 0, 0.2)');
});

console.log('blit');

test('blit paints merged bg runs then one fillText per glyph', () => {
  const buf = createGlyphBuffer(2, 4);
  buf.fill(cellRect(0, 0, 1, 3), ' ', '#fff', '#222');
  buf.put(0, 3, 'x', '#fff', '#333');
  buf.text(1, 0, 'ab', '#0f0');
  const m = createMetrics(null, { charW: 10, lineH: 20 });
  const rects: number[][] = [];
  const texts: [string, number, number, string][] = [];
  const ctx: BlitContext = {
    font: '',
    fillStyle: '',
    textBaseline: 'alphabetic',
    textAlign: 'start',
    fillRect: (x, y, w, h) => rects.push([x, y, w, h]),
    fillText(s, x, y) {
      texts.push([s, x, y, String(this.fillStyle)]);
    },
  };
  buf.blit(ctx, m, '#000');
  assert.deepEqual(rects, [
    [0, 0, 40, 40],
    [0, 0, 30, 20],
    [30, 0, 10, 20],
  ]);
  assert.deepEqual(texts, [
    ['x', 30, 15, '#fff'],
    ['a', 0, 35, '#0f0'],
    ['b', 10, 35, '#0f0'],
  ]);
  assert.equal(ctx.font, m.font);
  assert.equal(ctx.textBaseline, 'alphabetic');
  assert.equal(ctx.textAlign, 'left');
});

console.log('cells');

test('cell rect helpers', () => {
  assert.deepEqual(intersectCellRect(cellRect(0, 0, 5, 5), cellRect(3, 3, 5, 5)), cellRect(3, 3, 2, 2));
  assert.deepEqual(intersectCellRect(cellRect(0, 0, 2, 2), cellRect(5, 5, 2, 2)).rows, 0);
  assert.deepEqual(insetCellRect(cellRect(1, 1, 5, 7), 1), cellRect(2, 2, 3, 5));
  assert.deepEqual(insetCellRect(cellRect(0, 0, 1, 1), 1), cellRect(1, 1, 0, 0));
});

console.log('desktop');

/** Stub 2D context: measures 'M' as 8 px and records blit calls. */
function stubCtx(): DesktopContext & { rects: number; texts: number } {
  return {
    font: '',
    fillStyle: '',
    textBaseline: 'alphabetic',
    textAlign: 'start',
    rects: 0,
    texts: 0,
    measureText: () => ({ width: 8 }),
    fillRect() {
      this.rects++;
    },
    fillText() {
      this.texts++;
    },
  };
}

const D_CHAR = 8;
const D_LINE = 20;
/** Pixel point just inside a cell. */
const at = (row: number, col: number) => ({ x: col * D_CHAR + 1, y: row * D_LINE + 1 });
const rowText = (buf: ReturnType<typeof createGlyphBuffer>, row: number) =>
  buf.cells[row].map((g) => g?.ch ?? '.').join('');

function makeDesktop(over: Partial<Parameters<typeof createDesktop>[0]> = {}) {
  let changes = 0;
  const ctx = stubCtx();
  const desk = createDesktop({
    ctx,
    width: 80 * D_CHAR,
    height: 30 * D_LINE,
    onChange: () => changes++,
    settings: {
      controls: [
        createButton({ id: 'go', label: 'Go' }),
        createToggleGroup({ items: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }], exclusive: true }),
        createRange({ id: 'n', label: 'n', min: 0, max: 10, value: 5 }),
      ],
    },
    ...over,
  });
  const w1 = desk.addWindow({ title: 'chart 01', rect: cellRect(2, 2, 8, 24) });
  const w2 = desk.addWindow({ title: 'chart 02', rect: cellRect(4, 30, 8, 24) });
  const w3 = desk.addWindow({ title: 'chart 03', rect: cellRect(12, 10, 8, 24) });
  return { ctx, desk, w1, w2, w3, changes: () => changes };
}

test('grid from width/height; bar on the bottom row; area is everything above', () => {
  const { desk } = makeDesktop();
  assert.equal(desk.metrics.charW, 8);
  assert.equal(desk.buffer.rows, 30);
  assert.equal(desk.buffer.cols, 80);
  assert.equal(desk.menuBar.row, 29);
  assert.deepEqual(desk.area, cellRect(0, 0, 29, 80));
  assert.deepEqual(desk.windows[0].bounds, desk.area);
  const top = createDesktop({ ctx: stubCtx(), width: 80 * D_CHAR, height: 30 * D_LINE, menuBar: 'top', onChange() {} });
  assert.equal(top.menuBar.row, 0);
  assert.deepEqual(top.area, cellRect(1, 0, 29, 80));
});

test('addWindow ×3, minimize one: 2 visible, bar lists the minimized title, selecting it restores + fronts', () => {
  const { desk, w1, w2, w3 } = makeDesktop();
  assert.equal(desk.windows.length, 3);
  assert.deepEqual(desk.windows, [w1, w2, w3]);
  assert.equal(desk.settings?.visible, false);

  // Click [–] of chart 02: press + release over the button.
  const minimizeCol = w2.rect.col + w2.rect.cols - 1 - 9; // [–] is 9 cells left of the corner
  assert.equal(w2.buttonAt({ row: w2.rect.row, col: minimizeCol }), 'minimize');
  desk.pointerDown(at(w2.rect.row, minimizeCol));
  desk.pointerUp(at(w2.rect.row, minimizeCol));
  assert.equal(w2.minimized, true);
  assert.equal(w2.visible, false);
  assert.deepEqual(desk.ui.windows.filter((w) => w.visible).length, 2);

  desk.render();
  const bar = rowText(desk.buffer, 29);
  assert.ok(bar.startsWith(' ≡ settings │ chart 02 '), bar);

  const span = desk.menuBar.layout().spans.find((s) => s.label === 'chart 02')!;
  desk.pointerDown(at(29, span.labelCol));
  desk.pointerUp(at(29, span.labelCol));
  assert.equal(w2.minimized, false);
  assert.equal(w2.visible, true);
  assert.equal(desk.ui.windows[desk.ui.windows.length - 1], w2, 'restored window is in front');
  desk.render();
  assert.ok(!rowText(desk.buffer, 29).includes('chart 02'));
  assert.equal(w2.active, true);
  assert.equal(w3.active, false);
});

test('addWindow keeps a visible settings window in front; hidden settings → new windows on top', () => {
  const { desk, w3 } = makeDesktop();
  const s = desk.settings!;
  const a = desk.addWindow({ title: 'chart 04', rect: cellRect(1, 1, 6, 20) });
  assert.equal(desk.ui.windows[desk.ui.windows.length - 1], a, 'settings hidden: plain append');
  desk.toggleSettings();
  assert.equal(desk.ui.windows[desk.ui.windows.length - 1], s);
  const b = desk.addWindow({ title: 'chart 05', rect: cellRect(3, 3, 6, 20) });
  const c = desk.addWindow({ title: 'chart 06', rect: cellRect(5, 5, 6, 20) });
  const z = desk.ui.windows;
  assert.equal(z[z.length - 1], s, 'settings stays last');
  assert.equal(z[z.length - 2], c, 'newest window just below it');
  assert.equal(z[z.length - 3], b);
  assert.ok(z.indexOf(w3) < z.indexOf(b), 'older windows stay behind the new ones');
  assert.deepEqual(desk.windows.slice(-2), [b, c], 'desktop.windows excludes settings');
  desk.ui.bringToFront(c);
  assert.equal(z[z.length - 1], c, 'a user click still brings a chart over settings');
});

test('toggleSettings shows/hides; ≡ settings item toggles it too and reads active', () => {
  const { desk } = makeDesktop();
  const s = desk.settings!;
  assert.equal(s.visible, false);
  desk.toggleSettings();
  assert.equal(s.visible, true);
  assert.equal(desk.ui.windows[desk.ui.windows.length - 1], s);
  assert.equal(desk.menuBar.layout().spans[0].item.active, true);
  desk.toggleSettings();
  assert.equal(s.visible, false);
  const span = desk.menuBar.layout().spans[0];
  assert.equal(span.label, '≡ settings');
  assert.equal(span.item.active, false);
  desk.pointerDown(at(29, span.labelCol));
  desk.pointerUp(at(29, span.labelCol));
  assert.equal(s.visible, true);
  // Escape-equivalent: closing via [×] then the bar item reopens it.
  s.visible = false;
  desk.pointerDown(at(29, span.labelCol));
  desk.pointerUp(at(29, span.labelCol));
  assert.equal(s.visible, true);
});

test('settings window is sized to its controls + padding and sits top-right of the area', () => {
  const { desk } = makeDesktop();
  const s = desk.settings!;
  // button 1 + gap + toggles 2 + gap + range 2 = 7 rows, +2 padding rows, +2 frame;
  // 32 control cols + 2×2 padding cols + 2 frame.
  assert.deepEqual(s.rect, cellRect(0, 80 - 38, 11, 38));
  assert.deepEqual(settingsRect([], 32, cellRect(0, 0, 29, 80)), cellRect(0, 46, 2, 34), 'no padding by default');
  assert.deepEqual(settingsRect([], 32, cellRect(0, 0, 29, 80), { rows: 1, cols: 2 }), cellRect(0, 42, 4, 38));
  desk.toggleSettings();
  desk.render();
  const inner = s.inner;
  const top = inner.row + 1;
  const left = inner.col + 2;
  const innerText = (row: number) => rowText(desk.buffer, row).slice(inner.col, inner.col + inner.cols).trim();
  assert.equal(innerText(inner.row), '', 'padding row above the controls is blank');
  assert.equal(rowText(desk.buffer, top).slice(inner.col, inner.col + 2), '  ', 'padding cols left of the controls are blank');
  assert.equal(rowText(desk.buffer, top).slice(left, left + 6), '[ Go ]');
  assert.equal(rowText(desk.buffer, top + 2).slice(left, left + 5), '(●) a');
  assert.equal(innerText(inner.row + inner.rows - 1), '', 'padding row below the controls is blank');
  // Click the second radio through the composed target → exclusive switch.
  desk.pointerDown(at(top + 3, left + 1));
  desk.pointerUp(at(top + 3, left + 1));
  desk.render();
  assert.equal(rowText(desk.buffer, top + 2).slice(left, left + 5), '( ) a');
  assert.equal(rowText(desk.buffer, top + 3).slice(left, left + 5), '(●) b');
  // Opting out of the padding restores the tight layout.
  const one = [createButton({ id: 'go', label: 'Go' })];
  assert.deepEqual(settingsRect(one, 32, cellRect(0, 0, 29, 80), { rows: 0, cols: 0 }), cellRect(0, 46, 3, 34));
  const { desk: tight } = makeDesktop({ settings: { controls: one, padding: { rows: 0, cols: 0 } } });
  const t = tight.settings!;
  assert.equal(t.rect.cols, 34, 'no padding columns (the window may still enforce a minimum height)');
  tight.toggleSettings();
  tight.render();
  assert.equal(rowText(tight.buffer, t.inner.row).slice(t.inner.col, t.inner.col + 6), '[ Go ]');
});

test('a drag on a title row through the composed target moves that window in whole cells', () => {
  const { desk, w1, w3 } = makeDesktop();
  const from = { ...w1.rect };
  desk.pointerDown(at(from.row, from.col + 3));
  assert.equal(desk.dragging, true);
  assert.equal(desk.cursorAt(at(from.row, from.col + 3)), 'move');
  desk.pointerMove({ x: (from.col + 3) * D_CHAR + 1 + 25, y: from.row * D_LINE + 1 + 45 });
  desk.pointerUp({ x: (from.col + 3) * D_CHAR + 1 + 25, y: from.row * D_LINE + 1 + 45 });
  assert.deepEqual(w1.rect, { ...from, row: from.row + 2, col: from.col + 3 });
  assert.equal(desk.dragging, false);
  assert.equal(desk.ui.windows[desk.ui.windows.length - 1], w1, 'dragged window comes to front');
  assert.deepEqual(w3.rect, cellRect(12, 10, 8, 24), 'other windows untouched');
  // Cannot leave the area: drag far down-right clamps to the bottom row above the bar.
  desk.pointerDown(at(w1.rect.row, w1.rect.col + 3));
  desk.pointerMove(at(60, 200));
  desk.pointerUp(at(60, 200));
  assert.equal(w1.rect.row + w1.rect.rows, desk.area.rows);
  assert.equal(w1.rect.col + w1.rect.cols, desk.area.cols);
});

test('the bar swallows clicks over it, even where a window would otherwise be', () => {
  const { desk, w1 } = makeDesktop();
  // Move chart 01 flush against the bar, then click the bar's empty space right below its title row.
  w1.setRect(cellRect(desk.area.rows - 8, 40, 8, 24));
  assert.equal(w1.rect.row + w1.rect.rows, 29);
  const before = { ...w1.rect };
  const changed = desk.pointerDown(at(29, 50));
  assert.equal(changed, false);
  assert.equal(desk.hitTest!(at(29, 50)), true);
  assert.equal(desk.dragging, true, 'bar holds the pointer until release');
  desk.pointerMove(at(20, 50));
  assert.deepEqual(w1.rect, before, 'window did not move');
  desk.pointerUp(at(20, 50));
  assert.equal(desk.dragging, false);
  assert.notEqual(desk.ui.windows[desk.ui.windows.length - 1], w1, 'bar click does not front the window');
  assert.equal(desk.cursorAt(at(29, 50)), 'default');
  assert.equal(desk.cursorAt(at(29, 2)), 'pointer');
});

test('render paints bg, windows back-to-front (front = double frame), bar last, and blits once', () => {
  const { desk, ctx, w1, w2, w3 } = makeDesktop({
    wallpaper: (buf, area) => buf.fill(area, '·', '#888'),
  });
  desk.render();
  assert.equal(w3.active, true);
  assert.equal(w1.active, false);
  assert.equal(w2.active, false);
  const b = desk.buffer;
  assert.equal(b.get(0, 0)?.ch, '·', 'wallpaper shows on the desktop');
  assert.equal(b.get(29, 0)?.ch, ' ', 'bar row is not wallpapered');
  assert.equal(b.get(29, 0)?.bg, desk.theme.chromeBg);
  assert.equal(b.get(w3.rect.row, w3.rect.col)?.ch, '╔', 'front window: double frame');
  assert.equal(b.get(w1.rect.row, w1.rect.col)?.ch, '┌', 'back window: single frame');
  // The three windows are disjoint; a fourth one on top of chart 01 checks z-order.
  const w4 = desk.addWindow({ title: 'over', rect: cellRect(2, 2, 8, 24) });
  desk.render();
  assert.equal(w4.active, true);
  assert.equal(b.get(2, 2)?.ch, '╔', 'later window covers the earlier one');
  assert.ok(ctx.rects > 0 && ctx.texts > 0);
  assert.equal(ctx.font, desk.metrics.font);
  desk.removeWindow(w4);
  assert.equal(desk.windows.length, 3);
  desk.render();
  assert.equal(b.get(2, 2)?.ch, '┌');
});

test('restoreAll brings every minimized window back; theme from palette; headless dispose is safe', () => {
  const { desk, w1, w2 } = makeDesktop({ palette: ['#101010', '#eeeeee', '#ff8800'] });
  assert.equal(desk.theme.bg, '#101010');
  assert.equal(w1.theme.accent, '#ff8800');
  w1.minimized = true;
  w1.visible = false;
  w2.minimized = true;
  w2.visible = false;
  assert.equal(desk.menuBar.layout().spans.length, 3);
  desk.restoreAll();
  assert.equal(w1.visible && w2.visible, true);
  assert.equal(desk.menuBar.layout().spans.length, 1);
  desk.dispose();
});

test('activeFrame: option + runtime setter drop the double frame while `active` is still stamped', () => {
  const { desk, w3 } = makeDesktop({ activeFrame: false });
  assert.equal(desk.activeFrame, false);
  desk.render();
  const b = desk.buffer;
  assert.equal(w3.active, true, 'front window is still marked active');
  assert.equal(b.get(w3.rect.row, w3.rect.col)?.ch, '┌', 'but draws a single frame');
  assert.equal(b.get(w3.rect.row, w3.rect.col + 3)?.bg, desk.theme.bg, 'and a plain title row');
  desk.activeFrame = true;
  desk.render();
  assert.equal(b.get(w3.rect.row, w3.rect.col)?.ch, '╔', 'setter restores the double frame');
  assert.equal(b.get(w3.rect.row, w3.rect.col + 3)?.bg, desk.theme.chromeBg, 'and the highlighted title');
  desk.activeFrame = false;
  desk.toggleSettings();
  desk.render();
  const s = desk.settings!;
  assert.equal(s.active, true);
  assert.equal(b.get(s.rect.row, s.rect.col)?.ch, '┌', 'the settings window follows the flag too');
  // Default: on.
  const { desk: d2, w3: f2 } = makeDesktop();
  assert.equal(d2.activeFrame, true);
  d2.render();
  assert.equal(d2.buffer.get(f2.rect.row, f2.rect.col)?.ch, '╔');
});

test('setTheme retints the shared theme in place: windows, bar and render pick it up', () => {
  const { desk, w1, w3 } = makeDesktop({ palette: ['#101010', '#eeeeee', '#ff8800'] });
  const before = desk.theme;
  const own = desk.addWindow({ title: 'own', rect: cellRect(14, 2, 6, 20), theme: { ...fallbackTheme } });
  const returned = desk.setTheme(['#202020', '#dddddd', '#00ff88']);
  assert.equal(returned, before, 'returns the same theme object');
  assert.equal(desk.theme, before, 'desktop.theme identity is stable');
  assert.equal(desk.theme.bg, '#202020');
  assert.equal(w1.theme.accent, '#00ff88', 'windows share the object');
  assert.equal(w3.theme.bg, '#202020');
  assert.equal(own.theme.bg, fallbackTheme.bg, 'a window with its own theme is untouched');
  desk.render();
  const b = desk.buffer;
  assert.equal(b.get(29, 0)?.bg, desk.theme.chromeBg, 'bar uses the new chrome');
  assert.equal(b.get(w1.rect.row + 1, w1.rect.col + 1)?.bg, '#202020', 'window body uses the new bg');
  // A full TuiTheme object works too.
  const custom = { ...fallbackTheme, bg: '#333333', accent: '#123456' };
  desk.setTheme(custom);
  assert.equal(desk.theme.bg, '#333333');
  assert.equal(w1.theme.accent, '#123456');
  assert.notEqual(desk.theme, custom, 'copied in, not swapped');
});

console.log('frame contrast');

test('frame / frameActive reach AA against bg and differ, across seeded palettes', () => {
  const palettes: Array<[string, readonly string[]]> = [
    ['pale', ['#FCFAFA', '#FEEEEE', '#F7D7D7', '#3A3A3A']],
    ['dark', ['#101010', '#ff3300', '#f0f0f0', '#9a9a9a']],
  ];
  for (let i = 0; i < 12; i++) {
    Random.setSeed(String(1000 + i));
    palettes.push([`seed ${1000 + i}`, randomPalette()]);
  }
  for (const [name, palette] of palettes) {
    const t = themeFromPalette(palette);
    const fr = contrastRatio(t.frame, t.bg);
    const ar = contrastRatio(t.frameActive, t.bg);
    assert.ok(fr >= AA_CONTRAST, `${name}: frame ${t.frame} on ${t.bg} is ${fr.toFixed(2)}:1`);
    assert.ok(ar >= AA_CONTRAST, `${name}: frameActive ${t.frameActive} on ${t.bg} is ${ar.toFixed(2)}:1`);
    assert.notEqual(t.frame, t.frameActive, `${name}: frames must differ`);
    assert.ok(ar > fr, `${name}: the active frame is the stronger one`);
    assert.match(t.frame, /^#[0-9a-f]{6}$/, `${name}: frame is opaque hex, not a translucent dim`);
    // Highlighted text keeps AA on its own ground: pressed buttons and the front title.
    const pressedBg = composite(t.selectionBg, t.bg);
    assert.ok(contrastRatio(legibleOn(pressedBg, t.frame, t.frameActive), pressedBg) >= AA_CONTRAST, `${name}: pressed button text`);
    assert.ok(contrastRatio(legibleOn(t.chromeBg, t.chromeFg, t.frameActive), t.chromeBg) >= AA_CONTRAST, `${name}: title text`);
  }
  // Known values: a strong ink is the active frame; the quiet frame fades toward bg.
  const pale = themeFromPalette(palettes[0][1]);
  assert.equal(pale.frameActive, '#3a3a3a');
  assert.equal(pale.frame, '#747373');
  // An ink under 7:1 is pushed toward black/white so the quiet frame has room below it.
  const low = themeFromPalette(['#333333', '#aaaaaa', '#ff0000']);
  assert.ok(contrastRatio(low.frameActive, low.bg) >= 7, low.frameActive);
  assert.notEqual(low.frameActive, '#aaaaaa');
  // Nothing in the palette reaches AA → pure black / white, whichever contrasts more.
  const blue = themeFromPalette(['#0067E2', '#DBCCC5']);
  assert.equal(blue.frameActive, '#ffffff');
  assert.ok(contrastRatio(blue.frame, blue.bg) >= AA_CONTRAST);
  // The fallback theme's explicit values meet the same bar.
  assert.ok(contrastRatio(fallbackTheme.frame, fallbackTheme.bg) >= AA_CONTRAST);
  assert.ok(contrastRatio(fallbackTheme.frameActive, fallbackTheme.bg) >= AA_CONTRAST);
  // Unreadable backgrounds cannot be measured: both frames are the ink.
  assert.equal(themeFromPalette(['hsl(0 0% 5%)', 'white']).frame, 'white');
});

test('composite flattens translucent colours; legibleOn falls back to black / white', () => {
  assert.equal(composite('rgba(255, 255, 255, 0.5)', '#000000'), '#808080');
  assert.equal(composite('#ff000080', '#ffffff'), '#ff7f7f', '0x80 / 255 rounds down');
  assert.equal(composite('#ff0000', '#ffffff'), '#ff0000', 'opaque colours pass through');
  assert.equal(composite('hsl(0 0% 5%)', '#fff'), 'hsl(0 0% 5%)', 'unreadable colours pass through');
  assert.equal(legibleOn('#ffffff', '#777777', '#000000'), '#000000', 'skips a 4.48:1 grey');
  assert.equal(legibleOn('#ffffff', '#767676'), '#767676', '4.54:1 passes');
  assert.equal(legibleOn('#7b7b7b', '#888888'), '#000000');
  assert.equal(legibleOn('#202020'), '#ffffff');
});

test('window chrome is drawn with frameActive in front and frame behind', () => {
  const desk = createDesktop({ ctx: stubCtx(), width: 80 * D_CHAR, height: 30 * D_LINE, menuBar: 'top', onChange() {} });
  const back = desk.addWindow({ title: 'back', rect: cellRect(2, 2, 8, 24) });
  const front = desk.addWindow({ title: 'front', rect: cellRect(12, 30, 8, 24) });
  desk.render();
  const b = desk.buffer;
  const t = desk.theme;
  assert.equal(b.get(front.rect.row, front.rect.col)?.ch, '╔');
  assert.equal(b.get(front.rect.row, front.rect.col)?.fg, t.frameActive, 'front corner');
  assert.equal(b.get(back.rect.row, back.rect.col)?.ch, '┌');
  assert.equal(b.get(back.rect.row, back.rect.col)?.fg, t.frame, 'back corner');
  assert.equal(b.get(back.rect.row, back.rect.col + 3)?.fg, t.frame, 'back title text');
  assert.equal(b.get(back.rect.row + back.rect.rows - 1, back.rect.col + back.rect.cols - 1)?.fg, t.frame, 'back grip');
  assert.equal(b.get(front.rect.row + front.rect.rows - 1, front.rect.col + front.rect.cols - 1)?.fg, t.frameActive, 'front grip');
  const title = b.get(front.rect.row, front.rect.col + 3)!;
  assert.equal(title.bg, t.chromeBg);
  assert.equal(title.fg, t.chromeFg, 'chromeFg clears AA on the flattened fallback chrome');
  assert.ok(contrastRatio(title.fg, composite(title.bg, t.bg)) >= AA_CONTRAST, 'front title text is AA on the chrome flattened over bg');
  assert.ok(!Object.values(b.cells.flat()).some((g) => g?.fg === t.dim), 'no frame glyph uses the translucent dim');
});

test('active menu item is inverted: chromeBg text on a chromeFg ground across its padded span', () => {
  const { desk } = makeDesktop();
  const t = desk.theme;
  const row = desk.menuBar.row;
  desk.render();
  let span = desk.menuBar.layout().spans[0];
  assert.equal(span.item.active, false);
  assert.equal(desk.buffer.get(row, span.labelCol)?.fg, t.chromeFg, 'inactive item is plain bar text');
  assert.equal(desk.buffer.get(row, span.labelCol)?.bg, t.chromeBg);
  desk.toggleSettings();
  desk.render();
  span = desk.menuBar.layout().spans[0];
  assert.equal(span.item.active, true);
  for (let c = span.col; c < span.col + span.cols; c++) {
    const g = desk.buffer.get(row, c)!;
    assert.equal(g.bg, t.chromeFg, `col ${c} ground`);
    assert.equal(g.fg, t.chromeBg, `col ${c} text`);
  }
  assert.equal(span.col, 0, 'first item: its pad cell is the bar edge');
  assert.equal(desk.buffer.get(row, span.col + span.cols)?.bg, t.chromeBg, 'inversion stops at the span');
  // A palette theme: the inverted pair is the bar's own (opaque) pair, and accent stays off the bar.
  desk.setTheme(['#101010', '#ff3300', '#f0f0f0', '#9a9a9a']);
  desk.render();
  const g = desk.buffer.get(row, span.labelCol)!;
  assert.deepEqual([g.bg, g.fg], ['#101010', '#9a9a9a'], 'chromeFg ground, chromeBg text');
  assert.ok(contrastRatio(g.fg, g.bg) >= MIN_CONTRAST, 'the pair is the bar pair');
  const bar = desk.buffer.cells[row];
  assert.ok(!bar.some((c) => c?.fg === '#ff3300' || c?.bg === '#ff3300'), 'accent stays off the bar');
});

console.log(`\n${passed} tests passed`);
