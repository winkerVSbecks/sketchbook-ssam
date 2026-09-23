/**
 * Node smoke test for `src/sketches/terminal-ui/viewport.ts`.
 * Run: `npx tsx scripts/growth-viewport-smoke.ts` — exits non-zero on the first failure.
 */
import assert from 'node:assert/strict';

import {
  cellRect,
  createGlyphBuffer,
  createMetrics,
  fallbackTheme,
  type TuiTheme,
} from '../src/tui';
import {
  createViewport,
  drawGrowth,
  growthBounds,
  lineGlyphForMask,
  shadeForCount,
  walkCellLine,
  DEFAULT_CELL_ASPECT,
  cellAspectFromMetrics,
  type GrowthState,
} from '../src/sketches/terminal-ui/viewport';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const buffer = (rows: number, cols: number) => createGlyphBuffer(rows, cols);
const dump = (buf: ReturnType<typeof createGlyphBuffer>): string[] =>
  buf.cells.map((line) => line.map((g) => g?.ch ?? '.').join(''));
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

/** A square loop centred on the origin, side `2 * r`. */
const square = (r: number): GrowthState => ({
  nodes: [
    { x: -r, y: -r },
    { x: r, y: -r },
    { x: r, y: r },
    { x: -r, y: r },
  ],
  closed: true,
  step: 0,
});

console.log('growth viewport');

// ─── Transform ───────────────────────────────────────────────────────────────

test('world ↔ cell round-trips at a fractional cell aspect', () => {
  const aspect = cellAspectFromMetrics(createMetrics(null, { charW: 8.4028 }));
  const vp = createViewport({
    center: { x: 12.3, y: -4.7 },
    zoom: 3.7,
    unitsPerCell: 2.5,
    cellAspect: aspect,
  });
  const rect = cellRect(3, 5, 11, 29);
  for (const p of [
    { x: 12.3, y: -4.7 },
    { x: 0, y: 0 },
    { x: -137.25, y: 88.125 },
    { x: 1e-4, y: -1e-4 },
  ]) {
    const c = vp.worldToCell(p, rect);
    const back = vp.cellToWorld(c, rect);
    close(back.x, p.x, 1e-9);
    close(back.y, p.y, 1e-9);
  }
  // A cell round-trips too, fraction and all.
  const c = { col: 9.25, row: 6.75 };
  const rt = vp.worldToCell(vp.cellToWorld(c, rect), rect);
  close(rt.col, c.col, 1e-9);
  close(rt.row, c.row, 1e-9);
  // Rows span `cellAspect` times the world a column spans, so nothing is squashed.
  close(vp.worldPerRow, vp.worldPerCol * aspect, 1e-12);
  close(vp.worldPerCol, 2.5 / 3.7, 1e-12);
});

test('the centre of the rect is the centre of the view; visibleRect covers it', () => {
  const vp = createViewport({ center: { x: 4, y: -2 }, zoom: 2, cellAspect: 1 });
  const rect = cellRect(0, 0, 10, 20);
  const c = vp.worldToCell({ x: 4, y: -2 }, rect);
  close(c.col, 10);
  close(c.row, 5);
  const view = vp.visibleRect(rect);
  close(view.w, 20 * 0.5);
  close(view.h, 10 * 0.5);
  close(view.x, 4 - 5);
  close(view.y, -2 - 2.5);
  assert.equal(DEFAULT_CELL_ASPECT > 2 && DEFAULT_CELL_ASPECT < 2.5, true);
});

test('pan moves the view by whole cells of world', () => {
  const vp = createViewport({ center: { x: 0, y: 0 }, zoom: 1, unitsPerCell: 2, cellAspect: 3 });
  const rect = cellRect(0, 0, 9, 9);
  const before = vp.worldToCell({ x: 0, y: 0 }, rect);
  vp.pan(3, -2);
  close(vp.center.x, 6);
  close(vp.center.y, -12);
  const after = vp.worldToCell({ x: 0, y: 0 }, rect);
  close(after.col, before.col - 3);
  close(after.row, before.row + 2);
});

test('zoomBy keeps the world point under the anchor cell fixed (and clamps)', () => {
  const vp = createViewport({
    center: { x: 1, y: 1 },
    zoom: 1,
    cellAspect: DEFAULT_CELL_ASPECT,
    minZoom: 0.25,
    maxZoom: 64,
  });
  const rect = cellRect(2, 4, 13, 31);
  const anchor = { col: 7.25, row: 4.5 };
  const pinned = vp.cellToWorld(anchor, rect);
  vp.zoomBy(2.5, anchor, rect);
  close(vp.zoom, 2.5);
  let now = vp.cellToWorld(anchor, rect);
  close(now.x, pinned.x, 1e-9);
  close(now.y, pinned.y, 1e-9);
  // Clamped at the top: the anchor is still honoured for the zoom actually taken.
  vp.zoomBy(1e6, anchor, rect);
  close(vp.zoom, 64);
  now = vp.cellToWorld(anchor, rect);
  close(now.x, pinned.x, 1e-9);
  close(now.y, pinned.y, 1e-9);
  vp.zoomBy(1e-9, anchor, rect);
  close(vp.zoom, 0.25);
  // Without an anchor the centre stays put.
  const c = { x: vp.center.x, y: vp.center.y };
  vp.zoomBy(2);
  close(vp.zoom, 0.5);
  close(vp.center.x, c.x);
  close(vp.center.y, c.y);
  vp.setZoom(1e9);
  close(vp.zoom, 64);
});

test('fit frames a world rect inside the cell rect', () => {
  const vp = createViewport({ cellAspect: 2 });
  const rect = cellRect(0, 0, 10, 40);
  vp.fit({ x: 10, y: 20, w: 8, h: 4 }, rect);
  close(vp.center.x, 14);
  close(vp.center.y, 22);
  const view = vp.visibleRect(rect);
  assert.ok(view.w >= 8 - 1e-9 && view.h >= 4 - 1e-9, 'the world fits');
  assert.ok(Math.min(view.w / 8, view.h / 4) < 1.001, 'and is not left tiny inside it');
});

// ─── Segment walking ─────────────────────────────────────────────────────────

test('walkCellLine leaves no gaps: every step is 8-adjacent', () => {
  const lines: [number, number, number, number][] = [
    [0, 0, 9, 3],
    [0, 0, 3, 9],
    [9, 3, 0, 0],
    [-4, -7, 6, 2],
    [2, 5, 2, 12],
    [5, 2, 12, 2],
    [0, 0, 0, 0],
  ];
  for (const [r0, c0, r1, c1] of lines) {
    const seen: [number, number][] = [];
    walkCellLine({ row: r0 + 0.5, col: c0 + 0.5 }, { row: r1 + 0.5, col: c1 + 0.5 }, (row, col) =>
      seen.push([row, col]),
    );
    assert.deepEqual(seen[0], [r0, c0], 'starts on the first cell');
    assert.deepEqual(seen[seen.length - 1], [r1, c1], 'ends on the last cell');
    for (let i = 1; i < seen.length; i++) {
      const dr = Math.abs(seen[i][0] - seen[i - 1][0]);
      const dc = Math.abs(seen[i][1] - seen[i - 1][1]);
      assert.equal(Math.max(dr, dc), 1, `gap between ${seen[i - 1]} and ${seen[i]}`);
      assert.ok(dr + dc > 0, 'no repeated cell');
    }
    assert.equal(
      seen.length,
      Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0)) + 1,
      'one cell per step of the long axis',
    );
  }
  // A perfect diagonal is a staircase of single diagonal steps.
  const diag: [number, number][] = [];
  walkCellLine({ row: 0, col: 0 }, { row: 4, col: 4 }, (row, col) => diag.push([row, col]));
  assert.deepEqual(diag, [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
  ]);
  // Non-finite coordinates are ignored rather than looping forever.
  let calls = 0;
  walkCellLine({ row: NaN, col: 0 }, { row: 3, col: 3 }, () => calls++);
  walkCellLine({ row: 0, col: 0 }, { row: Infinity, col: 3 }, () => calls++);
  assert.equal(calls, 0);
});

// ─── Density and glyph choice ────────────────────────────────────────────────

test('density buckets pick the expected shade', () => {
  assert.equal(shadeForCount(0), '');
  assert.equal(shadeForCount(-3), '');
  assert.equal(shadeForCount(1), '░');
  assert.equal(shadeForCount(2), '▒');
  assert.equal(shadeForCount(3), '▒');
  assert.equal(shadeForCount(4), '▓');
  assert.equal(shadeForCount(7), '▓');
  assert.equal(shadeForCount(8), '█');
  assert.equal(shadeForCount(99), '█');
  assert.equal(shadeForCount(3, [1, 3, 5, 7]), '▒');
  assert.equal(shadeForCount(6, [1, 3, 5, 7]), '▓');
});

test('line glyphs follow the direction through the cell', () => {
  assert.equal(lineGlyphForMask(1), '─');
  assert.equal(lineGlyphForMask(2), '│');
  assert.equal(lineGlyphForMask(4), '╲');
  assert.equal(lineGlyphForMask(8), '╱');
  assert.equal(lineGlyphForMask(16), '·');
  assert.equal(lineGlyphForMask(1 | 2), '┼', 'a crossing');
  assert.equal(lineGlyphForMask(1 | 16), '─', 'a line beats a degenerate point');
});

// ─── Drawing ─────────────────────────────────────────────────────────────────

test('detail mode draws the line in box glyphs and marks the nodes', () => {
  const vp = createViewport({ zoom: 1, cellAspect: 1 });
  const rect = cellRect(0, 0, 9, 9);
  const buf = buffer(9, 9);
  const res = drawGrowth(
    buf,
    rect,
    {
      nodes: [
        { x: -2, y: 0 },
        { x: 2, y: 0 },
      ],
      closed: false,
      step: 3,
    },
    vp,
    fallbackTheme,
  );
  assert.equal(res.mode, 'detail');
  assert.equal(res.nodesDrawn, 2);
  assert.equal(res.cellsDrawn, 5);
  assert.equal(res.maxCount, 1);
  close(res.segmentCells, 4);
  assert.equal(dump(buf)[4], '..●───●..');

  const vbuf = buffer(9, 9);
  drawGrowth(
    vbuf,
    rect,
    {
      nodes: [
        { x: 0, y: -2 },
        { x: 0, y: 2 },
      ],
      closed: false,
      step: 3,
    },
    vp,
    fallbackTheme,
  );
  assert.deepEqual(
    dump(vbuf).map((l) => l[4]),
    ['.', '.', '●', '│', '│', '│', '●', '.', '.'],
  );

  const dbuf = buffer(9, 9);
  drawGrowth(
    dbuf,
    rect,
    {
      nodes: [
        { x: -2, y: -2 },
        { x: 2, y: 2 },
      ],
      closed: false,
      step: 3,
    },
    vp,
    fallbackTheme,
  );
  const diag = dump(dbuf);
  assert.equal(diag[2][2], '●');
  assert.equal(diag[3][3], '╲');
  assert.equal(diag[6][6], '●');
  const dbuf2 = buffer(9, 9);
  drawGrowth(
    dbuf2,
    rect,
    {
      nodes: [
        { x: -2, y: 2 },
        { x: 2, y: -2 },
      ],
      closed: false,
      step: 3,
    },
    vp,
    fallbackTheme,
  );
  assert.equal(dump(dbuf2)[3][5], '╱');
});

test('zoom changes what is visible: density at 1×, resolved nodes at 16×', () => {
  const state = square(2);
  const rect = cellRect(0, 0, 21, 21);
  const lowBuf = buffer(21, 21);
  const low = createViewport({ zoom: 0.1, cellAspect: 1 });
  const lowRes = drawGrowth(lowBuf, rect, state, low, fallbackTheme);
  assert.equal(lowRes.mode, 'density', 'the whole organism inside one cell reads as density');
  assert.equal(lowRes.cellsDrawn, 1);
  assert.equal(lowRes.maxCount, 4, 'four segments land in the same cell');
  assert.equal(lowRes.nodesDrawn, 0);
  assert.equal(lowBuf.get(10, 10)?.ch, '▓', 'four hits → the third shade step');

  const highBuf = buffer(21, 21);
  const high = createViewport({ zoom: 4, cellAspect: 1 });
  const highRes = drawGrowth(highBuf, rect, state, high, fallbackTheme);
  assert.equal(highRes.mode, 'detail');
  assert.ok(highRes.cellsDrawn > 40, `the same loop now spans ${highRes.cellsDrawn} cells`);
  assert.equal(highRes.nodesDrawn, 4, 'every corner node is marked');
  assert.equal(highBuf.get(2, 2)?.ch, '●', 'the top-left corner node');
  assert.equal(highBuf.get(2, 10)?.ch, '─', 'the top edge between nodes');
  assert.equal(highBuf.get(10, 2)?.ch, '│', 'the left edge');

  // Same feature, two distances: the top-left corner sits at the same world
  // point in both views, and the 16× view resolves it into separate cells.
  const corner = { x: -2, y: -2 };
  close(low.worldToCell(corner, rect).col, 10.3);
  close(high.worldToCell(corner, rect).col, 2.5);

  const densityForced = buffer(21, 21);
  const forced = drawGrowth(densityForced, rect, state, high, fallbackTheme, { mode: 'density' });
  assert.equal(forced.mode, 'density');
  assert.equal(forced.nodesDrawn, 0);
  assert.equal(densityForced.get(2, 10)?.ch, '░', 'one hit → the lightest shade');
});

test('drawing never writes outside the rect it was given', () => {
  const buf = buffer(14, 18);
  const rect = cellRect(3, 4, 5, 7);
  const vp = createViewport({ zoom: 50, cellAspect: 1 });
  // Segments hundreds of thousands of cells long, crossing the little rect.
  const state: GrowthState = {
    nodes: [
      { x: -1e4, y: -1e4 },
      { x: 1e4, y: 1e4 },
      { x: 1e4, y: -1e4 },
    ],
    closed: true,
    step: 9,
  };
  const started = Date.now();
  const res = drawGrowth(buf, rect, state, vp, fallbackTheme);
  assert.ok(Date.now() - started < 1000, 'off-screen length is clipped, not walked');
  assert.ok(res.cellsDrawn > 0, 'something was drawn');
  for (let row = 0; row < buf.rows; row++) {
    for (let col = 0; col < buf.cols; col++) {
      if (!buf.get(row, col)) continue;
      const inside =
        row >= rect.row &&
        row < rect.row + rect.rows &&
        col >= rect.col &&
        col < rect.col + rect.cols;
      assert.ok(inside, `wrote outside the rect at ${row},${col}`);
    }
  }
  // An outer clip still wins, and a segment a million cells long is clipped
  // before it is walked rather than looping over it.
  const clipped = buffer(14, 18);
  const tiny = cellRect(5, 4, 1, 3); // the row the y = 0 line lands on
  clipped.clip(tiny, () => {
    drawGrowth(
      clipped,
      rect,
      {
        nodes: [
          { x: -1e5, y: 0 },
          { x: 1e5, y: 0 },
        ],
        closed: false,
        step: 1,
      },
      createViewport({ zoom: 50, cellAspect: 1 }),
      fallbackTheme,
    );
  });
  const written = dump(clipped)
    .flatMap((line, row) => [...line].map((ch, col) => (ch === '.' ? null : { row, col })))
    .filter(Boolean) as { row: number; col: number }[];
  assert.ok(written.length > 0);
  for (const w of written) {
    assert.equal(w.row, 5);
    assert.ok(w.col >= 4 && w.col < 7, `outside the outer clip at ${w.row},${w.col}`);
  }
  // An empty rect and an empty state are both no-ops.
  const empty = buffer(6, 6);
  drawGrowth(empty, cellRect(0, 0, 0, 4), square(1), vp, fallbackTheme);
  drawGrowth(empty, cellRect(0, 0, 6, 6), { nodes: [], closed: true, step: 0 }, vp, fallbackTheme);
  assert.deepEqual(dump(empty), Array(6).fill('......'));
});

test('colour comes from the theme, not from the module', () => {
  const theme: TuiTheme = { ...fallbackTheme, fg: '#101010', accent: '#909090' };
  const rect = cellRect(0, 0, 9, 9);
  const buf = buffer(9, 9);
  const vp = createViewport({ zoom: 1, cellAspect: 1 });
  drawGrowth(
    buf,
    rect,
    {
      nodes: [
        { x: -2, y: 0 },
        { x: 2, y: 0 },
      ],
      closed: false,
      step: 0,
    },
    vp,
    theme,
  );
  assert.equal(buf.get(4, 3)?.fg, '#101010', 'the curve takes theme.fg');
  assert.equal(buf.get(4, 2)?.fg, '#909090', 'node marks take theme.accent');
  assert.equal(buf.get(4, 3)?.bg, undefined, 'no background unless asked for');

  const over = buffer(9, 9);
  drawGrowth(
    over,
    rect,
    {
      nodes: [
        { x: -2, y: 0 },
        { x: 2, y: 0 },
      ],
      closed: false,
      step: 0,
    },
    vp,
    theme,
    {
      color: theme.dim,
      nodeColor: theme.frameActive,
      nodeChar: '◆',
      bg: theme.chromeBg,
    },
  );
  assert.equal(over.get(4, 3)?.fg, theme.dim);
  assert.equal(over.get(4, 3)?.bg, theme.chromeBg);
  assert.equal(over.get(4, 2)?.ch, '◆');
  assert.equal(over.get(4, 2)?.fg, theme.frameActive);
});

test('a single node still marks its cell; growthBounds measures the organism', () => {
  const buf = buffer(9, 9);
  const vp = createViewport({ zoom: 1, cellAspect: 1 });
  const res = drawGrowth(
    buf,
    cellRect(0, 0, 9, 9),
    { nodes: [{ x: 0, y: 0 }], closed: false, step: 0 },
    vp,
    fallbackTheme,
    { mode: 'detail' },
  );
  assert.equal(res.cellsDrawn, 1);
  assert.equal(res.nodesDrawn, 1);
  assert.equal(buf.get(4, 4)?.ch, '●');

  assert.deepEqual(growthBounds(square(3)), { x: -3, y: -3, w: 6, h: 6 });
  assert.deepEqual(growthBounds({ nodes: [], closed: true, step: 0 }), { x: 0, y: 0, w: 0, h: 0 });
  assert.deepEqual(
    growthBounds({
      nodes: [
        { x: 1, y: 2 },
        { x: NaN, y: 9 },
      ],
      closed: false,
      step: 0,
    }),
    { x: 1, y: 2, w: 0, h: 0 },
  );
});

console.log(`\n${passed} tests passed`);
