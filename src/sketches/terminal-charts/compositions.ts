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
  minRectRows: 9,
  minRectCols: 18,
  splitChance: 0.78,
  maxDepth: 6,
  gutter: 1,
  weftDensity: 0.42,
  warpDensity: 0.28,
  densityMix: 0.35,
  asciiMix: 0.3,
  randomartMix: 0.25,
  warpAmplitude: 2,
  marginRows: 3,
  marginCols: 4,
};

const pane = new Pane() as any;
if (pane.containerElem_) pane.containerElem_.style.zIndex = '1';
pane.addBinding(config, 'minRectRows', { min: 6, max: 30, step: 1 });
pane.addBinding(config, 'minRectCols', { min: 10, max: 60, step: 1 });
pane.addBinding(config, 'splitChance', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'maxDepth', { min: 1, max: 10, step: 1 });
pane.addBinding(config, 'gutter', { min: 0, max: 4, step: 1 });
pane.addBinding(config, 'weftDensity', { min: 0.1, max: 1, step: 0.01 });
pane.addBinding(config, 'warpDensity', { min: 0.05, max: 0.8, step: 0.01 });
pane.addBinding(config, 'densityMix', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'asciiMix', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'randomartMix', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'warpAmplitude', { min: 0, max: 5, step: 1 });
pane.addBinding(config, 'marginRows', { min: 0, max: 10, step: 1 });
pane.addBinding(config, 'marginCols', { min: 0, max: 10, step: 1 });

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

function splitRects(bounds: Rect, depth: number): Rect[] {
  const canSplitH = bounds.rows >= config.minRectRows * 2;
  const canSplitV = bounds.cols >= config.minRectCols * 2;
  if (!canSplitH && !canSplitV) return [bounds];
  if (depth >= config.maxDepth) return [bounds];
  if (depth > 0 && !Random.chance(config.splitChance)) return [bounds];

  const aspect = bounds.cols / 2 / bounds.rows;
  let splitH: boolean;
  if (canSplitH && !canSplitV) splitH = true;
  else if (!canSplitH && canSplitV) splitH = false;
  else splitH = Random.chance(aspect > 1 ? 0.3 : 0.7);

  if (splitH) {
    const splitAt = Random.rangeFloor(
      config.minRectRows,
      bounds.rows - config.minRectRows + 1,
    );
    const top: Rect = {
      row: bounds.row,
      col: bounds.col,
      rows: splitAt,
      cols: bounds.cols,
    };
    const bot: Rect = {
      row: bounds.row + splitAt,
      col: bounds.col,
      rows: bounds.rows - splitAt,
      cols: bounds.cols,
    };
    return [...splitRects(top, depth + 1), ...splitRects(bot, depth + 1)];
  }

  const splitAt = Random.rangeFloor(
    config.minRectCols,
    bounds.cols - config.minRectCols + 1,
  );
  const left: Rect = {
    row: bounds.row,
    col: bounds.col,
    rows: bounds.rows,
    cols: splitAt,
  };
  const right: Rect = {
    row: bounds.row,
    col: bounds.col + splitAt,
    rows: bounds.rows,
    cols: bounds.cols - splitAt,
  };
  return [...splitRects(left, depth + 1), ...splitRects(right, depth + 1)];
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

  Random.setSeed(Random.getRandomSeed());

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

  const rootRect: Rect = {
    row: config.marginRows,
    col: config.marginCols,
    rows: ROWS - config.marginRows * 2,
    cols: COLS - config.marginCols * 2,
  };

  const rects = splitRects(rootRect, 0);

  let weftIdxCursor = 0;
  const patterns: RectPattern[] = rects.map((rect) => {
    const pat = buildPattern(rect, PALETTE, BUFFER_N, weftIdxCursor);
    weftIdxCursor += pat.weftBuffers.length;
    return pat;
  });

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
