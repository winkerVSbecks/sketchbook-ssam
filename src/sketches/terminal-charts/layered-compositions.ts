// cspell:words randomart
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { randomPalette } from '../../colors';

const FONT_SIZE = 14;
const FONT = `${FONT_SIZE}px 'Menlo', 'Monaco', 'DejaVu Sans Mono', monospace`;
const LINE_H = 20;
const PLOT_ROWS = 5;

const config = {
  gutter: 1,
  weftDensity: 0.42,
  warpDensity: 0.28,
  densityMix: 0.35,
  asciiMix: 0.3,
  randomartMix: 0.25,
  warpAmplitude: 2,
  marginRows: 3,
  marginCols: 6,
};

const pane = new Pane() as any;
if (pane.containerElem_) pane.containerElem_.style.zIndex = '1';
pane.addBinding(config, 'gutter', { min: 0, max: 4, step: 1 });
pane.addBinding(config, 'weftDensity', { min: 0.1, max: 1, step: 0.01 });
pane.addBinding(config, 'warpDensity', { min: 0.05, max: 0.8, step: 0.01 });
pane.addBinding(config, 'densityMix', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'asciiMix', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'randomartMix', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'warpAmplitude', { min: 0, max: 5, step: 1 });
pane.addBinding(config, 'marginRows', { min: 0, max: 12, step: 1 });
pane.addBinding(config, 'marginCols', { min: 0, max: 16, step: 1 });

type Cell = { char: string; color: string };
type Grid = (Cell | null)[][];
type Rect = { row: number; col: number; rows: number; cols: number };
type Bounds = {
  rowMin: number;
  rowMax: number;
  colMin: number;
  colMax: number;
};

type WeftKind = 'line' | 'density' | 'ascii' | 'randomart';

type RectPattern = {
  rect: Rect;
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
  weftIdxBase: number;
  borderColor: string;
};

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

function makeGrid(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null as Cell | null),
  );
}

function inBounds(r: number, c: number, b: Bounds): boolean {
  return r >= b.rowMin && r <= b.rowMax && c >= b.colMin && c <= b.colMax;
}

function put(
  grid: Grid,
  row: number,
  col: number,
  char: string,
  color: string,
  clip: Bounds,
) {
  if (!inBounds(row, col, clip)) return;
  if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return;
  grid[row][col] = { char, color };
}

function drawWeftSeries(
  grid: Grid,
  values: number[],
  color: string,
  baseRow: number,
  plotStartCol: number,
  plotEndCol: number,
  axisMax: number,
  weftIdxGrid: number[][],
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
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    grid[r][c] = { char: ch, color };
    weftIdxGrid[r][c] = weftIdx;
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
  grid: Grid,
  values: number[],
  color: string,
  baseCol: number,
  amplitude: number,
  warpIdx: number,
  rowStart: number,
  weftIdxGrid: number[][],
  clip: Bounds,
) {
  const H = values.length;
  if (H < 2) return;
  const cols = values.map(
    (v) => baseCol + Math.round((v - 0.5) * 2 * amplitude),
  );

  const canDraw = (r: number, c: number) => {
    if (!inBounds(r, c, clip)) return false;
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return false;
    const wi = weftIdxGrid[r][c];
    if (wi === -1) return true;
    return (wi + warpIdx) % 2 !== 0;
  };

  const tryPut = (r: number, c: number, ch: string) => {
    if (canDraw(r, c)) put(grid, r, c, ch, color, clip);
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
  grid: Grid,
  values: number[],
  color: string,
  baseRow: number,
  plotStartCol: number,
  plotEndCol: number,
  axisMax: number,
  weftIdxGrid: number[][],
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
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    grid[r][c] = { char: ch, color };
    weftIdxGrid[r][c] = weftIdx;
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
  grid: Grid,
  values: number[],
  color: string,
  baseRow: number,
  plotStartCol: number,
  plotEndCol: number,
  axisMax: number,
  weftIdxGrid: number[][],
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
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    grid[r][c] = { char: ch, color };
    weftIdxGrid[r][c] = weftIdx;
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
  grid: Grid,
  values: number[],
  color: string,
  baseRow: number,
  plotStartCol: number,
  plotEndCol: number,
  axisMax: number,
  weftIdxGrid: number[][],
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
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const c = Math.round(c0 + dc * t);
      const r = Math.round(r0 + dr * t);
      if (r >= 0 && r < H && c >= 0 && c < W) visits[r][c]++;
    }
  }

  const ramp = ' .o+=*BOX@%&#/^';

  const mark = (r: number, c: number, ch: string) => {
    if (!inBounds(r, c, clip)) return;
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    grid[r][c] = { char: ch, color };
    weftIdxGrid[r][c] = weftIdx;
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

function drawRectBorder(grid: Grid, rect: Rect, color: string) {
  const r0 = rect.row;
  const r1 = rect.row + rect.rows - 1;
  const c0 = rect.col;
  const c1 = rect.col + rect.cols - 1;
  if (r1 <= r0 || c1 <= c0) return;

  const setCell = (r: number, c: number, ch: string) => {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    grid[r][c] = { char: ch, color };
  };

  for (let c = c0 + 1; c < c1; c++) {
    setCell(r0, c, '─');
    setCell(r1, c, '─');
  }
  for (let r = r0 + 1; r < r1; r++) {
    setCell(r, c0, '│');
    setCell(r, c1, '│');
  }
  setCell(r0, c0, '┌');
  setCell(r0, c1, '┐');
  setCell(r1, c0, '└');
  setCell(r1, c1, '┘');
}

type LayoutName = 'A' | 'B' | 'C' | 'D' | 'E';

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

function layoutA(ROWS: number, COLS: number): Rect[] {
  const { gmR, gmC, mW, mH } = modularGrid(ROWS, COLS);
  const rects: Rect[] = [];

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
  const topThick = Math.max(
    2,
    Math.floor(mH * Random.range(0.25, 0.75)),
  );
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

function layoutB(ROWS: number, COLS: number): Rect[] {
  const { gmR, gmC, mW, mH } = modularGrid(ROWS, COLS);
  const rects: Rect[] = [];

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
  const barThick = Math.max(
    2,
    Math.floor(gmR * Random.range(0.8, 2.2)),
  );
  rects.push({
    col: gmC,
    row: cellRow(barRow, gmR, mH) - Math.floor(barThick / 2),
    cols: spanCols(3, mW, gmC),
    rows: barThick,
  });

  return rects;
}

function layoutC(ROWS: number, COLS: number): Rect[] {
  const { gmR, gmC, mW, mH } = modularGrid(ROWS, COLS);
  const rects: Rect[] = [];

  const topSpanC = Random.rangeFloor(1, 4);
  const topThick = Math.max(
    2,
    Math.floor(gmR * Random.range(0.8, 2.4)),
  );
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

function layoutD(ROWS: number, COLS: number): Rect[] {
  const mR = Math.max(2, Math.floor(ROWS / 5));
  const mC = Math.max(3, Math.floor(COLS / 5));
  const mW = COLS - 2 * mC;
  const mH = Math.floor((ROWS - 2 * mR) / 2);
  const rects: Rect[] = [];

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

function layoutE(ROWS: number, COLS: number): Rect[] {
  const mW = Math.floor(COLS / 3);
  const mH = Math.floor(ROWS / 4);
  const rects: Rect[] = [];

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

function buildLayout(name: LayoutName, ROWS: number, COLS: number): Rect[] {
  if (name === 'A') return layoutA(ROWS, COLS);
  if (name === 'B') return layoutB(ROWS, COLS);
  if (name === 'C') return layoutC(ROWS, COLS);
  if (name === 'D') return layoutD(ROWS, COLS);
  return layoutE(ROWS, COLS);
}

function rectValid(rect: Rect, ROWS: number, COLS: number): boolean {
  return (
    rect.rows >= 2 &&
    rect.cols >= 4 &&
    rect.row >= 0 &&
    rect.col >= 0 &&
    rect.row + rect.rows <= ROWS &&
    rect.col + rect.cols <= COLS
  );
}

function pickWeftBuffer(bufferN: number): number[] {
  const kind = Random.rangeFloor(0, 4);
  if (kind === 0) return genFlat(bufferN, Random.rangeFloor(3, 9));
  if (kind === 1)
    return genWave(bufferN, Random.rangeFloor(5, 10), Random.rangeFloor(1, 3));
  if (kind === 2)
    return genTrending(
      bufferN,
      Random.rangeFloor(1, 5),
      Random.rangeFloor(5, 10),
    );
  return genWave(bufferN, Random.rangeFloor(6, 10), Random.rangeFloor(1, 4));
}

function buildPattern(
  rect: Rect,
  palette: string[],
  bufferN: number,
  weftIdxBase: number,
): RectPattern {
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
    Math.min(
      Math.floor(innerRows * config.weftDensity),
      Math.max(1, innerRows - 1),
    ),
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
    warpCols.push(
      plotStartCol + Math.round(((i + 0.5) * innerCols) / warpCount),
    );
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
    weftIdxBase,
    borderColor: rectPalette[0],
  };
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const seed = Random.getRandomSeed();
  Random.setSeed(seed);

  const rawPalette = randomPalette();
  const BG = rawPalette[0];
  const PALETTE =
    rawPalette.length > 1 ? rawPalette.slice(1) : rawPalette.slice();

  context.font = FONT;
  const charW = context.measureText('M').width;
  const COLS = Math.floor(width / charW);
  const ROWS = Math.floor(height / LINE_H);

  const N = 64;
  const BUFFER_N = N + 16;

  let patterns: RectPattern[] = [];

  const rebuild = () => {
    Random.setSeed(seed);
    const layoutName = Random.pick([
      'A',
      'B',
      'C',
      'D',
      'E',
    ] as LayoutName[]);
    const mR = config.marginRows;
    const mC = config.marginCols;
    const innerROWS = Math.max(4, ROWS - 2 * mR);
    const innerCOLS = Math.max(8, COLS - 2 * mC);
    const rects = buildLayout(layoutName, innerROWS, innerCOLS)
      .map((r) => ({
        row: r.row + mR,
        col: r.col + mC,
        rows: r.rows,
        cols: r.cols,
      }))
      .filter((r) => rectValid(r, ROWS - mR, COLS - mC) && r.row >= mR && r.col >= mC);
    let weftIdxCursor = 0;
    patterns = rects.map((rect) => {
      const pat = buildPattern(rect, PALETTE, BUFFER_N, weftIdxCursor);
      weftIdxCursor += pat.weftBuffers.length;
      return pat;
    });
  };

  rebuild();
  pane.on('change', rebuild);

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    const offset = Math.floor(playhead * BUFFER_N) % BUFFER_N;

    const grid = makeGrid(ROWS, COLS);
    const weftIdxGrid = Array.from({ length: ROWS }, () =>
      new Array(COLS).fill(-1),
    );

    for (const pat of patterns) {
      for (let i = 0; i < pat.weftBuffers.length; i++) {
        const values = pat.weftBuffers[i].slice(offset, offset + N);
        const fn =
          pat.weftKinds[i] === 'density'
            ? drawDensityWeftSeries
            : pat.weftKinds[i] === 'ascii'
              ? drawAsciiWeftSeries
              : pat.weftKinds[i] === 'randomart'
                ? drawRandomartWeftSeries
                : drawWeftSeries;
        fn(
          grid,
          values,
          pat.weftColors[i],
          pat.weftBaseRows[i],
          pat.plotStartCol,
          pat.plotEndCol,
          pat.weftAxisMaxes[i],
          weftIdxGrid,
          pat.weftIdxBase + i,
          pat.bounds,
        );
      }

      for (let i = 0; i < pat.warpBuffers.length; i++) {
        const waveVals = pat.warpBuffers[i].slice(offset, offset + pat.innerRows);
        drawWarpSeries(
          grid,
          waveVals,
          pat.warpColors[i],
          pat.warpCols[i],
          pat.warpAmplitude,
          i,
          pat.plotStartRow,
          weftIdxGrid,
          pat.bounds,
        );
      }

      drawRectBorder(grid, pat.rect, pat.borderColor);
    }

    context.fillStyle = BG;
    context.fillRect(0, 0, width, height);

    context.font = FONT;
    context.textBaseline = 'top';
    context.textAlign = 'left';

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c];
        if (cell) {
          context.fillStyle = cell.color;
          context.fillText(cell.char, c * charW, r * LINE_H + 2);
        }
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8_000,
  playFps: 24,
  exportFps: 24,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
