// cspell:words randomart
/**
 * layered-compositions on the terminal desktop: every chart rect of the
 * terminal-charts original is a `TuiWindow` (drag, resize, minimize, close),
 * and its Tweakpane is the desktop's `≡ settings` window. Patterns live in
 * local cell coordinates (see ./patterns), so moving a window is free and
 * resizing rebuilds the pattern for the new size. The sketch fills the
 * viewport (no fixed `dimensions`); `wrap.resize` hands the new size to the desktop.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { randomPalette } from '../../colors';
import {
  cellRect,
  createButton,
  createDesktop,
  createRange,
  createToggleGroup,
  type CellRect,
  type Desktop,
  type GlyphBuffer,
  type TuiControl,
  type TuiWindow,
} from '../../tui';
import {
  buildPattern,
  defaultConfig,
  drawPattern,
  layoutRects,
  LAYOUT_NAMES,
  type LayoutName,
  type PatternConfig,
  type RectPattern,
} from './patterns';

const N = 64;
const BUFFER_N = N + 16;

/** One chart window's state: its pattern and the outer size it was built for. */
interface Chart {
  seed: string;
  win: TuiWindow;
  pattern: RectPattern;
  rows: number;
  cols: number;
}

export const sketch = ({ wrap, context, canvas, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      desktop.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const config: PatternConfig = defaultConfig();
  let seed = Random.getRandomSeed();
  let layoutChoice: LayoutName | 'auto' = 'auto';
  let layoutName: LayoutName = 'A';
  let animate = true;
  let borders = true;
  /** Frozen weft offset while `animate` is off. */
  let offset = 0;

  let rawPalette = randomPalette();
  /** Pattern colours: everything but the background, as in the original. */
  let palette = rawPalette.length > 1 ? rawPalette.slice(1) : rawPalette.slice();

  const charts = new Map<TuiWindow, Chart>();

  // ─── Patterns ───────────────────────────────────────────────────────────

  const build = (chart: Pick<Chart, 'seed' | 'rows' | 'cols'>): RectPattern => {
    Random.setSeed(chart.seed);
    return buildPattern(chart.rows, chart.cols, palette, BUFFER_N, config);
  };

  /** Rebuild every pattern in place (same windows, same seeds; config/palette changed). */
  const rebuildPatterns = () => {
    for (const chart of charts.values()) {
      chart.rows = chart.win.rect.rows;
      chart.cols = chart.win.rect.cols;
      chart.pattern = build(chart);
    }
  };

  const drawChart = (buf: GlyphBuffer, win: TuiWindow) => {
    const chart = charts.get(win);
    if (!chart) return;
    if (chart.rows !== win.rect.rows || chart.cols !== win.rect.cols) {
      chart.rows = win.rect.rows;
      chart.cols = win.rect.cols;
      chart.pattern = build(chart);
    }
    drawPattern(buf, chart.pattern, win.rect, offset, N);
  };

  // ─── Layout: one window per rect ────────────────────────────────────────

  const relayout = () => {
    for (const chart of charts.values()) desktop.removeWindow(chart.win);
    charts.clear();

    Random.setSeed(seed);
    const { name, rects } = layoutRects(layoutChoice, desktop.area.rows, desktop.area.cols, config);
    layoutName = name;

    rects.forEach((rect, i) => addChart(`chart ${String(i + 1).padStart(2, '0')}`, rect, `${seed}/${i}`));
  };

  /** One chart window with its own seeded pattern (the same build path `rebuild` uses). */
  const addChart = (title: string, rect: CellRect, chartSeed: string): TuiWindow => {
    const win = desktop.addWindow({
      title,
      rect,
      minRows: 3,
      minCols: 8,
      draw: (buf, _inner, w) => drawChart(buf, w),
      onClose: (w) => {
        charts.delete(w);
        desktop.removeWindow(w);
      },
    });
    const chart: Chart = {
      seed: chartSeed,
      win,
      rows: win.rect.rows,
      cols: win.rect.cols,
      pattern: null as unknown as RectPattern,
    };
    chart.pattern = build(chart);
    charts.set(win, chart);
    return win;
  };

  /** `+ new` on the bar: the next `chart NN`, cascaded from the front chart's origin, clamped to the area. */
  const newWindow = () => {
    const area = desktop.area;
    let max = 0;
    for (const c of charts.values()) {
      const m = /chart (\d+)/.exec(c.win.title);
      if (m) max = Math.max(max, Number(m[1]));
    }
    const title = `chart ${String(max + 1).padStart(2, '0')}`;
    const rows = Math.min(12, area.rows);
    const cols = Math.min(32, area.cols);
    const front = desktop.windows[desktop.windows.length - 1];
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
    const row = clamp(front ? front.rect.row + 1 : area.row, area.row, area.row + area.rows - rows);
    const col = clamp(front ? front.rect.col + 2 : area.col, area.col, area.col + area.cols - cols);
    // addWindow already fronts it among the charts (just below a visible settings window).
    addChart(title, cellRect(row, col, rows, cols), `${seed}/${title}`);
    props.render();
  };

  const reseed = () => {
    seed = Random.getRandomSeed();
    relayout();
  };

  const newPalette = () => {
    // Uniform pick, but never the palette already on screen (~2 % repeat rate otherwise).
    const previous = rawPalette;
    for (let tries = 0; tries < 8 && rawPalette === previous; tries++) {
      Random.setSeed(Random.getRandomSeed());
      rawPalette = randomPalette();
    }
    palette = rawPalette.length > 1 ? rawPalette.slice(1) : rawPalette.slice();
    desktop.setTheme(rawPalette);
    rebuildPatterns();
  };

  // ─── Settings controls ──────────────────────────────────────────────────

  const integer = (v: number) => String(v);
  const range = (
    id: keyof PatternConfig,
    min: number,
    max: number,
    step: number,
    onSet: () => void,
    format?: (v: number) => string,
  ): TuiControl =>
    createRange({
      id,
      label: id,
      min,
      max,
      step,
      value: config[id],
      inline: true,
      format,
      onChange: (v) => {
        config[id] = v;
        onSet();
      },
    });

  const controls: TuiControl[] = [
    range('gutter', 0, 4, 1, rebuildPatterns, integer),
    range('weftDensity', 0.1, 1, 0.01, rebuildPatterns),
    range('warpDensity', 0.05, 0.8, 0.01, rebuildPatterns),
    range('densityMix', 0, 1, 0.01, rebuildPatterns),
    range('asciiMix', 0, 1, 0.01, rebuildPatterns),
    range('randomartMix', 0, 1, 0.01, rebuildPatterns),
    range('warpAmplitude', 0, 5, 1, rebuildPatterns, integer),
    // Margins only shape the next layout.
    range('marginRows', 0, 12, 1, () => {}, integer),
    range('marginCols', 0, 16, 1, () => {}, integer),
    createToggleGroup({
      exclusive: true,
      active: 'auto',
      items: [
        { id: 'auto', label: 'layout: auto' },
        ...LAYOUT_NAMES.map((n) => ({ id: n, label: `layout: ${n}` })),
      ],
      onChange: ([id]) => {
        layoutChoice = id as LayoutName | 'auto';
        relayout();
      },
    }),
    createToggleGroup({
      active: ['animate', 'borders'],
      items: [
        { id: 'animate', label: 'animate' },
        { id: 'borders', label: 'borders' },
      ],
      onChange: (active) => {
        animate = active.includes('animate');
        borders = active.includes('borders');
        desktop.activeFrame = borders;
      },
    }),
    createButton({ id: 'rebuild', label: 'rebuild', onPress: reseed }),
    createButton({ id: 'palette', label: 'new palette', onPress: newPalette }),
  ];

  // ─── Desktop ────────────────────────────────────────────────────────────

  const desktop: Desktop = createDesktop({
    ctx: context,
    canvas,
    width,
    height,
    palette: rawPalette,
    activeFrame: borders,
    settings: { controls, cols: 36 },
    status: () => `seed ${seed} · layout ${layoutName}`,
    onNewWindow: () => newWindow(),
    onChange: () => props.render(),
  });

  relayout();

  if (import.meta.env.DEV) {
    (window as unknown as { __demo?: unknown }).__demo = {
      desktop,
      config,
      controls,
      charts,
      relayout,
      reseed,
      newPalette,
      newWindow,
      repaint: () => props.render(),
    };
  }

  wrap.resize = ({ width, height }: SketchProps) => desktop.resize(width, height);

  wrap.render = ({ playhead }: SketchProps) => {
    if (animate) offset = Math.floor(playhead * BUFFER_N) % BUFFER_N;
    desktop.render();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  // No `dimensions`: ssam sizes the canvas to the viewport and calls `wrap.resize` on window resize.
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8_000,
  playFps: 24,
  exportFps: 24,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
