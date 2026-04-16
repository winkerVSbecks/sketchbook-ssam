import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

// ── Config ────────────────────────────────────────────────────────────────────
const FONT_SIZE = 14;
const FONT = `${FONT_SIZE}px 'Menlo', 'Monaco', 'DejaVu Sans Mono', monospace`;
const LINE_H = 20;

const BG = '#1b1d30';
const C_DIM = 'rgba(255,255,255,0.28)';
const C_MID = 'rgba(255,255,255,0.46)';

const SERIES_DEFS = [
  { name: 'Sonnet 4.6', color: '#8b90d4' },
  { name: 'Opus 4.6', color: '#52b788' },
  { name: 'Haiku 4.5', color: '#d4a440' },
];

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ── Types ─────────────────────────────────────────────────────────────────────
type Cell = { char: string; color: string };
type Grid = (Cell | null)[][];

interface SeriesData {
  name: string;
  color: string;
  values: number[];
}

interface ChartConfig {
  series: SeriesData[];
  xLabels: string[];
  axisMax: number;
  ticks: number[];
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function fmt(v: number): string {
  if (v === 0) return '0';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}m`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}

function niceTicks(rawMax: number, numTicks = 5): { ticks: number[]; axisMax: number } {
  if (rawMax <= 0) return { ticks: [0, 1, 2, 3, 4], axisMax: 4 };
  const rawStep = rawMax / (numTicks - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  let step = 10 * mag;
  for (const m of [1, 2, 2.5, 5, 10]) {
    const s = m * mag;
    if (s * (numTicks - 1) >= rawMax) { step = s; break; }
  }
  const axisMax = step * (numTicks - 1);
  return { ticks: Array.from({ length: numTicks }, (_, i) => i * step), axisMax };
}

function monthDay(month: number, day: number): string {
  return `${MONTHS[month % 12]} ${day}`;
}

// ── Data Generation ───────────────────────────────────────────────────────────
function genSpiky(n: number, base: number, peak: number): number[] {
  const vals: number[] = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    if (Random.chance(0.08)) v = peak * Random.range(0.5, 1.1);
    else {
      v = Math.max(0, v * Random.range(0.6, 1.4));
      if (v < base * 0.1) v = base * Random.range(0.3, 1.2);
    }
    vals.push(v);
  }
  return vals;
}

function genTrending(n: number, start: number, end: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return Math.max(0, (start + (end - start) * t) * Random.range(0.8, 1.2));
  });
}

function genFlat(n: number, val: number): number[] {
  return Array.from({ length: n }, () =>
    Math.max(0, val * Random.range(0.7, 1.3))
  );
}

function makeXLabels(startMonth: number, n: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const pos = Math.floor(i * (n - 1) / (count - 1));
    return monthDay(startMonth + Math.floor(pos / 30), 1 + (pos % 27));
  });
}

// ── Grid ──────────────────────────────────────────────────────────────────────
function makeGrid(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null as Cell | null)
  );
}

function put(grid: Grid, row: number, col: number, char: string, color: string) {
  if (row >= 0 && row < grid.length && col >= 0 && col < grid[0].length) {
    grid[row][col] = { char, color };
  }
}

function putText(grid: Grid, row: number, col: number, text: string, color: string) {
  for (let i = 0; i < text.length; i++) put(grid, row, col + i, text[i], color);
}

// ── Chart → Grid ──────────────────────────────────────────────────────────────
const PLOT_ROWS = 12; // row indices 0..PLOT_ROWS (PLOT_ROWS+1 possible rows)
const Y_COLS = 9;    // columns reserved for y-axis labels

function drawSeries(
  grid: Grid,
  values: number[],
  color: string,
  baseRow: number,
  plotStartCol: number,
  plotEndCol: number,
  axisMax: number,
) {
  const W = plotEndCol - plotStartCol;
  const N = values.length;
  const colAt = (i: number) => Math.round(i * (W - 1) / (N - 1));
  const rowAt = (v: number) =>
    baseRow + Math.round((1 - Math.min(v, axisMax) / axisMax) * PLOT_ROWS);

  const cols = values.map((_, i) => colAt(i));
  const rows = values.map(rowAt);

  // Horizontals first
  for (let i = 0; i < N; i++) {
    const r = rows[i];
    const cEnd = i < N - 1 ? cols[i + 1] : W;
    for (let c = cols[i]; c < cEnd; c++) {
      put(grid, r, plotStartCol + c, '─', color);
    }
  }

  // Corners + verticals at transitions (overwrite corner chars)
  for (let i = 1; i < N; i++) {
    const absC = plotStartCol + cols[i];
    const r1 = rows[i - 1];
    const r2 = rows[i];
    if (r1 === r2) continue;

    const top = Math.min(r1, r2);
    const bot = Math.max(r1, r2);

    if (r2 < r1) {
      put(grid, r1, absC, '╯', color);
      put(grid, r2, absC, '╭', color);
    } else {
      put(grid, r1, absC, '╮', color);
      put(grid, r2, absC, '╰', color);
    }
    for (let r = top + 1; r < bot; r++) put(grid, r, absC, '│', color);
  }
}

function drawChart(
  grid: Grid,
  config: ChartConfig,
  startRow: number,
  totalCols: number,
) {
  const plotStartCol = Y_COLS;
  const plotEndCol = totalCols - 2;

  // Y-axis labels + tick symbols
  config.ticks.forEach((t, i) => {
    const r = startRow + Math.round((1 - t / config.axisMax) * PLOT_ROWS);
    const sym = i === config.ticks.length - 1 ? '┼' : '┤';
    const label = `${fmt(t).padStart(6)} ${sym}`;
    putText(grid, r, 0, label, C_DIM);
  });

  // Series lines
  config.series.forEach(s =>
    drawSeries(grid, s.values, s.color, startRow, plotStartCol, plotEndCol, config.axisMax)
  );

  // X-axis date labels
  const xRow = startRow + PLOT_ROWS + 1;
  const pw = plotEndCol - plotStartCol;
  config.xLabels.forEach((label, i) => {
    const ratio = i / (config.xLabels.length - 1);
    let c = plotStartCol + Math.round(ratio * pw);
    if (i === config.xLabels.length - 1) c = Math.min(c, plotEndCol - label.length);
    putText(grid, xRow, c, label, C_DIM);
  });

  // Legend
  const legendRow = startRow + PLOT_ROWS + 2;
  let lc = plotStartCol;
  config.series.forEach((s, i) => {
    put(grid, legendRow, lc, '●', s.color);
    lc += 2;
    putText(grid, legendRow, lc, s.name, C_MID);
    lc += s.name.length;
    if (i < config.series.length - 1) {
      putText(grid, legendRow, lc, ' · ', C_DIM);
      lc += 3;
    }
  });
}

// ── Sketch ────────────────────────────────────────────────────────────────────
export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  Random.setSeed(Random.getRandomSeed());

  context.font = FONT;
  const charW = context.measureText('M').width;
  const COLS = Math.floor(width / charW);
  const ROWS = Math.floor(height / LINE_H);

  const N = 24;

  const buildChart = (
    seriesCount: number,
    startMonth: number,
    fns: Array<(n: number) => number[]>,
  ): ChartConfig => {
    const series = SERIES_DEFS.slice(0, seriesCount).map((def, i) => ({
      ...def,
      values: fns[i](N),
    }));
    const rawMax = Math.max(...series.flatMap(s => s.values));
    const { ticks, axisMax } = niceTicks(rawMax);
    return { series, xLabels: makeXLabels(startMonth, N, 4), axisMax, ticks };
  };

  const charts: ChartConfig[] = [
    buildChart(3, 0, [
      n => genSpiky(n, 50_000, 600_000),
      n => genSpiky(n, 8_000, 120_000),
      n => genFlat(n, 10_000),
    ]),
    buildChart(3, 2, [
      n => genTrending(n, 15_000, 500_000),
      n => genSpiky(n, 5_000, 80_000),
      n => genFlat(n, 8_000),
    ]),
    buildChart(2, 3, [
      n => genSpiky(n, 40_000, 380_000),
      n => genFlat(n, 12_000),
    ]),
  ];

  // Each chart: PLOT_ROWS+1 plot rows + 1 x-label + 1 legend + 2 gap = PLOT_ROWS+5
  const CHART_ROWS = PLOT_ROWS + 5;
  const topPad = Math.floor((ROWS - charts.length * CHART_ROWS) / 2);

  const grid = makeGrid(ROWS, COLS);
  charts.forEach((chart, i) =>
    drawChart(grid, chart, topPad + i * CHART_ROWS, COLS)
  );

  wrap.render = ({ width, height }: SketchProps) => {
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
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
