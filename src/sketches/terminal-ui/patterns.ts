// cspell:words randomart
/**
 * Weft/warp chart patterns from `terminal-charts/layered-compositions`, ported
 * to draw into a `GlyphBuffer`. The generators, layouts and glyph algorithms
 * are the original's; the only change is the drawing target: a pattern is
 * built in *local* cell coordinates (its rect at 0,0) and painted through a
 * `Surface` that translates to the window's current position, so moving a
 * window never rebuilds and resizing rebuilds for the new size.
 */
import Random from 'canvas-sketch-util/random';

import type { CellRect, GlyphBuffer } from '../../tui';

export const PLOT_ROWS = 5;

export interface PatternConfig {
  gutter: number;
  weftDensity: number;
  warpDensity: number;
  densityMix: number;
  asciiMix: number;
  randomartMix: number;
  warpAmplitude: number;
  marginRows: number;
  marginCols: number;
}

export const defaultConfig = (): PatternConfig => ({
  gutter: 1,
  weftDensity: 0.42,
  warpDensity: 0.28,
  densityMix: 0.35,
  asciiMix: 0.3,
  randomartMix: 0.25,
  warpAmplitude: 2,
  marginRows: 3,
  marginCols: 6,
});

type Bounds = {
  rowMin: number;
  rowMax: number;
  colMin: number;
  colMax: number;
};

export type WeftKind = 'line' | 'density' | 'ascii' | 'randomart';

export type RectPattern = {
  /** Local rect (always at 0,0): the window's outer size the pattern was built for. */
  rect: CellRect;
  bounds: Bounds;
  weftBuffers: number[][];
  weftKinds: WeftKind[];
  weftColors: string[];
  weftBaseRows: number[];
  weftAxisMaxes: number[];
  warpBuffers: number[][];
  warpCols: number[];
  warpColors: string[];
  warpAmplitude: number;
  plotStartCol: number;
  plotEndCol: number;
  plotStartRow: number;
  innerRows: number;
};

/**
 * Where a pattern paints: local (row, col) → glyph, plus the weft-index
 * overlay the warps consult to interleave with the wefts.
 */
interface Surface {
  put(row: number, col: number, ch: string, color: string): void;
  weftAt(row: number, col: number): number;
  setWeft(row: number, col: number, idx: number): void;
}

// ─── Generators ─────────────────────────────────────────────────────────────

function genWave(n: number, amplitude: number, periods: number): number[] {
  const p = Math.max(1, Math.round(periods));
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    return (
      amplitude *
      (0.5 + 0.4 * Math.sin(t * Math.PI * 2 * p)) *
      Random.range(0.92, 1.08)
    );
  });
}

function genTrending(n: number, start: number, end: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const s = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    return Math.max(0, (start + (end - start) * s) * Random.range(0.85, 1.15));
  });
}

function genFlat(n: number, val: number): number[] {
  return Array.from({ length: n }, () =>
    Math.max(0, val * Random.range(0.8, 1.2)),
  );
}

function genWarpWave(n: number, phase: number, periods: number): number[] {
  const p = Math.max(1, Math.round(periods));
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const primary = Math.sin(t * Math.PI * 2 * p + phase);
    const harmonic = 0.25 * Math.sin(t * Math.PI * 4 * p + phase * 1.3);
    return 0.5 + 0.45 * (primary + harmonic);
  });
}

function extendCyclic<T>(arr: T[], extra: number): T[] {
  return arr.concat(arr.slice(0, extra));
}

function inBounds(r: number, c: number, b: Bounds): boolean {
  return r >= b.rowMin && r <= b.rowMax && c >= b.colMin && c <= b.colMax;
}

// ─── Glyph drawing (verbatim algorithms; `grid` → `Surface`) ────────────────

function drawWeftSeries(
  s: Surface,
  values: number[],
  color: string,
  baseRow: number,
  plotStartCol: number,
  plotEndCol: number,
  axisMax: number,
  weftIdx: number,
  clip: Bounds,
) {
  const W = plotEndCol - plotStartCol;
  const N = values.length;
  if (W <= 1 || N < 2 || axisMax <= 0) return;
  const colAt = (i: number) => Math.round((i * (W - 1)) / (N - 1));
  const rowAt = (v: number) =>
    baseRow + Math.round((1 - Math.min(v, axisMax) / axisMax) * PLOT_ROWS);

  const cols = values.map((_, i) => colAt(i));
  const rows = values.map(rowAt);

  const mark = (r: number, c: number, ch: string) => {
    if (!inBounds(r, c, clip)) return;
    s.put(r, c, ch, color);
    s.setWeft(r, c, weftIdx);
  };

  for (let i = 0; i < N; i++) {
    const r = rows[i];
    const cEnd = i < N - 1 ? cols[i + 1] : W;
    for (let c = cols[i]; c < cEnd; c++) {
      mark(r, plotStartCol + c, '─');
    }
  }

  for (let i = 1; i < N; i++) {
    const absC = plotStartCol + cols[i];
    const r1 = rows[i - 1];
    const r2 = rows[i];
    if (r1 === r2) continue;

    const top = Math.min(r1, r2);
    const bot = Math.max(r1, r2);

    if (r2 < r1) {
      mark(r1, absC, '╯');
      mark(r2, absC, '╭');
    } else {
      mark(r1, absC, '╮');
      mark(r2, absC, '╰');
    }
    for (let r = top + 1; r < bot; r++) mark(r, absC, '│');
  }
}

function drawWarpSeries(
  s: Surface,
  values: number[],
  color: string,
  baseCol: number,
  amplitude: number,
  warpIdx: number,
  rowStart: number,
  clip: Bounds,
) {
  const H = values.length;
  if (H < 2) return;
  const cols = values.map(
    (v) => baseCol + Math.round((v - 0.5) * 2 * amplitude),
  );

  const canDraw = (r: number, c: number) => {
    if (!inBounds(r, c, clip)) return false;
    const wi = s.weftAt(r, c);
    if (wi === -1) return true;
    return (wi + warpIdx) % 2 !== 0;
  };

  const tryPut = (r: number, c: number, ch: string) => {
    if (canDraw(r, c)) s.put(r, c, ch, color);
  };

  for (let i = 0; i < H; i++) {
    const r = rowStart + i;
    const hasTransition = i > 0 && cols[i] !== cols[i - 1];
    if (hasTransition) continue;
    tryPut(r, cols[i], '│');
  }

  for (let i = 1; i < H; i++) {
    const r = rowStart + i;
    const c1 = cols[i - 1];
    const c2 = cols[i];
    if (c1 === c2) continue;

    const left = Math.min(c1, c2);
    const right = Math.max(c1, c2);

    if (c2 > c1) {
      tryPut(r, c1, '╰');
      tryPut(r, c2, '╮');
    } else {
      tryPut(r, c2, '╭');
      tryPut(r, c1, '╯');
    }
    for (let c = left + 1; c < right; c++) tryPut(r, c, '─');
  }
}

function drawDensityWeftSeries(
  s: Surface,
  values: number[],
  color: string,
  baseRow: number,
  plotStartCol: number,
  plotEndCol: number,
  axisMax: number,
  weftIdx: number,
  clip: Bounds,
) {
  const W = plotEndCol - plotStartCol;
  const N = values.length;
  if (W <= 1 || N < 2 || axisMax <= 0) return;
  const colAt = (i: number) => Math.round((i * (W - 1)) / (N - 1));
  const rowAt = (v: number) =>
    baseRow + Math.round((1 - Math.min(v, axisMax) / axisMax) * PLOT_ROWS);

  const cols = values.map((_, i) => colAt(i));
  const rows = values.map(rowAt);

  const mark = (r: number, c: number, ch: string) => {
    if (!inBounds(r, c, clip)) return;
    s.put(r, c, ch, color);
    s.setWeft(r, c, weftIdx);
  };

  const gradient = ['░', '▒', '█', '▒', '░'];
  const center = 2;

  for (let i = 0; i < N; i++) {
    const r = rows[i];
    const cEnd = i < N - 1 ? cols[i + 1] : W;
    for (let c = cols[i]; c < cEnd; c++) {
      const absC = plotStartCol + c;
      for (let d = -2; d <= 2; d++) {
        mark(r + d, absC, gradient[center + d]);
      }
    }
  }

  for (let i = 1; i < N; i++) {
    const absC = plotStartCol + cols[i];
    const r1 = rows[i - 1];
    const r2 = rows[i];
    if (r1 === r2) continue;
    const top = Math.min(r1, r2);
    const bot = Math.max(r1, r2);
    for (let r = top; r <= bot; r++) mark(r, absC, '█');
    mark(top - 1, absC, '▓');
    mark(bot + 1, absC, '▓');
  }
}

function drawAsciiWeftSeries(
  s: Surface,
  values: number[],
  color: string,
  baseRow: number,
  plotStartCol: number,
  plotEndCol: number,
  axisMax: number,
  weftIdx: number,
  clip: Bounds,
) {
  const W = plotEndCol - plotStartCol;
  const N = values.length;
  if (W <= 1 || N < 2 || axisMax <= 0) return;
  const colAt = (i: number) => Math.round((i * (W - 1)) / (N - 1));
  const rowAt = (v: number) =>
    baseRow + Math.round((1 - Math.min(v, axisMax) / axisMax) * PLOT_ROWS);

  const cols = values.map((_, i) => colAt(i));
  const rows = values.map(rowAt);

  const mark = (r: number, c: number, ch: string) => {
    if (!inBounds(r, c, clip)) return;
    s.put(r, c, ch, color);
    s.setWeft(r, c, weftIdx);
  };

  for (let i = 0; i < N; i++) {
    const r = rows[i];
    const cEnd = i < N - 1 ? cols[i + 1] : W;
    for (let c = cols[i]; c < cEnd; c++) {
      mark(r, plotStartCol + c, '=');
    }
  }

  for (let i = 1; i < N; i++) {
    const absC = plotStartCol + cols[i];
    const r1 = rows[i - 1];
    const r2 = rows[i];
    if (r1 === r2) continue;

    const top = Math.min(r1, r2);
    const bot = Math.max(r1, r2);

    mark(r1, absC, '+');
    mark(r2, absC, '+');
    for (let r = top + 1; r < bot; r++) mark(r, absC, '|');
  }
}

function drawRandomartWeftSeries(
  s: Surface,
  values: number[],
  color: string,
  baseRow: number,
  plotStartCol: number,
  plotEndCol: number,
  axisMax: number,
  weftIdx: number,
  clip: Bounds,
) {
  const W = plotEndCol - plotStartCol;
  const N = values.length;
  if (W <= 1 || N < 2 || axisMax <= 0) return;
  const H = PLOT_ROWS + 1;
  const colAt = (i: number) => Math.round((i * (W - 1)) / (N - 1));
  const rowAt = (v: number) =>
    Math.round((1 - Math.min(v, axisMax) / axisMax) * PLOT_ROWS);

  const cols = values.map((_, i) => colAt(i));
  const rows = values.map(rowAt);

  const visits: number[][] = Array.from({ length: H }, () =>
    new Array(W).fill(0),
  );

  if (rows[0] >= 0 && rows[0] < H && cols[0] >= 0 && cols[0] < W) {
    visits[rows[0]][cols[0]]++;
  }
  for (let i = 0; i < N - 1; i++) {
    const c0 = cols[i];
    const r0 = rows[i];
    const c1 = cols[i + 1];
    const r1 = rows[i + 1];
    const dc = c1 - c0;
    const dr = r1 - r0;
    const steps = Math.max(Math.abs(dc), Math.abs(dr), 1);
    for (let st = 1; st <= steps; st++) {
      const t = st / steps;
      const c = Math.round(c0 + dc * t);
      const r = Math.round(r0 + dr * t);
      if (r >= 0 && r < H && c >= 0 && c < W) visits[r][c]++;
    }
  }

  const ramp = ' .o+=*BOX@%&#/^';

  const mark = (r: number, c: number, ch: string) => {
    if (!inBounds(r, c, clip)) return;
    s.put(r, c, ch, color);
    s.setWeft(r, c, weftIdx);
  };

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const v = visits[r][c];
      if (v === 0) continue;
      const idx = Math.min(v, ramp.length - 1);
      mark(baseRow + r, plotStartCol + c, ramp[idx]);
    }
  }

  mark(baseRow + rows[0], plotStartCol + cols[0], 'S');
  mark(baseRow + rows[N - 1], plotStartCol + cols[N - 1], 'E');
}

// ─── Layouts ────────────────────────────────────────────────────────────────

export type LayoutName = 'A' | 'B' | 'C' | 'D' | 'E';
export const LAYOUT_NAMES: LayoutName[] = ['A', 'B', 'C', 'D', 'E'];

function modularGrid(ROWS: number, COLS: number) {
  const gmR = Math.max(2, Math.floor(ROWS / 18));
  const gmC = Math.max(3, Math.floor(COLS / 18));
  const mW = Math.floor((COLS - 4 * gmC) / 3);
  const mH = Math.floor((ROWS - 5 * gmR) / 4);
  return { gmR, gmC, mW, mH };
}

function cellCol(c: number, gmC: number, mW: number): number {
  return gmC + c * (mW + gmC);
}

function cellRow(r: number, gmR: number, mH: number): number {
  return gmR + r * (mH + gmR);
}

function spanCols(span: number, mW: number, gmC: number): number {
  return span * mW + (span - 1) * gmC;
}

function spanRows(span: number, mH: number, gmR: number): number {
  return span * mH + (span - 1) * gmR;
}

function layoutA(ROWS: number, COLS: number): CellRect[] {
  const { gmR, gmC, mW, mH } = modularGrid(ROWS, COLS);
  const rects: CellRect[] = [];

  const centralSpanC = Random.rangeFloor(2, 4);
  const centralSpanR = Random.rangeFloor(2, 4);
  const centralStartC = Random.rangeFloor(0, 4 - centralSpanC);
  const centralStartR = Random.rangeFloor(0, 5 - centralSpanR);
  rects.push({
    col: cellCol(centralStartC, gmC, mW),
    row: cellRow(centralStartR, gmR, mH),
    cols: spanCols(centralSpanC, mW, gmC),
    rows: spanRows(centralSpanR, mH, gmR),
  });

  const topSpanC = Random.rangeFloor(2, 4);
  const topThick = Math.max(2, Math.floor(mH * Random.range(0.25, 0.75)));
  rects.push({
    col: gmC,
    row: gmR,
    cols: spanCols(topSpanC, mW, gmC),
    rows: topThick,
  });

  const botSpanC = Random.rangeFloor(1, 3);
  const botSpanR = Random.rangeFloor(1, 3);
  rects.push({
    col: gmC,
    row: cellRow(4 - botSpanR, gmR, mH),
    cols: spanCols(botSpanC, mW, gmC),
    rows: spanRows(botSpanR, mH, gmR),
  });

  if (Random.chance(0.35)) {
    const accentSpan = Random.rangeFloor(1, 3);
    rects.push({
      col: cellCol(3 - accentSpan, gmC, mW),
      row: cellRow(3, gmR, mH),
      cols: spanCols(accentSpan, mW, gmC),
      rows: Math.max(2, Math.floor(mH * Random.range(0.3, 0.7))),
    });
  }

  return rects;
}

function layoutB(ROWS: number, COLS: number): CellRect[] {
  const { gmR, gmC, mW, mH } = modularGrid(ROWS, COLS);
  const rects: CellRect[] = [];

  const leftSpanC = Random.rangeFloor(2, 4);
  const leftSpanR = Random.rangeFloor(2, 4);
  rects.push({
    col: gmC,
    row: gmR,
    cols: spanCols(leftSpanC, mW, gmC),
    rows: spanRows(leftSpanR, mH, gmR),
  });

  const smallSpanC = Random.rangeFloor(1, 3);
  const smallSpanR = Random.rangeFloor(1, 3);
  rects.push({
    col: cellCol(3 - smallSpanC, gmC, mW),
    row: cellRow(4 - smallSpanR, gmR, mH),
    cols: spanCols(smallSpanC, mW, gmC),
    rows: spanRows(smallSpanR, mH, gmR),
  });

  const barRow = Random.rangeFloor(1, 4);
  const barThick = Math.max(2, Math.floor(gmR * Random.range(0.8, 2.2)));
  rects.push({
    col: gmC,
    row: cellRow(barRow, gmR, mH) - Math.floor(barThick / 2),
    cols: spanCols(3, mW, gmC),
    rows: barThick,
  });

  return rects;
}

function layoutC(ROWS: number, COLS: number): CellRect[] {
  const { gmR, gmC, mW, mH } = modularGrid(ROWS, COLS);
  const rects: CellRect[] = [];

  const topSpanC = Random.rangeFloor(1, 4);
  const topThick = Math.max(2, Math.floor(gmR * Random.range(0.8, 2.4)));
  rects.push({
    col: gmC,
    row: gmR,
    cols: spanCols(topSpanC, mW, gmC),
    rows: topThick,
  });

  if (topSpanC < 3 && Random.chance(0.7)) {
    rects.push({
      col: cellCol(topSpanC, gmC, mW),
      row: gmR,
      cols: spanCols(3 - topSpanC, mW, gmC),
      rows: Math.max(2, Math.floor(mH * Random.range(0.5, 1.1))),
    });
  }

  const midRow = Random.rangeFloor(1, 3);
  const cellCount = Random.rangeFloor(2, 4);
  const cellHeight = Random.rangeFloor(1, 3);
  const staggerStep = Random.chance(0.5) ? 1 : -1;
  for (let i = 0; i < cellCount; i++) {
    const slot = Math.floor((i * 3) / cellCount);
    const stagger = i % 2 === 1 ? staggerStep * Math.floor(gmR * 0.6) : 0;
    rects.push({
      col: cellCol(slot, gmC, mW),
      row: cellRow(midRow, gmR, mH) + stagger,
      cols: mW,
      rows: spanRows(cellHeight, mH, gmR),
    });
  }

  return rects;
}

function layoutD(ROWS: number, COLS: number): CellRect[] {
  const mR = Math.max(2, Math.floor(ROWS / 5));
  const mC = Math.max(3, Math.floor(COLS / 5));
  const mW = COLS - 2 * mC;
  const mH = Math.floor((ROWS - 2 * mR) / 2);
  const rects: CellRect[] = [];

  const barOffset = Random.range(0.3, 0.85);
  const barThick = Math.max(2, Math.floor(mR * Random.range(0.1, 0.3)));
  const barInset = Math.floor(mW * Random.range(0, 0.2));
  rects.push({
    col: mC + barInset,
    row: Math.max(0, Math.floor(mR * barOffset)),
    cols: Math.max(8, mW - 2 * barInset),
    rows: barThick,
  });

  const midHeight = Math.floor(mH * Random.range(0.8, 1.15));
  rects.push({
    col: mC,
    row: mR,
    cols: mW,
    rows: midHeight,
  });

  const bottomHeight = Math.floor(mH * Random.range(0.5, 1.1));
  const bottomGap = Math.floor(mH * Random.range(0.1, 0.35));
  rects.push({
    col: mC,
    row: mR + midHeight + bottomGap,
    cols: mW,
    rows: Math.max(2, bottomHeight),
  });

  return rects;
}

function layoutE(ROWS: number, COLS: number): CellRect[] {
  const mW = Math.floor(COLS / 3);
  const mH = Math.floor(ROWS / 4);
  const rects: CellRect[] = [];

  const aSpanR = Random.rangeFloor(2, 4);
  rects.push({
    col: 0,
    row: 0,
    cols: 2 * mW,
    rows: aSpanR * mH,
  });

  const bSpanR = Random.rangeFloor(2, 4);
  rects.push({
    col: mW,
    row: (4 - bSpanR) * mH,
    cols: 2 * mW,
    rows: bSpanR * mH,
  });

  const accentRow = Random.rangeFloor(1, 3);
  rects.push({
    col: mW,
    row: accentRow * mH,
    cols: 2 * mW,
    rows: Math.max(2, Math.floor(mH * Random.range(0.15, 0.4))),
  });

  return rects;
}

export function buildLayout(name: LayoutName, ROWS: number, COLS: number): CellRect[] {
  if (name === 'A') return layoutA(ROWS, COLS);
  if (name === 'B') return layoutB(ROWS, COLS);
  if (name === 'C') return layoutC(ROWS, COLS);
  if (name === 'D') return layoutD(ROWS, COLS);
  return layoutE(ROWS, COLS);
}

export function rectValid(rect: CellRect, ROWS: number, COLS: number): boolean {
  return (
    rect.rows >= 2 &&
    rect.cols >= 4 &&
    rect.row >= 0 &&
    rect.col >= 0 &&
    rect.row + rect.rows <= ROWS &&
    rect.col + rect.cols <= COLS
  );
}

/**
 * The reference's layout pass: pick (or force) a layout, inset by the
 * margins, and keep only the rects that fit inside `rows`×`cols`. Uses the
 * current `Random` state — seed it first.
 */
export function layoutRects(
  layout: LayoutName | 'auto',
  rows: number,
  cols: number,
  config: PatternConfig,
): { name: LayoutName; rects: CellRect[] } {
  const name: LayoutName = layout === 'auto' ? Random.pick(LAYOUT_NAMES) : layout;
  const mR = config.marginRows;
  const mC = config.marginCols;
  const innerROWS = Math.max(4, rows - 2 * mR);
  const innerCOLS = Math.max(8, cols - 2 * mC);
  const rects = buildLayout(name, innerROWS, innerCOLS)
    .map((r) => ({ row: r.row + mR, col: r.col + mC, rows: r.rows, cols: r.cols }))
    .filter((r) => rectValid(r, rows - mR, cols - mC) && r.row >= mR && r.col >= mC);
  return { name, rects };
}

// ─── Pattern build + draw ───────────────────────────────────────────────────

function pickWeftBuffer(bufferN: number): number[] {
  const kind = Random.rangeFloor(0, 4);
  if (kind === 0) return genFlat(bufferN, Random.rangeFloor(3, 9));
  if (kind === 1)
    return genWave(bufferN, Random.rangeFloor(5, 10), Random.rangeFloor(1, 3));
  if (kind === 2)
    return genTrending(bufferN, Random.rangeFloor(1, 5), Random.rangeFloor(5, 10));
  return genWave(bufferN, Random.rangeFloor(6, 10), Random.rangeFloor(1, 4));
}

/**
 * Build a pattern for a window of `rows`×`cols` (outer size, frame included —
 * the reference measured its gutter from the border too). Local coordinates;
 * uses the current `Random` state.
 */
export function buildPattern(
  rows: number,
  cols: number,
  palette: string[],
  bufferN: number,
  config: PatternConfig,
): RectPattern {
  const rect: CellRect = { row: 0, col: 0, rows, cols };
  const plotStartCol = rect.col + config.gutter;
  const plotEndCol = rect.col + rect.cols - config.gutter;
  const plotStartRow = rect.row + config.gutter;
  const innerRows = Math.max(1, rect.rows - config.gutter * 2);
  const innerCols = Math.max(1, plotEndCol - plotStartCol);

  const bounds: Bounds = {
    rowMin: plotStartRow,
    rowMax: plotStartRow + innerRows - 1,
    colMin: plotStartCol,
    colMax: plotEndCol - 1,
  };

  const weftCount = Math.max(
    1,
    Math.min(Math.floor(innerRows * config.weftDensity), Math.max(1, innerRows - 1)),
  );
  const warpCount = Math.max(
    1,
    Math.min(
      Math.floor(innerCols * config.warpDensity),
      Math.max(1, Math.floor(innerCols / 2)),
    ),
  );

  const weftBuffers: number[][] = [];
  const weftKinds: WeftKind[] = [];
  const localDensityMix = Random.range(
    Math.max(0, config.densityMix - 0.2),
    Math.min(1, config.densityMix + 0.2),
  );
  const localAsciiMix = Random.range(
    Math.max(0, config.asciiMix - 0.2),
    Math.min(1, config.asciiMix + 0.2),
  );
  const localRandomartMix = Random.range(
    Math.max(0, config.randomartMix - 0.2),
    Math.min(1, config.randomartMix + 0.2),
  );

  for (let i = 0; i < weftCount; i++) {
    const base = pickWeftBuffer(bufferN);
    weftBuffers.push(extendCyclic(base, bufferN));
    const roll = Random.value();
    const tAscii = localAsciiMix;
    const tDensity = tAscii + localDensityMix;
    const tRandomart = tDensity + localRandomartMix;
    let kind: WeftKind;
    if (roll < tAscii) kind = 'ascii';
    else if (roll < tDensity) kind = 'density';
    else if (roll < tRandomart) kind = 'randomart';
    else kind = 'line';
    weftKinds.push(kind);
  }

  const availRows = Math.max(0, innerRows - PLOT_ROWS - 1);
  const weftBaseRows: number[] = [];
  for (let i = 0; i < weftCount; i++) {
    const offsetRow =
      weftCount === 1
        ? Math.floor(availRows / 2)
        : Math.floor((i * availRows) / (weftCount - 1));
    weftBaseRows.push(plotStartRow + offsetRow);
  }

  const rectPalette = Random.shuffle(palette.slice()).slice(
    0,
    Math.min(palette.length, Random.rangeFloor(2, 4)),
  );
  const weftColors = Array.from(
    { length: weftCount },
    (_, i) => rectPalette[i % rectPalette.length],
  );
  const weftAxisMaxes = weftBuffers.map((b) => Math.max(...b, 1));

  const warpAmpRoom = Math.max(0, Math.floor(innerCols / warpCount / 2) - 1);
  const warpAmplitude = Math.min(config.warpAmplitude, warpAmpRoom);

  const warpBuffers: number[][] = [];
  const warpCols: number[] = [];
  const warpColors: string[] = [];
  for (let i = 0; i < warpCount; i++) {
    const phase = (i / warpCount) * Math.PI * 2 + Random.range(0, Math.PI);
    const periods = Random.rangeFloor(1, 4);
    warpBuffers.push(extendCyclic(genWarpWave(bufferN, phase, periods), innerRows));
    warpCols.push(plotStartCol + Math.round(((i + 0.5) * innerCols) / warpCount));
    warpColors.push(rectPalette[(i + 1) % rectPalette.length]);
  }

  return {
    rect,
    bounds,
    weftBuffers,
    weftKinds,
    weftColors,
    weftBaseRows,
    weftAxisMaxes,
    warpBuffers,
    warpCols,
    warpColors,
    warpAmplitude,
    plotStartCol,
    plotEndCol,
    plotStartRow,
    innerRows,
  };
}

/**
 * Paint one animation frame of `pat` into `buf`, translated so the pattern's
 * local origin lands on `origin` (the window's top-left cell). The caller
 * clips the buffer to the window's inner rect.
 */
export function drawPattern(
  buf: GlyphBuffer,
  pat: RectPattern,
  origin: { row: number; col: number },
  offset: number,
  n: number,
): void {
  const { bounds } = pat;
  const bRows = bounds.rowMax - bounds.rowMin + 1;
  const bCols = bounds.colMax - bounds.colMin + 1;
  const weftIdx = new Int16Array(Math.max(0, bRows * bCols)).fill(-1);
  const at = (r: number, c: number) => (r - bounds.rowMin) * bCols + (c - bounds.colMin);

  const surface: Surface = {
    put: (r, c, ch, color) => buf.put(origin.row + r, origin.col + c, ch, color),
    weftAt: (r, c) => weftIdx[at(r, c)],
    setWeft: (r, c, idx) => {
      weftIdx[at(r, c)] = idx;
    },
  };

  for (let i = 0; i < pat.weftBuffers.length; i++) {
    const values = pat.weftBuffers[i].slice(offset, offset + n);
    const fn =
      pat.weftKinds[i] === 'density'
        ? drawDensityWeftSeries
        : pat.weftKinds[i] === 'ascii'
          ? drawAsciiWeftSeries
          : pat.weftKinds[i] === 'randomart'
            ? drawRandomartWeftSeries
            : drawWeftSeries;
    fn(
      surface,
      values,
      pat.weftColors[i],
      pat.weftBaseRows[i],
      pat.plotStartCol,
      pat.plotEndCol,
      pat.weftAxisMaxes[i],
      i,
      bounds,
    );
  }

  for (let i = 0; i < pat.warpBuffers.length; i++) {
    const waveVals = pat.warpBuffers[i].slice(offset, offset + pat.innerRows);
    drawWarpSeries(
      surface,
      waveVals,
      pat.warpColors[i],
      pat.warpCols[i],
      pat.warpAmplitude,
      i,
      pat.plotStartRow,
      bounds,
    );
  }
}
