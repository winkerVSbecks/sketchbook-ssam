import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { randomPalette } from '../../colors';

const FONT_SIZE = 14;
const FONT = `${FONT_SIZE}px 'Menlo', 'Monaco', 'DejaVu Sans Mono', monospace`;
const LINE_H = 20;
const PLOT_ROWS = 5;
const WARP_AMPLITUDE = 2;
const MARGIN_ROWS = 4;
const MARGIN_COLS = 6;

type Cell = { char: string; color: string };
type Grid = (Cell | null)[][];

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

function put(
  grid: Grid,
  row: number,
  col: number,
  char: string,
  color: string,
) {
  if (row >= 0 && row < grid.length && col >= 0 && col < grid[0].length) {
    grid[row][col] = { char, color };
  }
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
) {
  const W = plotEndCol - plotStartCol;
  const N = values.length;
  const colAt = (i: number) => Math.round((i * (W - 1)) / (N - 1));
  const rowAt = (v: number) =>
    baseRow + Math.round((1 - Math.min(v, axisMax) / axisMax) * PLOT_ROWS);

  const cols = values.map((_, i) => colAt(i));
  const rows = values.map(rowAt);

  const mark = (r: number, c: number, ch: string) => {
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
) {
  const H = values.length;
  const cols = values.map(
    (v) => baseCol + Math.round((v - 0.5) * 2 * amplitude),
  );

  const canDraw = (r: number, c: number) => {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return false;
    const wi = weftIdxGrid[r][c];
    if (wi === -1) return true;
    return (wi + warpIdx) % 2 !== 0;
  };

  const tryPut = (r: number, c: number, ch: string) => {
    if (canDraw(r, c)) put(grid, r, c, ch, color);
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
) {
  const W = plotEndCol - plotStartCol;
  const N = values.length;
  const colAt = (i: number) => Math.round((i * (W - 1)) / (N - 1));
  const rowAt = (v: number) =>
    baseRow + Math.round((1 - Math.min(v, axisMax) / axisMax) * PLOT_ROWS);

  const cols = values.map((_, i) => colAt(i));
  const rows = values.map(rowAt);

  const mark = (r: number, c: number, ch: string) => {
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

  const innerW = COLS - MARGIN_COLS * 2;
  const innerH = ROWS - MARGIN_ROWS * 2;

  const WARP_COUNT = 14;
  const warpCols = Array.from(
    { length: WARP_COUNT },
    (_, i) => MARGIN_COLS + Math.round(((i + 0.5) * innerW) / WARP_COUNT),
  );

  const WEFT_COUNT = 18;
  const genFns: Array<() => number[]> = [
    () => genFlat(BUFFER_N, 6),
    () => genWave(BUFFER_N, 8, 1),
    () => genFlat(BUFFER_N, 5),
    () => genWave(BUFFER_N, 8, 1.5),
    () => genTrending(BUFFER_N, 2, 8),
    () => genFlat(BUFFER_N, 7),
    () => genWave(BUFFER_N, 9, 0.8),
    () => genTrending(BUFFER_N, 8, 2),
    () => genFlat(BUFFER_N, 4),
    () => genWave(BUFFER_N, 7, 2),
    () => genFlat(BUFFER_N, 6),
    () => genWave(BUFFER_N, 8, 1.2),
    () => genTrending(BUFFER_N, 3, 9),
    () => genFlat(BUFFER_N, 5),
    () => genWave(BUFFER_N, 8, 0.7),
    () => genFlat(BUFFER_N, 6),
    () => genWave(BUFFER_N, 9, 1.8),
    () => genTrending(BUFFER_N, 7, 3),
  ];

  const buffers = Array.from({ length: WEFT_COUNT }, (_, i) =>
    extendCyclic(genFns[i % genFns.length](), N),
  );
  const axisMaxes = buffers.map((b) => Math.max(...b));
  const weftColors = Array.from(
    { length: WEFT_COUNT },
    (_, i) => PALETTE[(i * 2) % PALETTE.length],
  );

  const baseRows = Array.from(
    { length: WEFT_COUNT },
    (_, i) =>
      MARGIN_ROWS +
      Math.floor((i * (innerH - PLOT_ROWS - 1)) / (WEFT_COUNT - 1)),
  );

  const warpBuffers = Array.from({ length: WARP_COUNT }, (_, wi) => {
    const phase = (wi / WARP_COUNT) * Math.PI * 2;
    const periods = Random.rangeFloor(1, 4);
    return extendCyclic(genWarpWave(BUFFER_N, phase, periods), innerH);
  });

  const weftKinds = Array.from({ length: WEFT_COUNT }, (_, i) =>
    i % 3 === 0 ? 'density' : 'line',
  );

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    const offset = Math.floor(playhead * BUFFER_N) % BUFFER_N;

    const grid = makeGrid(ROWS, COLS);
    const weftIdxGrid = Array.from({ length: ROWS }, () =>
      new Array(COLS).fill(-1),
    );

    for (let weftIdx = 0; weftIdx < WEFT_COUNT; weftIdx++) {
      const values = buffers[weftIdx].slice(offset, offset + N);
      const fn =
        weftKinds[weftIdx] === 'density'
          ? drawDensityWeftSeries
          : drawWeftSeries;
      fn(
        grid,
        values,
        weftColors[weftIdx],
        baseRows[weftIdx],
        MARGIN_COLS,
        COLS - MARGIN_COLS,
        axisMaxes[weftIdx],
        weftIdxGrid,
        weftIdx,
      );
    }

    for (let warpIdx = 0; warpIdx < WARP_COUNT; warpIdx++) {
      const waveVals = warpBuffers[warpIdx].slice(offset, offset + innerH);
      const color = PALETTE[(warpIdx * 2 + 1) % PALETTE.length];
      drawWarpSeries(
        grid,
        waveVals,
        color,
        warpCols[warpIdx],
        WARP_AMPLITUDE,
        warpIdx,
        MARGIN_ROWS,
        weftIdxGrid,
      );
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
