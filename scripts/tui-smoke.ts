/**
 * Node smoke test for the pure parts of `src/tui`.
 * Run: `npx tsx scripts/tui-smoke.ts` — exits non-zero on the first failure.
 * Wave-2 tasks append their own sections below.
 */
import assert from 'node:assert/strict';

import {
  createGlyphBuffer,
  createMetrics,
  themeFromPalette,
  fallbackTheme,
  withAlpha,
  cellRect,
  intersectCellRect,
  insetCellRect,
} from '../src/tui';
import type { BlitContext } from '../src/tui';

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
  assert.equal(m.baselineOffset, 2);
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

console.log('theme');

test('themeFromPalette maps palette[0] → bg deterministically', () => {
  const t = themeFromPalette(['#111', '#eee', '#f80', '#345']);
  assert.equal(t.bg, '#111');
  assert.equal(t.fg, '#eee');
  assert.equal(t.accent, '#f80');
  assert.equal(t.chromeBg, '#345');
  assert.equal(t.chromeFg, '#111');
  assert.equal(t.dim, 'rgba(238, 238, 238, 0.45)');
  assert.equal(t.selectionBg, 'rgba(255, 136, 0, 0.3)');
  assert.equal(t.font, fallbackTheme.font);
  assert.deepEqual(themeFromPalette(['#111', '#eee', '#f80', '#345']), t);
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
    ['x', 30, 2, '#fff'],
    ['a', 0, 22, '#0f0'],
    ['b', 10, 22, '#0f0'],
  ]);
  assert.equal(ctx.font, m.font);
  assert.equal(ctx.textBaseline, 'top');
  assert.equal(ctx.textAlign, 'left');
});

console.log('cells');

test('cell rect helpers', () => {
  assert.deepEqual(intersectCellRect(cellRect(0, 0, 5, 5), cellRect(3, 3, 5, 5)), cellRect(3, 3, 2, 2));
  assert.deepEqual(intersectCellRect(cellRect(0, 0, 2, 2), cellRect(5, 5, 2, 2)).rows, 0);
  assert.deepEqual(insetCellRect(cellRect(1, 1, 5, 7), 1), cellRect(2, 2, 3, 5));
  assert.deepEqual(insetCellRect(cellRect(0, 0, 1, 1), 1), cellRect(1, 1, 0, 0));
});

console.log(`\n${passed} tests passed`);
