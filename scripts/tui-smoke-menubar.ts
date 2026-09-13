/**
 * Node smoke test for `src/tui/menubar.ts`.
 * Run: `npx tsx scripts/tui-smoke-menubar.ts` — exits non-zero on the first failure.
 */
import assert from 'node:assert/strict';

import { createGlyphBuffer } from '../src/tui/grid';
import { createMetrics } from '../src/tui/metrics';
import { AA_CONTRAST, composite, contrastRatio, fallbackTheme, legibleOn } from '../src/tui/theme';
import { createMenuBar, layoutMenuBar } from '../src/tui/menubar';
import type { MenuItem } from '../src/tui/menubar';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function dump(buf: ReturnType<typeof createGlyphBuffer>): string[] {
  return buf.cells.map((line) => line.map((g) => g?.ch ?? '.').join(''));
}

const metrics = createMetrics(null, { charW: 8.43, lineH: 20 });
const COLS = 56;
const ROWS = 6;
/** First row of the two-row band (the text row); the band also covers ROW + 1. */
const ROW = ROWS - 2;

/** Pixel centre of a cell on the bar row. */
const px = (col: number, row = ROW) => ({ x: (col + 0.5) * metrics.charW, y: (row + 0.5) * metrics.lineH });

const EPS = 1e-9;
const near = (a: number, b: number, msg: string) =>
  assert.ok(Math.abs(a - b) < EPS, `${msg}: ${a} ≉ ${b}`);

/**
 * The highlight block's pixel extent on column `col`, read back out of the
 * per-row boxes — and a check that the slices tile the block without a seam.
 */
function boxExtent(
  buf: ReturnType<typeof createGlyphBuffer>,
  col: number,
  row = ROW,
  rows = 2,
): { top: number; bottom: number } {
  let top = Infinity;
  let bottom = -Infinity;
  let sum = 0;
  for (let i = 0; i < rows; i++) {
    const b = buf.get(row + i, col)?.box;
    if (!b || b.h <= 0) continue;
    const t = (row + i + b.dy) * metrics.lineH;
    top = Math.min(top, t);
    bottom = Math.max(bottom, t + b.h * metrics.lineH);
    sum += b.h * metrics.lineH;
  }
  near(sum, bottom - top, 'row slices tile the highlight with no gap or overlap');
  return { top, bottom };
}

console.log('menubar');

const calls: string[] = [];
let settingsVisible = false;
const items = (): MenuItem[] => [
  { id: 'settings', label: '≡ settings', active: settingsVisible, onSelect: () => { settingsVisible = !settingsVisible; calls.push('settings'); } },
  { id: 'w2', label: 'chart 02', onSelect: () => calls.push('chart 02') },
  { id: 'w5', label: 'chart 05', onSelect: () => calls.push('chart 05') },
];
let statusText = '';
const bar = createMenuBar({ metrics, theme: fallbackTheme, cols: COLS, row: ROW, items, status: () => statusText });

test('lists settings then minimized windows on the bottom row', () => {
  const buf = createGlyphBuffer(ROWS, COLS);
  bar.paint(buf);
  const lines = dump(buf);
  assert.equal(lines[ROW], '  ≡ settings  │  chart 02  │  chart 05'.padEnd(COLS), 'two padding cells around each item');
  assert.equal(lines[ROW + 1], ' '.repeat(COLS), 'lower band row is blank ground');
  for (let r = 0; r < ROW; r++) assert.equal(lines[r], '.'.repeat(COLS));
  for (let c = 0; c < COLS; c++) {
    assert.equal(buf.get(ROW, c)?.bg, fallbackTheme.chromeBg);
    assert.equal(buf.get(ROW + 1, c)?.bg, fallbackTheme.chromeBg);
  }
  assert.equal(bar.rows, 2);
  assert.deepEqual(bar.rect(), { row: ROW, col: 0, rows: 2, cols: COLS });
  // Text glyphs carry dy 0.5 so they sit on the band's midline; the ground cells do not.
  for (let c = 2; c < 12; c++) assert.equal(buf.get(ROW, c)?.dy, 0.5, `text col ${c}`);
  assert.equal(buf.get(ROW, 14)?.ch, '│');
  assert.equal(buf.get(ROW, 14)?.dy, 0.5, 'separator glyph too');
  assert.equal(buf.get(ROW, 45)?.dy, undefined, 'empty band cell');
  // Spans: label + 2 pad cells each side; the first starts at the bar edge; the `│` sits between two pads.
  const spans = bar.layout().spans;
  assert.deepEqual(spans.map((s) => [s.col, s.cols, s.labelCol]), [[0, 14, 2], [15, 12, 17], [28, 12, 30]]);
  assert.deepEqual(bar.pxRect(), { x: 0, y: ROW * metrics.lineH, w: COLS * metrics.charW, h: 2 * metrics.lineH });
  assert.equal(buf.get(ROW + 1, 3)?.dy, undefined, 'lower row ground');
});

test('contains / cursor: pointer over items, default on empty bar, null off the bar', () => {
  assert.equal(bar.contains(px(3)), true);
  assert.equal(bar.contains(px(3, ROW + 1)), true, 'lower band row');
  assert.equal(bar.contains(px(3, ROW - 1)), false);
  assert.equal(bar.cursorAt(px(3, ROW + 1)), 'pointer', 'items hit on both rows');
  assert.equal(bar.itemAt(px(3, ROW + 1))?.id, 'settings');
  assert.equal(bar.cursorAt(px(3)), 'pointer'); // inside '≡ settings'
  assert.equal(bar.cursorAt(px(13)), 'pointer'); // its second trailing pad cell
  assert.equal(bar.cursorAt(px(14)), 'default'); // the '│' separator cell
  assert.equal(bar.cursorAt(px(15)), 'pointer'); // first pad cell of chart 02
  assert.equal(bar.cursorAt(px(45)), 'default'); // empty tail
  assert.equal(bar.cursorAt(px(3, 0)), null);
});

test('clicking the span of chart 05 calls its onSelect', () => {
  const span = bar.layout().spans[2];
  assert.equal(span.label, 'chart 05');
  const col = span.labelCol + 3;
  assert.equal(bar.itemAt(px(col))?.id, 'w5');
  assert.equal(bar.pointerDown(px(col)), true);
  assert.equal(bar.pointerUp(px(col)), true);
  assert.deepEqual(calls, ['chart 05']);
});

test('clicking empty bar space does nothing', () => {
  calls.length = 0;
  assert.equal(bar.pointerDown(px(45)), false);
  assert.equal(bar.pointerUp(px(45)), false);
  assert.equal(bar.pointerDown(px(3, 0)), false);
  assert.deepEqual(calls, []);
});

test('press on one item, release on another selects nothing', () => {
  calls.length = 0;
  bar.pointerDown(px(bar.layout().spans[1].labelCol));
  assert.equal(bar.pointerUp(px(bar.layout().spans[2].labelCol)), true);
  assert.deepEqual(calls, []);
});

test('settings toggles active and is drawn inverted (chromeBg text on a chromeFg ground)', () => {
  const span = bar.layout().spans[0];
  const col = span.labelCol;
  bar.pointerDown(px(col));
  bar.pointerUp(px(col));
  assert.equal(settingsVisible, true);
  const buf = createGlyphBuffer(ROWS, COLS);
  bar.paint(buf);
  // The whole padded span is inverted — as an inset box over the band's own
  // ground, not as the cell background; accent never reaches the bar.
  for (const r of [ROW, ROW + 1]) {
    for (let c = span.col; c < span.col + span.cols; c++) {
      assert.equal(buf.get(r, c)?.bg, fallbackTheme.chromeBg, `row ${r} col ${c} band ground`);
      assert.equal(buf.get(r, c)?.box?.fill, fallbackTheme.chromeFg, `row ${r} col ${c} highlight`);
      assert.equal(buf.get(r, c)?.fg, fallbackTheme.chromeBg, `row ${r} col ${c} text`);
    }
    assert.equal(buf.get(r, span.col + span.cols)?.box, undefined, 'inversion stops at the span');
  }
  // Centred in the band: a third of a row of ground above and below it.
  const bandTop = ROW * metrics.lineH;
  const bandBottom = bandTop + 2 * metrics.lineH;
  const ext = boxExtent(buf, span.col);
  near(ext.top - bandTop, bandBottom - ext.bottom, 'equal margin above and below the highlight');
  near(ext.top - bandTop, metrics.lineH / 3, 'margin is a third of a row');
  const other = bar.layout().spans[1];
  assert.equal(buf.get(ROW, other.labelCol)?.fg, fallbackTheme.chromeFg);
  assert.equal(buf.get(ROW, other.labelCol)?.bg, fallbackTheme.chromeBg);
  assert.ok(!buf.cells[ROW].some((g) => g?.fg === fallbackTheme.accent || g?.bg === fallbackTheme.accent), 'accent stays off the bar');
  settingsVisible = false;
});

test('pressed item is highlighted with selectionBg until release', () => {
  const s = bar.layout().spans[1];
  bar.pointerDown(px(s.labelCol));
  const buf = createGlyphBuffer(ROWS, COLS);
  bar.paint(buf);
  assert.equal(buf.get(ROW, s.labelCol)?.box?.fill, fallbackTheme.selectionBg);
  assert.equal(buf.get(ROW, s.col)?.box?.fill, fallbackTheme.selectionBg);
  assert.equal(buf.get(ROW + 1, s.col)?.box?.fill, fallbackTheme.selectionBg, 'pressed highlight spans the band');
  assert.equal(buf.get(ROW, s.col)?.bg, fallbackTheme.chromeBg, 'over the band ground, not instead of it');
  // Text is chosen for AA on the real ground: bg ← chromeBg ← selectionBg, all flattened.
  const ground = composite(fallbackTheme.selectionBg, composite(fallbackTheme.chromeBg, fallbackTheme.bg));
  const fg = buf.get(ROW, s.labelCol)?.fg;
  assert.equal(fg, legibleOn(ground, fallbackTheme.chromeFg, fallbackTheme.frameActive));
  assert.equal(fg, fallbackTheme.chromeFg, 'the bar text already clears AA on the fallback highlight');
  assert.ok(contrastRatio(fg!, ground) >= AA_CONTRAST);
  bar.pointerUp(px(s.labelCol));
  buf.clear();
  bar.paint(buf);
  assert.equal(buf.get(ROW, s.labelCol)?.box, undefined);
  assert.equal(buf.get(ROW, s.labelCol)?.bg, fallbackTheme.chromeBg);
  calls.length = 0;
});

test('status text is right-aligned with one padding cell', () => {
  statusText = 'seed 42';
  const buf = createGlyphBuffer(ROWS, COLS);
  bar.paint(buf);
  assert.equal(dump(buf)[ROW], '  ≡ settings  │  chart 02  │  chart 05          seed 42 ');
  assert.equal(buf.get(ROW, COLS - 2)?.dy, 0.5, 'status text is centred on the band too');
  assert.equal(bar.layout().status?.col, COLS - 1 - 'seed 42'.length);
});

test('status truncates before overlapping items', () => {
  statusText = 'fps 60 · seed 123456789';
  const lay = bar.layout();
  const last = lay.spans[2];
  assert.ok(lay.status);
  assert.ok(lay.status.col >= last.col + last.cols + 1);
  assert.equal(lay.status.col + Array.from(lay.status.text).length, COLS - 1);
  assert.equal(lay.status.text, 'fps 60 · seed ');
  statusText = '';
});

test('status disappears when there is no room at all', () => {
  const lay = layoutMenuBar(items(), 36, 'x');
  assert.equal(lay.spans.length, 3);
  assert.equal(lay.status, null);
});

test('items that do not fit are truncated / dropped', () => {
  const lay = layoutMenuBar(items(), 24);
  assert.equal(lay.spans.length, 2);
  assert.equal(lay.spans[0].label, '≡ settings');
  assert.equal(lay.spans[1].label, 'chart', 'truncated so its trailing padding still fits');
  assert.equal(lay.spans[1].col + lay.spans[1].cols, 24);
  const buf = createGlyphBuffer(1, 24);
  createMenuBar({ metrics, theme: fallbackTheme, cols: 24, row: 0, items }).paint(buf);
  assert.equal(dump(buf)[0], '  ≡ settings  │  chart  ');
  const tiny = layoutMenuBar(items(), 5);
  assert.equal(tiny.spans.length, 1);
  assert.equal(tiny.spans[0].label, '≡');
  assert.deepEqual(layoutMenuBar(items(), 4), { spans: [], status: null }, 'no room for a label between the pads');
  assert.deepEqual(layoutMenuBar(items(), 0), { spans: [], status: null });
});

test('row and cols accept getters (top-edge bar, resize)', () => {
  let cols = 30;
  const top = createMenuBar({ metrics, theme: fallbackTheme, cols: () => cols, row: () => 0, items });
  assert.equal(top.row, 0);
  assert.equal(top.contains(px(2, 0)), true);
  assert.equal(top.contains(px(2, 1)), true, 'second band row');
  assert.equal(top.contains(px(2, 2)), false);
  assert.equal(top.contains(px(2, ROW)), false);
  assert.deepEqual(top.rect(), { row: 0, col: 0, rows: 2, cols: 30 });
  const one = createMenuBar({ metrics, theme: fallbackTheme, cols: 30, row: 0, rows: 1, items });
  assert.deepEqual(one.rect(), { row: 0, col: 0, rows: 1, cols: 30 });
  assert.equal(one.contains(px(2, 1)), false);
  const b1 = createGlyphBuffer(2, 30);
  one.paint(b1);
  assert.equal(b1.get(0, 4)?.ch, 's');
  assert.equal(b1.get(0, 4)?.dy ?? 0, 0, 'a 1-row bar writes plain glyphs');
  cols = 12;
  assert.equal(top.cols, 12);
  assert.equal(top.contains(px(20, 0)), false);
  // widthPx stretches the band (ground + hit-test) past the last whole cell.
  const wide = createMenuBar({ metrics, theme: fallbackTheme, cols: 12, row: 0, widthPx: 130, items });
  assert.deepEqual(wide.pxRect(), { x: 0, y: 0, w: 130, h: 40 });
  assert.equal(wide.contains({ x: 129, y: 5 }), true);
  assert.equal(wide.contains({ x: 130, y: 5 }), false);
  assert.equal(wide.cursorAt({ x: 129, y: 5 }), 'default');
  assert.equal(wide.itemAt({ x: 129, y: 5 }), null);
  const narrow = createMenuBar({ metrics, theme: fallbackTheme, cols: 12, row: 0, widthPx: 50, items });
  assert.equal(narrow.pxRect().w, 12 * metrics.charW, 'never narrower than the cells');
});

test('spans are hit-testable through metrics.toCell at fractional charW', () => {
  for (const s of bar.layout().spans) {
    for (let c = s.col; c < s.col + s.cols; c++) {
      assert.equal(bar.itemAtCol(c)?.id, s.item.id);
      assert.equal(bar.itemAt({ x: c * metrics.charW, y: ROW * metrics.lineH })?.id, s.item.id);
      assert.equal(bar.itemAt(px(c))?.id, s.item.id);
    }
  }
});

test('the highlight is centred on the band\'s pixel midline, remainder included', () => {
  // A bottom band absorbs `height - rows * lineH` below its last row, so the
  // block has to centre on the real pixels, not on the two cell rows.
  const active = (): MenuItem[] => [{ id: 'settings', label: '≡ settings', active: true, onSelect: () => {} }];
  for (const bandPx of [40, 45, 47, 2 * metrics.lineH + 19]) {
    const b = createMenuBar({ metrics, theme: fallbackTheme, cols: COLS, row: ROW, bandPx, items: active });
    const buf = createGlyphBuffer(ROWS, COLS);
    b.paint(buf);
    const span = b.layout().spans[0];
    const bandTop = ROW * metrics.lineH;
    const ext = boxExtent(buf, span.labelCol);
    near(ext.top - bandTop, bandTop + bandPx - ext.bottom, `equal margins at bandPx ${bandPx}`);
    near((ext.top + ext.bottom) / 2, bandTop + bandPx / 2, `centred at bandPx ${bandPx}`);
    near(ext.top - bandTop, metrics.lineH / 3, `top margin at bandPx ${bandPx}`);
    assert.ok(ext.bottom < bandTop + bandPx, 'never reaches the band bottom edge');
    assert.ok(ext.top > bandTop, 'never reaches the band top edge');
    // The label keeps its ground under the block and its inverted pair.
    assert.equal(buf.get(ROW, span.labelCol)?.bg, fallbackTheme.chromeBg);
    assert.equal(buf.get(ROW, span.labelCol)?.fg, fallbackTheme.chromeBg);
    assert.equal(buf.get(ROW, span.labelCol)?.box?.fill, fallbackTheme.chromeFg);
  }
});

console.log(`\n${passed} tests passed`);
