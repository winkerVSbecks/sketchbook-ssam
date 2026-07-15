import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

const FONT_SIZE = 14;
const FONT = `${FONT_SIZE}px 'Menlo', 'Monaco', 'DejaVu Sans Mono', monospace`;
const LINE_H = 20;
const PLOT_ROWS = 5;
const WARP_AMPLITUDE = 2;
const MARGIN_ROWS = 4;
const MARGIN_COLS = 6;
const ICON_RASTER_RES = 64;

const RAMP = ['░', '▒', '▓', '█'];
const RAMP_THRESHOLDS = [0.14, 0.38, 0.64];

type Cell = { char: string; color: string };
type Grid = (Cell | null)[][];
type Coverage = number[][];
type WeftKind = 'line' | 'density' | 'icon';
type IconDef = { path: string; viewBox: number };

const ICONS: IconDef[] = [
  {
    // Storybook mark
    path: 'M16.71.243l-.12 2.71a.18.18 0 00.29.15l1.06-.8.9.7a.18.18 0 00.28-.14l-.1-2.76 1.33-.1a1.2 1.2 0 011.279 1.2v21.596a1.2 1.2 0 01-1.26 1.2l-16.096-.72a1.2 1.2 0 01-1.15-1.16l-.75-19.797a1.2 1.2 0 011.13-1.27L16.7.222zM13.64 9.3c0 .47 3.16.24 3.59-.08 0-3.2-1.72-4.89-4.859-4.89-3.15 0-4.899 1.72-4.899 4.29 0 4.45 5.999 4.53 5.999 6.959 0 .7-.32 1.1-1.05 1.1-.96 0-1.35-.49-1.3-2.16 0-.36-3.649-.48-3.769 0-.27 4.03 2.23 5.2 5.099 5.2 2.79 0 4.969-1.49 4.969-4.18 0-4.77-6.099-4.64-6.099-6.999 0-.97.72-1.1 1.13-1.1.45 0 1.25.07 1.19 1.87z',
    viewBox: 24,
  },
  {
    // Chromatic mark
    path: 'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm-.006 3.43a3.372 3.372 0 0 1 3.37 3.369v2.199L9.628 5.689a4.261 4.261 0 0 0-.688-.32 3.351 3.351 0 0 1 3.053-1.94zm-4.498 2.6c.588 0 1.17.156 1.684.452l5.734 3.311-2.91 1.678-3.6-2.076a.46.46 0 0 0-.459 0L5.35 10.893c-.22.126-.428.27-.621.433a3.349 3.349 0 0 1-.155-3.61A3.385 3.385 0 0 1 7.496 6.03zm8.723.015a3.383 3.383 0 0 1 3.205 1.672 3.37 3.37 0 0 1-1.235 4.6l-5.736 3.308v-3.357l3.602-2.077a.459.459 0 0 0 .228-.398V6.799c0-.253-.021-.506-.064-.754zm-8.504 4.543v6.617c0 .254.021.505.066.754a3.4 3.4 0 0 1-.285.012 3.383 3.383 0 0 1-2.92-1.684 3.343 3.343 0 0 1-.338-2.555 3.342 3.342 0 0 1 1.57-2.044l1.907-1.1zm.908 0 2.912 1.68v4.152a.46.46 0 0 0 .23.396l2.594 1.498h.002c.22.127.45.235.688.32a3.35 3.35 0 0 1-3.055 1.938 3.373 3.373 0 0 1-3.371-3.367v-6.617zm10.647 2.088a3.347 3.347 0 0 1 .154 3.611 3.372 3.372 0 0 1-4.604 1.233l-1.908-1.1 5.738-3.309a4.31 4.31 0 0 0 .62-.435z',
    viewBox: 24,
  },
  {
    // GitHub mark
    path: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
    viewBox: 24,
  },
];

const config = {
  bg: '#000000',
  fg: '#ffffff',
  iconBandRows: 24,
  iconGapCols: 24,
  iconScrollSpeed: 1,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'bg');
pane.addBinding(config, 'fg');
pane.addBinding(config, 'iconBandRows', { min: 3, max: 40, step: 1 });
pane.addBinding(config, 'iconGapCols', { min: 0, max: 40, step: 1 });
pane.addBinding(config, 'iconScrollSpeed', { min: 1, max: 8, step: 1 });

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

function rasterizeIconCoverage(icon: IconDef, res: number): Coverage {
  const canvas = document.createElement('canvas');
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, res, res);
  ctx.fillStyle = '#fff';
  ctx.save();
  ctx.scale(res / icon.viewBox, res / icon.viewBox);
  ctx.fill(new Path2D(icon.path));
  ctx.restore();

  const { data } = ctx.getImageData(0, 0, res, res);
  return Array.from({ length: res }, (_, y) =>
    Array.from({ length: res }, (_, x) => data[(y * res + x) * 4 + 3] / 255),
  );
}

function downsampleCoverage(
  coverage: Coverage,
  res: number,
  cellRows: number,
  cellCols: number,
): Coverage {
  const blockH = res / cellRows;
  const blockW = res / cellCols;
  return Array.from({ length: cellRows }, (_, r) => {
    const y0 = Math.floor(r * blockH);
    const y1 = Math.floor((r + 1) * blockH);
    return Array.from({ length: cellCols }, (_, c) => {
      const x0 = Math.floor(c * blockW);
      const x1 = Math.floor((c + 1) * blockW);
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += coverage[y][x];
          count++;
        }
      }
      return count > 0 ? sum / count : 0;
    });
  });
}

function charForCoverage(cov: number): string | null {
  if (cov < RAMP_THRESHOLDS[0]) return null;
  for (let i = RAMP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (cov >= RAMP_THRESHOLDS[i]) return RAMP[i + 1];
  }
  return RAMP[0];
}

function drawIconWeftBand(
  grid: Grid,
  coverages: Coverage[],
  glyphCols: number,
  bandRows: number,
  color: string,
  baseRow: number,
  plotStartCol: number,
  plotEndCol: number,
  period: number,
  scrollOffset: number,
  weftIdxGrid: number[][],
  weftIdx: number,
) {
  const mark = (r: number, c: number, ch: string) => {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    grid[r][c] = { char: ch, color };
    weftIdxGrid[r][c] = weftIdx;
  };

  for (let c = plotStartCol; c < plotEndCol; c++) {
    const shifted = c - plotStartCol + scrollOffset;
    const tileIndex = Math.floor(shifted / period);
    const local = ((shifted % period) + period) % period;
    if (local >= glyphCols) continue;
    const coverage = coverages[tileIndex % coverages.length];
    for (let r = 0; r < bandRows; r++) {
      const ch = charForCoverage(coverage[r][local]);
      if (!ch) continue;
      mark(baseRow + r, c, ch);
    }
  }
}

export const sketch = ({
  wrap,
  context,
  width,
  height,
  ...props
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  Random.setSeed(Random.getRandomSeed());

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

  const weftKinds: WeftKind[] = Array.from({ length: WEFT_COUNT }, (_, i) => {
    if (i === Math.floor(WEFT_COUNT / 2)) return 'icon';
    if (i % 3 === 0) return 'density';
    return 'line';
  });

  const iconCoverages = ICONS.map((icon) =>
    rasterizeIconCoverage(icon, ICON_RASTER_RES),
  );

  const refreshIconGeometry = () => {
    const glyphCols = Math.max(
      4,
      Math.round(config.iconBandRows * (LINE_H / charW)),
    );
    const period = glyphCols + config.iconGapCols;
    const coverages = iconCoverages.map((cov) =>
      downsampleCoverage(cov, ICON_RASTER_RES, config.iconBandRows, glyphCols),
    );
    const iconBaseRow =
      MARGIN_ROWS + Math.floor((innerH - config.iconBandRows) / 2);
    return { glyphCols, period, coverages, iconBaseRow };
  };

  let {
    glyphCols,
    period,
    coverages: iconCellCoverages,
    iconBaseRow,
  } = refreshIconGeometry();

  pane.on('change', (ev: any) => {
    if (ev.presetKey === 'iconBandRows' || ev.presetKey === 'iconGapCols') {
      ({
        glyphCols,
        period,
        coverages: iconCellCoverages,
        iconBaseRow,
      } = refreshIconGeometry());
    }
  });

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    const offset = Math.floor(playhead * BUFFER_N) % BUFFER_N;
    const scrollOffset = Math.round(playhead * period * config.iconScrollSpeed);

    const grid = makeGrid(ROWS, COLS);
    const weftIdxGrid = Array.from({ length: ROWS }, () =>
      new Array(COLS).fill(-1),
    );

    for (let weftIdx = 0; weftIdx < WEFT_COUNT; weftIdx++) {
      const kind = weftKinds[weftIdx];
      if (kind === 'icon') continue;

      const values = buffers[weftIdx].slice(offset, offset + N);
      const fn = kind === 'density' ? drawDensityWeftSeries : drawWeftSeries;
      fn(
        grid,
        values,
        config.fg,
        baseRows[weftIdx],
        MARGIN_COLS,
        COLS - MARGIN_COLS,
        axisMaxes[weftIdx],
        weftIdxGrid,
        weftIdx,
      );
    }

    // Icon band paints last among weft layers, centered in the canvas,
    // overlapping the charts underneath rather than clearing them away.
    for (let weftIdx = 0; weftIdx < WEFT_COUNT; weftIdx++) {
      if (weftKinds[weftIdx] !== 'icon') continue;
      drawIconWeftBand(
        grid,
        iconCellCoverages,
        glyphCols,
        config.iconBandRows,
        config.fg,
        iconBaseRow,
        MARGIN_COLS,
        COLS - MARGIN_COLS,
        period,
        scrollOffset,
        weftIdxGrid,
        weftIdx,
      );
    }

    for (let warpIdx = 0; warpIdx < WARP_COUNT; warpIdx++) {
      const waveVals = warpBuffers[warpIdx].slice(offset, offset + innerH);
      drawWarpSeries(
        grid,
        waveVals,
        config.fg,
        warpCols[warpIdx],
        WARP_AMPLITUDE,
        warpIdx,
        MARGIN_ROWS,
        weftIdxGrid,
      );
    }

    context.fillStyle = config.bg;
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
