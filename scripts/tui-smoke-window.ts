/**
 * Node smoke test for `src/tui/window.ts`.
 * Run: `npx tsx scripts/tui-smoke-window.ts` — exits non-zero on the first failure.
 */
import assert from 'node:assert/strict';

import { createGlyphBuffer, createMetrics, cellRect } from '../src/tui';
import type { CellRect } from '../src/tui';
import { createTuiWindow, type TuiContent } from '../src/tui/window';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function dump(buf: ReturnType<typeof createGlyphBuffer>): string[] {
  return buf.cells.map((line) => line.map((g) => g?.ch ?? '.').join(''));
}

const CHAR_W = 8;
const LINE_H = 20;
const metrics = createMetrics(null, { charW: CHAR_W, lineH: LINE_H });
const px = (row: number, col: number) => ({ x: col * CHAR_W + 1, y: row * LINE_H + 1 });
const BOUNDS: CellRect = cellRect(0, 0, 30, 60);
const rectOf = (w: { rect: CellRect }) => ({ ...w.rect });

const make = (over: Partial<Parameters<typeof createTuiWindow>[0]> = {}) =>
  createTuiWindow({
    metrics,
    title: 'chart',
    rect: cellRect(5, 10, 8, 20),
    bounds: BOUNDS,
    ...over,
  });

console.log('window');

test('inner rect = rect shrunk by 1 col each side, 1 row top + 1 bottom', () => {
  const w = make();
  assert.deepEqual(w.inner, cellRect(6, 11, 6, 18));
});

test('contains uses pixel → cell', () => {
  const w = make();
  assert.equal(w.contains(px(5, 10)), true);
  assert.equal(w.contains(px(12, 29)), true);
  assert.equal(w.contains(px(13, 29)), false);
  assert.equal(w.contains(px(4, 10)), false);
  w.visible = false;
  assert.equal(w.contains(px(5, 10)), false);
});

test('drawn window renders ┌… title …[–][□][×]┐ in the top row', () => {
  const w = make();
  const buf = createGlyphBuffer(30, 60);
  w.draw(buf);
  const rows = dump(buf);
  assert.equal(rows[5].slice(10, 30), '┌─ chart ─[–][□][×]┐');
  assert.equal(rows[12].slice(10, 30), '└──────────────────┘');
  assert.equal(rows[6].slice(10, 30), '│                  │');
  assert.equal(buf.get(12, 29)?.fg, w.theme.accent, 'grip drawn in accent');
});

test('active window uses the double frame; buttons hit-test', () => {
  const w = make();
  w.active = true;
  const buf = createGlyphBuffer(30, 60);
  w.draw(buf);
  const rows = dump(buf);
  assert.equal(rows[5][10], '╔');
  assert.equal(rows[12][10], '╚');
  assert.equal(w.buttonAt({ row: 5, col: 20 }), 'minimize');
  assert.equal(w.buttonAt({ row: 5, col: 24 }), 'maximize');
  assert.equal(w.buttonAt({ row: 5, col: 28 }), 'close');
  assert.equal(w.buttonAt({ row: 5, col: 19 }), null);
  assert.equal(w.buttonAt({ row: 6, col: 28 }), null);
});

test('drag title by 25 px at charW 8 moves 3 cols', () => {
  const w = make();
  assert.equal(w.pointerDown({ x: 12 * CHAR_W, y: 5 * LINE_H + 3 }), true);
  assert.equal(w.dragging, 'move');
  assert.equal(w.cursorAt({ x: 0, y: 0 }), 'move');
  assert.equal(w.pointerMove({ x: 12 * CHAR_W + 25, y: 5 * LINE_H + 3 }), true);
  assert.deepEqual(rectOf(w), cellRect(5, 13, 8, 20));
  assert.equal(w.pointerMove({ x: 12 * CHAR_W + 25, y: 5 * LINE_H + 3 }), false, 'no change → false');
  assert.equal(w.pointerUp({ x: 12 * CHAR_W + 25, y: 5 * LINE_H + 3 }), true);
  assert.equal(w.dragging, null);
});

test('move is clamped to bounds', () => {
  const w = make();
  w.pointerDown(px(5, 12));
  w.pointerMove(px(0, 0));
  assert.deepEqual(rectOf(w), cellRect(0, 0, 8, 20), 'top-left corner');
  w.pointerMove(px(100, 100));
  assert.deepEqual(rectOf(w), cellRect(22, 40, 8, 20), 'bottom-right corner');
  w.pointerUp(px(100, 100));
});

test('grip resize grows rows/cols and clamps at min and bounds', () => {
  const w = make({ minRows: 4, minCols: 12 });
  assert.equal(w.cursorAt(px(12, 29)), 'nwse-resize');
  assert.equal(w.pointerDown(px(12, 29)), true);
  assert.equal(w.dragging, 'resize');
  w.pointerMove(px(15, 34));
  assert.deepEqual(rectOf(w), cellRect(5, 10, 11, 25), 'grew 3 rows, 5 cols');
  w.pointerMove(px(0, 0));
  assert.deepEqual(rectOf(w), cellRect(5, 10, 4, 12), 'clamped at min size');
  w.pointerMove(px(200, 200));
  assert.deepEqual(rectOf(w), cellRect(5, 10, 25, 50), 'clamped at bounds');
  w.pointerUp(px(29, 59));
  const buf = createGlyphBuffer(30, 60);
  w.draw(buf);
  assert.equal(buf.get(29, 59)?.ch, '◢', 'grip shows ◢ while hovered');
  w.pointerMove(px(0, 0));
  buf.clear();
  w.draw(buf);
  assert.equal(buf.get(29, 59)?.ch, '┘', 'grip returns to corner when unhovered');
});

test('[×] hides and fires onClose', () => {
  let closed = 0;
  const w = make({ onClose: () => closed++ });
  assert.equal(w.cursorAt(px(5, 28)), 'pointer');
  assert.equal(w.pointerDown(px(5, 28)), true);
  assert.equal(w.visible, true, 'fires on release, not press');
  assert.equal(w.pointerUp(px(5, 28)), true);
  assert.equal(w.visible, false);
  assert.equal(w.minimized, false);
  assert.equal(closed, 1);
});

test('press then release elsewhere does not fire', () => {
  let closed = 0;
  const w = make({ onClose: () => closed++ });
  w.pointerDown(px(5, 28));
  w.pointerUp(px(8, 15));
  assert.equal(w.visible, true);
  assert.equal(closed, 0);
});

test('[–] minimizes + hides, fires onMinimize; restore() brings it back', () => {
  let minimized = 0;
  const w = make({ onMinimize: () => minimized++ });
  w.pointerDown(px(5, 21));
  w.pointerUp(px(5, 21));
  assert.equal(w.minimized, true);
  assert.equal(w.visible, false);
  assert.equal(minimized, 1);
  w.restore();
  assert.equal(w.minimized, false);
  assert.equal(w.visible, true);
});

test('[□] maximizes to bounds; second click restores the exact rect', () => {
  const w = make();
  const before = rectOf(w);
  w.pointerDown(px(5, 25));
  w.pointerUp(px(5, 25));
  assert.equal(w.maximized, true);
  assert.deepEqual(rectOf(w), BOUNDS);
  const buf = createGlyphBuffer(30, 60);
  w.draw(buf);
  assert.equal(dump(buf)[0].slice(50, 59), '[–][▣][×]', 'maximize button reads ▣ while maximized');
  assert.equal(w.buttonAt({ row: 0, col: 54 }), 'maximize');
  w.pointerDown(px(0, 54));
  w.pointerUp(px(0, 54));
  assert.equal(w.maximized, false);
  assert.deepEqual(rectOf(w), before);
});

test('toggleMaximize() + a title drag leaves the maximized state', () => {
  const w = make({ bounds: cellRect(0, 0, 30, 60) });
  w.toggleMaximize();
  assert.equal(w.maximized, true);
  w.pointerDown(px(0, 5));
  w.pointerMove(px(2, 5));
  w.pointerUp(px(2, 5));
  assert.equal(w.maximized, false);
  assert.equal(w.rect.row, 0, 'clamped: a bounds-sized window cannot move down');
  w.toggleMaximize();
  w.pointerDown(px(29, 59));
  w.pointerMove(px(20, 40));
  w.pointerUp(px(20, 40));
  assert.equal(w.maximized, false);
  assert.deepEqual(rectOf(w), cellRect(0, 0, 21, 41), 'keeps its resized rect');
});

test('setting bounds refits a maximized window; setRect enforces min size', () => {
  const w = make();
  w.toggleMaximize();
  w.bounds = cellRect(0, 0, 20, 40);
  assert.deepEqual(rectOf(w), cellRect(0, 0, 20, 40));
  w.setRect(cellRect(1, 1, 1, 1));
  assert.equal(w.maximized, false);
  assert.deepEqual(rectOf(w), cellRect(1, 1, 4, 12));
});

test('clicks inside inner are forwarded to content in cell coords and captured', () => {
  const log: string[] = [];
  const content: TuiContent = {
    pointerDown: (c, inner) => {
      log.push(`down ${c.row},${c.col} ${inner.row},${inner.col}`);
      return true;
    },
    pointerMove: (c) => {
      log.push(`move ${c.row},${c.col}`);
      return false;
    },
    pointerUp: (c) => {
      log.push(`up ${c.row},${c.col}`);
      return true;
    },
    cursorAt: () => 'pointer',
  };
  const w = make({ content });
  assert.equal(w.cursorAt(px(8, 15)), 'pointer');
  assert.equal(w.pointerDown(px(8, 15)), true);
  assert.equal(w.pointerMove(px(5, 12)), false, 'captured: goes to content, not a title drag');
  assert.equal(w.dragging, null);
  assert.equal(w.pointerUp(px(5, 12)), true);
  assert.deepEqual(log, ['down 8,15 6,11', 'move 5,12', 'up 5,12']);
  assert.equal(w.pointerDown(px(12, 15)), false, 'bottom border is not content');
});

test('draw callback is clipped to inner', () => {
  const w = make({
    draw: (buf, inner) => {
      buf.text(inner.row, inner.col - 5, 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', '#fff');
    },
  });
  const buf = createGlyphBuffer(30, 60);
  w.draw(buf);
  assert.equal(dump(buf)[6].slice(10, 30), '│XXXXXXXXXXXXXXXXXX│');
});

test('optional buttons: none → title only; not resizable → no grip cursor', () => {
  const w = make({ closable: false, minimizable: false, maximizable: false, resizable: false });
  const buf = createGlyphBuffer(30, 60);
  w.draw(buf);
  assert.equal(dump(buf)[5].slice(10, 30), '┌─ chart ' + '─'.repeat(10) + '┐');
  assert.equal(w.buttonAt({ row: 5, col: 28 }), null);
  assert.equal(w.cursorAt(px(12, 29)), null);
  assert.equal(w.pointerDown(px(12, 29)), false);
});

console.log(`\n${passed} tests passed`);
