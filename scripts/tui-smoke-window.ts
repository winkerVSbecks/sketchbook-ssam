/**
 * Node smoke test for `src/tui/window.ts`.
 * Run: `npx tsx scripts/tui-smoke-window.ts` — exits non-zero on the first failure.
 */
import assert from 'node:assert/strict';

import {
  createGlyphBuffer,
  createMetrics,
  cellRect,
  composite,
  contrastRatio,
  AA_CONTRAST,
  MIN_CONTRAST,
  fallbackTheme,
} from '../src/tui';
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
  // Inactive chrome — box, title and grip — is theme.frame (solid, ≥ 4.5:1 on bg).
  assert.equal(buf.get(12, 29)?.fg, w.theme.frame, 'grip drawn in frame');
  assert.equal(buf.get(5, 10)?.fg, w.theme.frame, 'corner drawn in frame');
  assert.equal(buf.get(5, 13)?.fg, w.theme.frame, 'title drawn in frame');
  assert.equal(buf.get(5, 13)?.bg, w.theme.bg);
  assert.notEqual(w.theme.frame, w.theme.dim, 'never the translucent dim');
  assert.ok(
    contrastRatio(w.theme.frame, w.theme.bg) >= MIN_CONTRAST,
    'inactive frame at graphics-level AA',
  );
  assert.ok(
    contrastRatio(w.theme.frameActive, w.theme.bg) >= AA_CONTRAST,
    'active frame at text-level AA',
  );
});

test('active window uses the double frame; buttons hit-test', () => {
  const w = make();
  w.active = true;
  const buf = createGlyphBuffer(30, 60);
  w.draw(buf);
  const rows = dump(buf);
  assert.equal(rows[5][10], '╔');
  assert.equal(rows[12][10], '╚');
  // Active chrome is theme.frameActive; the title sits on chromeBg with AA text.
  assert.equal(buf.get(5, 10)?.fg, w.theme.frameActive, 'corner drawn in frameActive');
  assert.equal(buf.get(12, 29)?.fg, w.theme.frameActive, 'grip drawn in frameActive');
  assert.equal(buf.get(5, 20)?.fg, w.theme.frameActive, 'buttons drawn in frameActive');
  assert.notEqual(w.theme.frameActive, w.theme.frame);
  const title = buf.get(5, 13)!;
  assert.equal(title.bg, w.theme.chromeBg);
  assert.equal(
    title.fg,
    fallbackTheme.chromeFg,
    'chromeFg is legible on the flattened fallback chrome',
  );
  assert.ok(contrastRatio(title.fg, composite(title.bg, w.theme.bg)) >= AA_CONTRAST);
  assert.equal(w.buttonAt({ row: 5, col: 20 }), 'minimize');
  assert.equal(w.buttonAt({ row: 5, col: 24 }), 'maximize');
  assert.equal(w.buttonAt({ row: 5, col: 28 }), 'close');
  assert.equal(w.buttonAt({ row: 5, col: 19 }), null);
  assert.equal(w.buttonAt({ row: 6, col: 28 }), null);
});

test('double-click on the title toggles maximize like [□]', () => {
  let t = 0;
  const w = make({ now: () => t });
  const title = px(5, 13);
  const original = rectOf(w);
  w.pointerDown(title);
  w.pointerUp(title);
  t += 200;
  assert.equal(w.pointerDown(title), true);
  assert.equal(w.maximized, true, 'two presses 200 ms apart maximize');
  assert.equal(w.dragging, null, 'the second press starts no move drag');
  assert.deepEqual(rectOf(w), BOUNDS);
  w.pointerUp(px(0, 3));
  // The timer is reset: a third press soon after is a fresh first press…
  t += 100;
  w.pointerDown(px(0, 3));
  assert.equal(w.maximized, true, 'third press alone does not toggle');
  assert.equal(w.dragging, 'move');
  w.pointerUp(px(0, 3));
  // …and its own partner restores.
  t += 200;
  w.pointerDown(px(0, 3));
  assert.equal(w.maximized, false, 'double-click again restores');
  assert.deepEqual(rectOf(w), original);
  w.pointerUp(px(5, 13));
});

test('slow, far-apart, button and non-maximizable presses do not maximize', () => {
  let t = 0;
  const slow = make({ now: () => t });
  slow.pointerDown(px(5, 13));
  slow.pointerUp(px(5, 13));
  t += 600;
  slow.pointerDown(px(5, 13));
  assert.equal(slow.maximized, false, '600 ms apart is two single clicks');
  assert.equal(slow.dragging, 'move', 'the second press is a normal move drag');
  slow.pointerUp(px(5, 13));

  t = 0;
  const far = make({ now: () => t });
  far.pointerDown(px(5, 13));
  far.pointerUp(px(5, 13));
  t += 200;
  far.pointerDown(px(5, 16));
  assert.equal(
    far.maximized,
    false,
    'a second press more than one cell away is not a double-click',
  );
  assert.equal(far.dragging, 'move');
  far.pointerUp(px(5, 16));
  // …but a neighbouring cell counts.
  t = 0;
  const near = make({ now: () => t });
  near.pointerDown(px(5, 13));
  near.pointerUp(px(5, 13));
  t += 200;
  near.pointerDown(px(5, 14));
  assert.equal(near.maximized, true, 'one cell of slack');
  near.pointerUp(px(0, 3));

  t = 0;
  for (const col of [20, 28]) {
    const btn = make({ now: () => t });
    btn.pointerDown(px(5, col));
    t += 100;
    btn.pointerDown(px(5, col));
    assert.equal(btn.maximized, false, `two presses on the button at col ${col} never maximize`);
    assert.equal(btn.dragging, null);
  }
  // A title press followed quickly by a button press does not arm the next title press.
  t = 0;
  const mixed = make({ now: () => t });
  mixed.pointerDown(px(5, 13));
  mixed.pointerUp(px(5, 13));
  t += 100;
  mixed.pointerDown(px(5, 20));
  t += 100;
  mixed.pointerDown(px(5, 13));
  assert.equal(mixed.maximized, false);

  t = 0;
  const fixed = make({ now: () => t, maximizable: false });
  fixed.pointerDown(px(5, 13));
  fixed.pointerUp(px(5, 13));
  t += 200;
  fixed.pointerDown(px(5, 13));
  assert.equal(fixed.maximized, false, 'a non-maximizable window ignores the double-click');
  assert.equal(fixed.dragging, null, 'but still swallows the second press');

  t = 0;
  const quick = make({ now: () => t, doubleClickMs: 100 });
  quick.pointerDown(px(5, 13));
  quick.pointerUp(px(5, 13));
  t += 150;
  quick.pointerDown(px(5, 13));
  assert.equal(quick.maximized, false, 'doubleClickMs is honoured');
});

test('drag title by 25 px at charW 8 moves 3 cols', () => {
  const w = make();
  assert.equal(w.pointerDown({ x: 12 * CHAR_W, y: 5 * LINE_H + 3 }), true);
  assert.equal(w.dragging, 'move');
  assert.equal(w.cursorAt({ x: 0, y: 0 }), 'move');
  assert.equal(w.pointerMove({ x: 12 * CHAR_W + 25, y: 5 * LINE_H + 3 }), true);
  assert.deepEqual(rectOf(w), cellRect(5, 13, 8, 20));
  assert.equal(
    w.pointerMove({ x: 12 * CHAR_W + 25, y: 5 * LINE_H + 3 }),
    false,
    'no change → false',
  );
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
