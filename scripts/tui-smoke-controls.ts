/**
 * Node smoke test for `src/tui/controls.ts`.
 * Run: `npx tsx scripts/tui-smoke-controls.ts` — exits non-zero on the first failure.
 */
import assert from 'node:assert/strict';

import { cellRect, createGlyphBuffer, fallbackTheme } from '../src/tui';
import {
  createButton,
  createControlHost,
  createRange,
  createToggleGroup,
  layoutControls,
  padInner,
} from '../src/tui/controls';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const dump = (buf: ReturnType<typeof createGlyphBuffer>): string[] =>
  buf.cells.map((line) => line.map((g) => g?.ch ?? '.').join(''));

const at = (row: number, col: number) => ({ row, col });
/** One row as text, empty cells as spaces. */
const rowText = (buf: ReturnType<typeof createGlyphBuffer>, row: number): string =>
  buf.cells[row].map((g) => g?.ch ?? ' ').join('');

console.log('controls');

test('range: track click at 25 % → 25 % of span (stepped)', () => {
  let seen = -1;
  // 2 rows × 15 cols: track ├ + 13 knob cells + ┤ → 12 intervals, 3/12 = 25 %.
  const rect = cellRect(0, 0, 2, 15);
  const r = createRange({
    id: 'v',
    label: 'v',
    min: 0,
    max: 100,
    value: 0,
    step: 5,
    onChange: (v) => (seen = v),
  });
  assert.deepEqual(r.track(rect), { row: 1, col0: 0, col1: 14 });
  assert.equal(r.pointerDown(at(1, 1 + 3), rect), true);
  assert.equal(r.value, 25);
  assert.equal(seen, 25);
  assert.equal(r.knobCol(rect), 4);
  r.pointerUp(at(1, 4), rect);
  // Stepping: 5/12 of 100 = 41.67 → 40.
  r.pointerDown(at(1, 1 + 5), rect);
  assert.equal(r.value, 40);
  r.pointerUp(at(1, 6), rect);
});

test('range: knob drag clamps at max and at min; release stops the drag', () => {
  const rect = cellRect(3, 2, 2, 15);
  const r = createRange({ id: 'v', label: 'v', min: -1, max: 1, value: 0 });
  assert.equal(r.knobCol(rect), 3 + 6);
  assert.equal(r.pointerDown(at(4, 9), rect), true);
  assert.equal(r.dragging, true);
  assert.equal(r.pointerMove(at(4, 60), rect), true);
  assert.equal(r.value, 1);
  assert.equal(r.knobCol(rect), 15);
  assert.equal(r.pointerMove(at(4, -20), rect), true);
  assert.equal(r.value, -1);
  assert.equal(r.cursorAt(at(4, 9), rect), 'grabbing');
  assert.equal(r.pointerUp(at(4, -20), rect), true);
  assert.equal(r.dragging, false);
  assert.equal(r.pointerMove(at(4, 9), rect), false, 'moves after release are ignored');
  assert.equal(r.value, -1);
  assert.equal(r.pointerDown(at(3, 5), rect), false, 'label row is not the track');
  assert.equal(r.cursorAt(at(4, 3), rect), 'grab');
  assert.equal(r.cursorAt(at(4, 10), rect), 'pointer');
});

test('range: draws label, tabular value and ├──●──┤ track', () => {
  const buf = createGlyphBuffer(2, 14);
  const r = createRange({ id: 'gap', label: 'gap', min: 0, max: 10, value: 5 });
  r.draw(buf, cellRect(0, 0, 2, 14), fallbackTheme, false);
  assert.deepEqual(dump(buf), ['gap...... 5.00', '├──────●─────┤']);
  const inl = createRange({
    id: 'x',
    label: 'x',
    min: 0,
    max: 1,
    value: 1,
    inline: true,
    format: (v) => v.toFixed(1),
  });
  const buf2 = createGlyphBuffer(1, 14);
  inl.draw(buf2, cellRect(0, 0, 1, 14), fallbackTheme, false);
  assert.deepEqual(dump(buf2), ['x.├─────●┤.1.0']);
  assert.equal(inl.rows(14), 1);
  assert.equal(r.rows(14), 2);
});

test('toggle: exclusive keeps exactly one active', () => {
  const calls: string[][] = [];
  const g = createToggleGroup({
    items: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ],
    exclusive: true,
    onChange: (a) => calls.push(a),
  });
  const rect = cellRect(0, 0, 3, 10);
  assert.deepEqual(g.active, ['a'], 'defaults to the first item');
  assert.equal(g.pointerDown(at(2, 0), rect), true);
  assert.deepEqual(g.active, ['c']);
  g.pointerDown(at(2, 4), rect);
  assert.deepEqual(g.active, ['c'], 're-clicking the active radio keeps it');
  assert.equal(g.setActive('c', false), false, 'cannot switch the last radio off');
  assert.deepEqual(calls, [['c']]);
  assert.equal(g.pointerDown(at(3, 0), rect), false, 'below the group');
  const buf = createGlyphBuffer(3, 6);
  g.draw(buf, rect, fallbackTheme, false);
  assert.deepEqual(dump(buf), ['( ) A.', '( ) B.', '(●) C.']);
});

test('toggle: independent items toggle on and off', () => {
  const g = createToggleGroup({
    items: [
      { id: 'grid', label: 'grid' },
      { id: 'axes', label: 'axes' },
    ],
    active: ['axes'],
  });
  const rect = cellRect(5, 1, 2, 10);
  assert.deepEqual(g.active, ['axes']);
  g.pointerDown(at(5, 1), rect);
  g.pointerDown(at(6, 3), rect);
  assert.deepEqual(g.active, ['grid']);
  assert.equal(g.cursorAt(at(6, 3), rect), 'pointer');
  assert.equal(g.cursorAt(at(7, 3), rect), null);
  const buf = createGlyphBuffer(7, 12);
  g.draw(buf, rect, fallbackTheme, false);
  assert.equal(dump(buf)[5], '.[x] grid...');
  assert.equal(dump(buf)[6], '.[ ] axes...');
});

test('button: press → release fires once; release outside does not', () => {
  let n = 0;
  const b = createButton({ id: 'go', label: 'Go', onPress: () => n++ });
  const rect = cellRect(0, 0, 1, 8);
  assert.equal(b.pointerDown(at(0, 2), rect), true);
  assert.equal(b.pressed, true);
  assert.equal(b.pointerUp(at(0, 3), rect), true);
  assert.equal(n, 1);
  assert.equal(b.pressed, false);
  b.pointerDown(at(0, 2), rect);
  assert.equal(b.pointerMove(at(2, 2), rect), true, 'leaving the button un-highlights it');
  b.pointerUp(at(2, 2), rect);
  assert.equal(n, 1, 'released outside → no press');
  assert.equal(b.pointerUp(at(0, 2), rect), false, 'no press in flight');
  assert.equal(b.pointerDown(at(0, 9), rect), false, 'outside the rect');
  const buf = createGlyphBuffer(1, 8);
  b.draw(buf, rect, fallbackTheme, false);
  assert.deepEqual(dump(buf), ['[ Go ]..']);
  b.pointerDown(at(0, 0), rect);
  b.draw(buf, rect, fallbackTheme, true);
  assert.equal(buf.get(0, 0)?.bg, fallbackTheme.fg, 'reverse video while pressed');
  assert.equal(buf.get(0, 0)?.fg, fallbackTheme.bg);
});

test('layout: [button, 3 toggles, range] in 12 rows → non-overlapping with 1-row gaps', () => {
  const controls = [
    createButton({ id: 'b', label: 'B' }),
    createToggleGroup({
      items: [
        { id: '1', label: '1' },
        { id: '2', label: '2' },
        { id: '3', label: '3' },
      ],
    }),
    createRange({ id: 'r', label: 'r', min: 0, max: 1, value: 0 }),
  ];
  const rects = layoutControls(controls, cellRect(2, 3, 12, 20));
  assert.deepEqual(rects, [
    { row: 2, col: 3, rows: 1, cols: 20 },
    { row: 4, col: 3, rows: 3, cols: 20 },
    { row: 8, col: 3, rows: 2, cols: 20 },
  ]);
  for (let i = 1; i < rects.length; i++) {
    assert.equal(rects[i].row, rects[i - 1].row + rects[i - 1].rows + 1);
  }
});

test('layout: overflow is clipped, hidden controls get rows 0', () => {
  const controls = [
    createRange({ id: 'a', label: 'a', min: 0, max: 1, value: 0 }),
    createRange({ id: 'b', label: 'b', min: 0, max: 1, value: 0 }),
    createButton({ id: 'c', label: 'c' }),
  ];
  const rects = layoutControls(controls, cellRect(0, 0, 4, 10));
  assert.deepEqual(
    rects.map((r) => [r.row, r.rows]),
    [
      [0, 2],
      [3, 1],
      [4, 0],
    ],
  );
});

test('layout: padding insets the controls; a padded host lays out and hit-tests the same way', () => {
  const controls = [
    createButton({ id: 'b', label: 'B' }),
    createRange({ id: 'r', label: 'r', min: 0, max: 1, value: 0 }),
  ];
  const inner = cellRect(2, 3, 10, 20);
  assert.deepEqual(layoutControls(controls, inner, { rows: 1, cols: 2 }), [
    { row: 3, col: 5, rows: 1, cols: 16 },
    { row: 5, col: 5, rows: 2, cols: 16 },
  ]);
  assert.deepEqual(
    layoutControls(controls, inner, 1),
    layoutControls(controls, inner, { rows: 1, cols: 1 }),
  );
  assert.deepEqual(layoutControls(controls, inner), layoutControls(controls, inner, 0));
  // Padding larger than the rect collapses to an empty content area, never negative.
  assert.deepEqual(padInner(cellRect(0, 0, 2, 4), { rows: 3, cols: 5 }), cellRect(3, 5, 0, 0));
  assert.ok(layoutControls(controls, cellRect(0, 0, 2, 4), 3).every((r) => r.rows === 0));

  let pressed = 0;
  const btn = createButton({ id: 'p', label: 'Go', onPress: () => pressed++ });
  const host = createControlHost([btn], { rows: 1, cols: 2 });
  const buf = createGlyphBuffer(12, 24);
  host.draw(buf, inner, fallbackTheme);
  assert.equal(rowText(buf, 3).slice(5, 11), '[ Go ]', 'drawn inside the padding');
  assert.equal(rowText(buf, 2).trim(), '', 'padding row stays blank');
  assert.equal(host.pointerDown(at(2, 3), inner), false, 'the padding is not part of the button');
  assert.equal(host.pointerDown(at(3, 6), inner), true);
  assert.equal(host.pointerUp(at(3, 6), inner), true);
  assert.equal(pressed, 1);
  assert.equal(host.cursorAt(at(3, 6), inner), 'pointer');
  assert.equal(host.cursorAt(at(3, 4), inner), null);
});

test('host: routes down/move/up to the hit control, tracks hover, clips drawing', () => {
  let pressed = 0;
  const btn = createButton({ id: 'b', label: 'Run', onPress: () => pressed++ });
  const rng = createRange({ id: 'r', label: 'r', min: 0, max: 100, value: 0 });
  const host = createControlHost([btn, rng]);
  const inner = cellRect(1, 1, 6, 15);
  // Layout: button row 1; range rows 3–4 (track on row 4, cols 1..15).
  assert.equal(host.pointerDown(at(1, 2), inner), true);
  assert.equal(host.pointerUp(at(1, 2), inner), true);
  assert.equal(pressed, 1);
  assert.equal(host.pointerDown(at(4, 15), inner), true);
  assert.equal(rng.value, 100);
  assert.equal(host.pointerMove(at(4, 1), inner), true, 'captured range follows the drag');
  assert.equal(rng.value, 0);
  assert.equal(host.cursorAt(at(1, 2), inner), 'grabbing', 'captured control owns the cursor');
  host.pointerUp(at(4, 1), inner);
  assert.equal(host.pointerDown(at(2, 2), inner), false, 'gap row hits nothing');
  assert.equal(host.pointerMove(at(1, 3), inner), true, 'hover enters the button');
  assert.equal(host.pointerMove(at(1, 4), inner), false, 'still hovering the same control');
  assert.equal(host.pointerMove(at(2, 4), inner), true, 'hover leaves');
  assert.equal(host.cursorAt(at(1, 3), inner), 'pointer');
  assert.equal(host.cursorAt(at(2, 3), inner), null);
  const buf = createGlyphBuffer(8, 17);
  host.draw(buf, cellRect(1, 1, 2, 15), fallbackTheme);
  const lines = dump(buf);
  assert.equal(lines[1], '.[ Run ].........');
  assert.equal(lines[3], '.................', 'range outside the 2-row inner is clipped away');
});

console.log(`\n${passed} tests passed`);
