/**
 * differential-growth — one organism, several instruments.
 *
 * A single differential-growth curve (./growth-sim) lives in continuous world
 * coordinates and grows for as long as the sketch runs. Every window is a
 * scope trained on it: its own centre and zoom, drawn through ./viewport as
 * density shades when the whole mass is in frame and as line glyphs with node
 * marks once the curve resolves cell by cell. Nothing is per-window random —
 * there is one subject, seen from several distances at once.
 *
 * The desktop is the frame of reference. At ×1 the desktop area spans
 * `WORLD_SPAN` world units, and each window's initial centre is the world
 * point under the middle of its own rect, so the sketch opens as four holes
 * cut over one world; raising a window's magnification digs into the patch it
 * already had. A deeper scope's field of view is drawn inside every shallower
 * one as a labelled box, which is what makes "these two windows are looking at
 * the same thing" legible rather than a claim.
 *
 * Drag the body of a scope to pan it (the organism follows the pointer), the
 * footer slider or the wheel to zoom, the title row to re-frame. `+ new` cuts
 * another hole. The fourth window is not a picture: it is the readout — node
 * count and growth rate as terminal column charts over the live parameters.
 *
 * `src/tui/` is a library here and is not modified.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import { randomPalette } from '../../colors';
import { clientToLogical } from '../../ui';
import {
  cellRect,
  cellRectContains,
  createButton,
  createDesktop,
  createRange,
  createToggleGroup,
  isEmptyCellRect,
  type Cell,
  type CellRect,
  type Desktop,
  type GlyphBuffer,
  type TuiContent,
  type TuiControl,
  type TuiRange,
  type TuiTheme,
  type TuiWindow,
} from '../../tui';
import { createGrowth, perimeter, type GrowthParams } from './growth-sim';
import {
  cellAspectFromMetrics,
  createViewport,
  drawGrowth,
  type Viewport,
} from './viewport';

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * World units the desktop area covers at ×1. The world *covers* the desktop
 * (the long axis is what spans it, the short one crops), so every window sits
 * over the organism rather than over the empty margin a contain-fit would leave.
 */
const WORLD_SPAN = 40;
/** Node ceiling: the organism plateaus here instead of eating the frame budget. */
const MAX_NODES = 6000;
/** Magnifications of the two deep scopes the sketch opens with (the overview fits the world). */
const SCOPE_MAGS = [2, 8] as const;
/** Magnification a `+ new` scope opens at. */
const NEW_SCOPE_MAG = 8;
const MIN_MAG = 0.25;
const MAX_MAG = 64;
/** Quantisation of the zoom control, in log2 magnification (≈1.19× per notch). */
const MAG_STEP = 0.25;
/** Simulation steps between readout samples. */
const SAMPLE_EVERY = 4;
/** Samples kept for the charts. */
const HISTORY = 480;
/** Never spend more than this many simulation steps on one frame. */
const MAX_STEPS_PER_FRAME = 4;
const WHEEL_ZOOM_SPEED = 0.004;
/** A deeper scope's frame is only drawn in views at least this much shallower. */
const FRAME_ZOOM_RATIO = 1.8;
/** Width of one parameter column in the readout, in cells. */
const PARAM_COL_W = 22;
/** Parameters listed in the readout table. */
const PARAM_COUNT = 10;
/** Column-chart ramp, eighths of a cell. */
const BARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const fmtMag = (m: number): string => `x${m >= 10 ? m.toFixed(0) : m.toFixed(1)}`;
/** Signed, one decimal, so a title's coordinates stay tabular as they change. */
const fmtCoord = (v: number): string =>
  `${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(1)}`;

const randomSeed = (): number => Math.floor(Math.random() * 0xffffff) + 1;

/** One readout sample: the organism's size and how fast it is gaining material. */
interface Sample {
  step: number;
  nodes: number;
  /** New nodes per simulation step since the previous sample. */
  rate: number;
}

/** One window's eye on the organism. */
interface Scope {
  win: TuiWindow;
  /** Stable name (`scope 02`); the live title adds zoom and centre. */
  name: string;
  /** Short tag drawn on this scope's frame inside shallower views. */
  tag: string;
  vp: Viewport;
  /** Magnification relative to the desktop-wide view; absolute zoom is derived. */
  mag: number;
  zoom: TuiRange;
  /** Pointer is over the footer slider. */
  hot: boolean;
  /** Last pointer cell while panning. */
  drag: Cell | null;
}

export const sketch = ({
  wrap,
  context,
  canvas,
  width,
  height,
  ...props
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  // ─── The organism ─────────────────────────────────────────────────────────

  let seed = randomSeed();
  const growth = createGrowth({ seed, radius: 2, maxNodes: MAX_NODES });

  let animate = true;
  let showFrames = true;
  /** Simulation steps per rendered frame; fractional values step every n-th frame. */
  let rate = 1;
  let stepAcc = 0;

  const history: Sample[] = [];
  const sample = () => {
    const nodes = growth.state.nodes.length;
    const prev = history[history.length - 1];
    const span = prev ? Math.max(1, growth.state.step - prev.step) : 1;
    history.push({
      step: growth.state.step,
      nodes,
      rate: prev ? (nodes - prev.nodes) / span : 0,
    });
    if (history.length > HISTORY) history.shift();
  };
  sample();

  /** Step the simulation `n` times, sampling the readout as it goes. */
  const advance = (n: number) => {
    for (let i = 0; i < n; i++) {
      growth.step();
      if (growth.state.step % SAMPLE_EVERY === 0) sample();
    }
  };

  let rawPalette = randomPalette();
  const scopes = new Map<TuiWindow, Scope>();

  // ─── The desktop as the frame of reference ────────────────────────────────

  /** Cell aspect of the live grid — without it the organism is squashed. */
  const aspect = () => cellAspectFromMetrics(desktop.metrics);

  /** Zoom (columns per world unit) at which the world covers the desktop area. */
  const baseZoom = (): number => {
    const { rows, cols } = desktop.area;
    const perCol = Math.min(
      WORLD_SPAN / Math.max(1, cols),
      WORLD_SPAN / Math.max(1, rows * aspect()),
    );
    return 1 / perCol;
  };

  /** The magnification notch a slider can actually hold. */
  const quantiseMag = (mag: number): number =>
    2 ** (Math.floor(Math.log2(clamp(mag, MIN_MAG, MAX_MAG)) / MAG_STEP) * MAG_STEP);

  /** The deepest magnification at which `rect` still shows everything the desktop covers. */
  const coverMag = (rect: CellRect): number =>
    quantiseMag(
      Math.min(
        rect.cols / Math.max(1, desktop.area.cols),
        rect.rows / Math.max(1, desktop.area.rows),
      ),
    );

  /** Scratch viewport for the desktop-wide mapping used to place new scopes. */
  let base: Viewport | null = null;
  const baseVp = (): Viewport => {
    base ??= createViewport({ cellAspect: aspect() });
    base.setCenter(0, 0);
    base.setZoom(baseZoom());
    return base;
  };

  /** The world point under a desktop cell at ×1 — where a window sits *is* what it sees. */
  const worldAtCell = (row: number, col: number) =>
    baseVp().cellToWorld({ row, col }, desktop.area);

  /** The world region the desktop area covers at ×1. */
  const worldFrame = () => baseVp().visibleRect(desktop.area);

  /**
   * A new scope aims where it sits — but never outside the world the desktop
   * covers. For a deep scope the clamp does nothing; for one wide enough to
   * hold the whole frame it collapses to the middle, which is how the overview
   * ends up centred on the organism without being special-cased.
   */
  const aimInsideWorld = (
    centre: { x: number; y: number },
    rect: CellRect,
    mag: number,
  ) => {
    const frame = worldFrame();
    const perCol = 1 / (baseZoom() * mag);
    const half = { x: (rect.cols * perCol) / 2, y: (rect.rows * perCol * aspect()) / 2 };
    const axis = (v: number, lo: number, size: number, h: number) =>
      size <= h * 2 ? lo + size / 2 : clamp(v, lo + h, lo + size - h);
    return {
      x: axis(centre.x, frame.x, frame.w, half.x),
      y: axis(centre.y, frame.y, frame.h, half.y),
    };
  };

  // ─── Window geometry ──────────────────────────────────────────────────────

  /** The one-row zoom footer at the bottom of a scope's inner rect, if it fits. */
  const footerRect = (inner: CellRect): CellRect | null =>
    inner.rows >= 4 && inner.cols >= 14
      ? cellRect(inner.row + inner.rows - 1, inner.col, 1, inner.cols)
      : null;

  /** The part of a scope's inner rect the organism is drawn into. */
  const canvasRect = (inner: CellRect): CellRect =>
    footerRect(inner)
      ? cellRect(inner.row, inner.col, inner.rows - 1, inner.cols)
      : inner;

  // ─── Drawing a scope ──────────────────────────────────────────────────────

  /**
   * The world region a deeper scope is looking at, drawn as a dashed box with
   * its tag. Two windows on one feature only read as two windows on one
   * feature if the shallower one shows where the deeper one is pointed.
   */
  const drawFrames = (buf: GlyphBuffer, rect: CellRect, me: Scope) => {
    const theme = desktop.theme;
    for (const other of scopes.values()) {
      if (other === me || !other.win.visible || other.win.minimized) continue;
      if (other.mag < me.mag * FRAME_ZOOM_RATIO) continue;
      const otherCanvas = canvasRect(other.win.inner);
      if (isEmptyCellRect(otherCanvas)) continue;
      other.vp.setZoom(baseZoom() * other.mag);
      const world = other.vp.visibleRect(otherCanvas);
      const a = me.vp.worldToCell({ x: world.x, y: world.y }, rect);
      const b = me.vp.worldToCell(
        { x: world.x + world.w, y: world.y + world.h },
        rect,
      );
      frameBox(buf, rect, a, b, other.tag, theme);
    }
  };

  /** `┌┄┐` box (or a crosshair when it collapses) with a reverse-video tag. */
  const frameBox = (
    buf: GlyphBuffer,
    rect: CellRect,
    a: { row: number; col: number },
    b: { row: number; col: number },
    tag: string,
    theme: TuiTheme,
  ) => {
    if (!Number.isFinite(a.col) || !Number.isFinite(b.col)) return;
    if (!Number.isFinite(a.row) || !Number.isFinite(b.row)) return;
    const row0 = Math.round(a.row);
    const col0 = Math.round(a.col);
    const row1 = Math.round(b.row);
    const col1 = Math.round(b.col);
    const right = rect.col + rect.cols;
    const bottom = rect.row + rect.rows;
    if (col1 < rect.col || col0 >= right || row1 < rect.row || row0 >= bottom) return;
    const fg = theme.accent;
    if (col1 - col0 < 3 || row1 - row0 < 2) {
      const r = Math.round((row0 + row1) / 2);
      const c = Math.round((col0 + col1) / 2);
      buf.put(r, c, '┼', fg);
      buf.text(r, c + 2, tag, fg);
      return;
    }
    for (let c = col0 + 1; c < col1; c++) {
      buf.put(row0, c, '┄', fg);
      buf.put(row1, c, '┄', fg);
    }
    for (let r = row0 + 1; r < row1; r++) {
      buf.put(r, col0, '┊', fg);
      buf.put(r, col1, '┊', fg);
    }
    buf.put(row0, col0, '┌', fg);
    buf.put(row0, col1, '┐', fg);
    buf.put(row1, col0, '└', fg);
    buf.put(row1, col1, '┘', fg);
    buf.text(row0, col0 + 1, ` ${tag} `, theme.bg, fg, Math.max(0, col1 - col0 - 1));
  };

  const drawScope = (buf: GlyphBuffer, inner: CellRect, win: TuiWindow) => {
    const scope = scopes.get(win);
    if (!scope || isEmptyCellRect(inner)) return;
    const theme = desktop.theme;
    const rect = canvasRect(inner);
    // The absolute zoom is always derived, so a desktop resize (which changes
    // what ×1 means) never desynchronises a scope from its stated magnification.
    scope.vp.setZoom(baseZoom() * scope.mag);
    if (!isEmptyCellRect(rect)) {
      drawGrowth(buf, rect, growth.state, scope.vp, theme, {
        color: theme.fg,
        nodeColor: theme.accent,
      });
      if (showFrames) buf.clip(rect, () => drawFrames(buf, rect, scope));
    }
    const foot = footerRect(inner);
    if (foot) scope.zoom.draw(buf, foot, theme, scope.hot || scope.zoom.dragging);
  };

  // ─── Drawing the readout ──────────────────────────────────────────────────

  /** A column chart of `values`, newest at the right, scaled to its own maximum. */
  const chart = (
    buf: GlyphBuffer,
    rect: CellRect,
    values: number[],
    fg: string,
  ) => {
    if (isEmptyCellRect(rect) || values.length === 0) return;
    const n = Math.min(rect.cols, values.length);
    const slice = values.slice(values.length - n);
    let max = 0;
    for (const v of slice) if (v > max) max = v;
    if (max <= 0) return;
    for (let i = 0; i < n; i++) {
      const eighths = Math.round((Math.max(0, slice[i]) / max) * rect.rows * 8);
      const full = Math.floor(eighths / 8);
      const rem = eighths % 8;
      const col = rect.col + rect.cols - n + i;
      for (let r = 0; r < full && r < rect.rows; r++) {
        buf.put(rect.row + rect.rows - 1 - r, col, '█', fg);
      }
      if (full < rect.rows && rem > 0) {
        buf.put(rect.row + rect.rows - 1 - full, col, BARS[rem - 1], fg);
      }
    }
  };

  /** How the parameter table packs into `cols` cells: as many columns as fit. */
  const paramLayout = (cols: number) => {
    const columns = clamp(Math.floor(cols / PARAM_COL_W), 1, 5);
    return { columns, rows: Math.ceil(PARAM_COUNT / columns) };
  };

  /** The live parameters as a tabular table — labels dim, numbers in ink. */
  const paramTable = (buf: GlyphBuffer, rect: CellRect, theme: TuiTheme) => {
    const p: GrowthParams = growth.params;
    const entries: [string, string][] = [
      ['attraction', p.attraction.toFixed(3)],
      ['repulsion', p.repulsion.toFixed(3)],
      ['radius', p.repulsionRadius.toFixed(3)],
      ['alignment', p.alignment.toFixed(3)],
      ['max edge', p.maxEdgeLength.toFixed(3)],
      ['min edge', p.minEdgeLength.toFixed(3)],
      ['injection', p.injectionRate.toFixed(3)],
      ['speed', p.speed.toFixed(3)],
      ['steps/frame', rate.toFixed(2)],
      ['max nodes', String(p.maxNodes)],
    ];
    const { columns, rows } = paramLayout(rect.cols);
    entries.forEach(([label, value], i) => {
      const r = rect.row + (i % rows);
      const c = rect.col + Math.floor(i / rows) * PARAM_COL_W;
      if (i % rows >= rect.rows) return;
      if (c + PARAM_COL_W - 2 > rect.col + rect.cols) return;
      void columns;
      buf.text(r, c, label.padEnd(12), theme.dim, undefined, PARAM_COL_W - 1);
      buf.text(r, c + 12, value.padStart(8), theme.fg, undefined, PARAM_COL_W - 13);
    });
  };

  /** One labelled series: name and now/peak on the label row, the chart below. */
  const series = (
    buf: GlyphBuffer,
    rect: CellRect,
    label: string,
    values: number[],
    fg: string,
    fmt: (v: number) => string,
  ) => {
    if (isEmptyCellRect(rect)) return;
    const theme = desktop.theme;
    const now = values[values.length - 1] ?? 0;
    let peak = 0;
    for (const v of values) if (v > peak) peak = v;
    buf.text(rect.row, rect.col, label, theme.dim, undefined, rect.cols);
    const readout = `${fmt(now)} now   ${fmt(peak)} peak`;
    buf.text(
      rect.row,
      rect.col + Math.max(0, rect.cols - readout.length),
      readout,
      theme.dim,
    );
    chart(
      buf,
      cellRect(rect.row + 1, rect.col, rect.rows - 1, rect.cols),
      values,
      fg,
    );
  };

  /**
   * The instrument that is not a picture: the organism's size and how fast it
   * is gaining material, as column charts over the live parameters.
   */
  const drawReadout = (buf: GlyphBuffer, inner: CellRect) => {
    if (isEmptyCellRect(inner)) return;
    const theme = desktop.theme;
    const head =
      `step ${String(growth.state.step).padStart(6)}` +
      `   nodes ${String(growth.state.nodes.length).padStart(6)}` +
      `   perimeter ${perimeter(growth.state).toFixed(1).padStart(9)}`;
    buf.text(inner.row, inner.col, head, theme.fg, undefined, inner.cols);

    const table = paramLayout(inner.cols);
    const bottom = inner.row + inner.rows;
    // Charts take everything between the header and the table (plus a rule).
    const top = inner.row + 2;
    const tableRow = bottom - table.rows;
    const chartRows = tableRow - 1 - top;
    if (chartRows >= 2 && inner.cols >= 24) {
      const gap = 3;
      const w = Math.floor((inner.cols - gap) / 2);
      series(
        buf,
        cellRect(top, inner.col, chartRows, w),
        'nodes',
        history.map((h) => h.nodes),
        theme.accent,
        (v) => v.toFixed(0),
      );
      series(
        buf,
        cellRect(top, inner.col + w + gap, chartRows, inner.cols - w - gap),
        'new nodes / step',
        history.map((h) => h.rate),
        theme.fg,
        (v) => v.toFixed(2),
      );
      buf.hline(tableRow - 1, inner.col, inner.cols, theme.frame);
    }
    if (tableRow > inner.row) {
      paramTable(
        buf,
        cellRect(tableRow, inner.col, bottom - tableRow, inner.cols),
        theme,
      );
    }
  };

  // ─── Scopes ───────────────────────────────────────────────────────────────

  /** Zoom about a cell, keeping the world point under it fixed, then restate the magnification. */
  const zoomAt = (scope: Scope, factor: number, cell?: Cell, rect?: CellRect) => {
    scope.vp.setZoom(baseZoom() * scope.mag);
    if (cell && rect) {
      scope.vp.zoomBy(factor, { row: cell.row + 0.5, col: cell.col + 0.5 }, rect);
    } else {
      scope.vp.zoomBy(factor);
    }
    // The slider quantises; the anchored centre shift above is kept either way.
    scope.zoom.value = Math.log2(
      clamp(scope.vp.zoom / baseZoom(), MIN_MAG, MAX_MAG),
    );
  };

  const addScope = (name: string, rect: CellRect, mag: number): TuiWindow => {
    const tag = /\d+/.exec(name)?.[0] ?? String(scopes.size + 1);
    const centre = aimInsideWorld(
      worldAtCell(rect.row + rect.rows / 2, rect.col + rect.cols / 2),
      rect,
      mag,
    );
    const vp = createViewport({
      center: centre,
      zoom: baseZoom() * mag,
      cellAspect: aspect(),
    });

    /** Assigned right after the window exists; every handler reads it lazily. */
    let scope: Scope | undefined;

    const zoom = createRange({
      id: `zoom:${name}`,
      label: 'zoom',
      min: Math.log2(MIN_MAG),
      max: Math.log2(MAX_MAG),
      step: MAG_STEP,
      value: Math.log2(mag),
      inline: true,
      format: (v) => fmtMag(2 ** v),
      onChange: (v) => {
        if (scope) scope.mag = clamp(2 ** v, MIN_MAG, MAX_MAG);
        props.render();
      },
    });

    const content: TuiContent = {
      pointerDown(cell, inner) {
        if (!scope) return false;
        const foot = footerRect(inner);
        if (foot && cell.row === foot.row) return scope.zoom.pointerDown(cell, foot);
        scope.drag = { row: cell.row, col: cell.col };
        return true;
      },
      pointerMove(cell, inner) {
        if (!scope) return false;
        const foot = footerRect(inner);
        let changed = false;
        if (foot) {
          const over = cell.row === foot.row && cellRectContains(foot, cell.row, cell.col);
          if (over !== scope.hot) {
            scope.hot = over;
            changed = true;
          }
          if (scope.zoom.dragging) return scope.zoom.pointerMove(cell, foot) || changed;
        }
        if (!scope.drag) return changed;
        const dCol = cell.col - scope.drag.col;
        const dRow = cell.row - scope.drag.row;
        if (dCol === 0 && dRow === 0) return changed;
        scope.drag = { row: cell.row, col: cell.col };
        scope.vp.setZoom(baseZoom() * scope.mag);
        // `pan` moves the view: negate the pointer delta so the organism
        // travels with the pointer instead of away from it.
        scope.vp.pan(-dCol, -dRow);
        return true;
      },
      pointerUp(cell, inner) {
        if (!scope) return false;
        const foot = footerRect(inner);
        if (foot && scope.zoom.dragging) {
          scope.drag = null;
          return scope.zoom.pointerUp(cell, foot);
        }
        const wasPanning = scope.drag !== null;
        scope.drag = null;
        return wasPanning;
      },
      cursorAt(cell, inner) {
        if (!scope) return null;
        const foot = footerRect(inner);
        if (foot && cell.row === foot.row) return scope.zoom.cursorAt(cell, foot);
        return scope.drag ? 'grabbing' : 'grab';
      },
    };

    const win = desktop.addWindow({
      title: name,
      rect,
      minRows: 5,
      minCols: 18,
      draw: drawScope,
      content,
      onClose: (w) => {
        scopes.delete(w);
        desktop.removeWindow(w);
      },
    });
    scope = { win, name, tag, vp, mag, zoom, hot: false, drag: null };
    scopes.set(win, scope);
    return win;
  };

  const addReadout = (rect: CellRect): TuiWindow =>
    desktop.addWindow({
      title: 'readout',
      rect,
      minRows: 5,
      minCols: 24,
      draw: (buf, inner) => drawReadout(buf, inner),
      onClose: (w) => desktop.removeWindow(w),
    });

  /**
   * Four windows tiling the desktop: the overview top-left, two deep scopes
   * stacked in the right column, the readout as a strip along the bottom.
   */
  const relayout = () => {
    for (const win of [...desktop.windows]) desktop.removeWindow(win);
    scopes.clear();
    const area = desktop.area;
    const splitRow = clamp(Math.round(area.rows * 0.7), 8, Math.max(8, area.rows - 6));
    const splitCol = clamp(Math.round(area.cols * 0.65), 30, Math.max(30, area.cols - 24));
    const rightSplit = clamp(Math.round(splitRow / 2), 5, Math.max(5, splitRow - 5));
    addReadout(
      cellRect(area.row + splitRow, area.col, area.rows - splitRow, area.cols),
    );
    addScope(
      'scope 03',
      cellRect(
        area.row + rightSplit,
        area.col + splitCol,
        splitRow - rightSplit,
        area.cols - splitCol,
      ),
      SCOPE_MAGS[1],
    );
    addScope(
      'scope 02',
      cellRect(area.row, area.col + splitCol, rightSplit, area.cols - splitCol),
      SCOPE_MAGS[0],
    );
    // The overview is added last, so it is the front window. Its magnification
    // is the deepest that still shows everything the desktop covers, which is
    // what puts the other scopes' frames inside it.
    const overview = cellRect(area.row, area.col, splitRow, splitCol);
    addScope('scope 01', overview, coverMag(overview));
  };

  /** `+ new`: another hole cut over the same world, cascaded from the front window. */
  const newScope = () => {
    const area = desktop.area;
    let max = 0;
    for (const scope of scopes.values()) max = Math.max(max, Number(scope.tag));
    const rows = clamp(Math.round(area.rows * 0.42), 6, area.rows);
    const cols = clamp(Math.round(area.cols * 0.3), 20, area.cols);
    const front = desktop.windows[desktop.windows.length - 1];
    const row = clamp(
      front ? front.rect.row + 2 : area.row,
      area.row,
      Math.max(area.row, area.row + area.rows - rows),
    );
    const col = clamp(
      front ? front.rect.col + 4 : area.col,
      area.col,
      Math.max(area.col, area.col + area.cols - cols),
    );
    addScope(
      `scope ${String(max + 1).padStart(2, '0')}`,
      cellRect(row, col, rows, cols),
      NEW_SCOPE_MAG,
    );
    props.render();
  };

  const reseed = () => {
    seed = randomSeed();
    growth.reseed(seed);
    history.length = 0;
    stepAcc = 0;
    sample();
    props.render();
  };

  const newPalette = () => {
    const previous = rawPalette;
    for (let tries = 0; tries < 8 && rawPalette === previous; tries++) {
      rawPalette = randomPalette();
    }
    desktop.setTheme(rawPalette);
    props.render();
  };

  // ─── Settings controls ────────────────────────────────────────────────────

  /** A range bound to one live simulation parameter — `params` is re-read every step. */
  const param = (
    id: keyof GrowthParams,
    label: string,
    min: number,
    max: number,
    step: number,
  ): TuiControl =>
    createRange({
      id,
      label,
      min,
      max,
      step,
      value: growth.params[id],
      inline: true,
      onChange: (v) => {
        growth.params[id] = v;
        props.render();
      },
    });

  const controls: TuiControl[] = [
    createRange({
      id: 'rate',
      label: 'steps/frame',
      min: 0.25,
      max: 4,
      step: 0.25,
      value: rate,
      inline: true,
      onChange: (v) => {
        rate = v;
        props.render();
      },
    }),
    // Below ≈0.8 the curve settles into a stable ring and stops growing —
    // the low end of this range holds the organism still on purpose.
    param('speed', 'speed', 0.5, 1.5, 0.05),
    param('attraction', 'attraction', 0.02, 0.6, 0.01),
    param('repulsion', 'repulsion', 0.02, 0.5, 0.01),
    param('repulsionRadius', 'radius', 0.3, 2, 0.05),
    param('alignment', 'alignment', 0, 1, 0.01),
    param('maxEdgeLength', 'max edge', 0.2, 1.2, 0.05),
    param('minEdgeLength', 'min edge', 0.05, 0.6, 0.01),
    param('injectionRate', 'injection', 0, 0.5, 0.01),
    createToggleGroup({
      active: ['animate', 'frames'],
      items: [
        { id: 'animate', label: 'animate' },
        { id: 'frames', label: 'scope frames' },
      ],
      onChange: (active) => {
        animate = active.includes('animate');
        showFrames = active.includes('frames');
        props.render();
      },
    }),
    createButton({ id: 'reseed', label: 'reseed', onPress: reseed }),
    createButton({ id: 'palette', label: 'new palette', onPress: newPalette }),
  ];

  // ─── Desktop ──────────────────────────────────────────────────────────────

  const desktop: Desktop = createDesktop({
    ctx: context,
    canvas,
    width,
    height,
    palette: rawPalette,
    settings: { controls, cols: 34 },
    status: () =>
      `seed ${seed} · step ${growth.state.step} · ${growth.state.nodes.length} nodes · x1 = ${WORLD_SPAN} units`,
    onNewWindow: newScope,
    onChange: () => props.render(),
  });

  relayout();

  // ─── Wheel zoom ───────────────────────────────────────────────────────────

  /** Wheel over a scope's body zooms it about the cursor (the desktop has no scroll). */
  const onWheel = (e: WheelEvent) => {
    if (desktop.settings?.visible) return;
    const pt = clientToLogical(canvas, e, () => [desktop.width, desktop.height]);
    const windows = desktop.windows;
    for (let i = windows.length - 1; i >= 0; i--) {
      const win = windows[i];
      if (!win.visible || !win.contains(pt)) return;
      const scope = scopes.get(win);
      if (!scope) return;
      const cell = desktop.metrics.toCell(pt);
      const rect = canvasRect(win.inner);
      if (!cellRectContains(rect, cell.row, cell.col)) return;
      e.preventDefault();
      zoomAt(scope, Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED), cell, rect);
      props.render();
      return;
    }
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const dispose = () => {
    canvas.removeEventListener('wheel', onWheel);
    desktop.dispose();
  };

  // ─── Frame ────────────────────────────────────────────────────────────────

  /** The HUD of the reference images, in glyphs: name, magnification, world centre. */
  const syncTitles = () => {
    for (const scope of scopes.values()) {
      scope.win.title = `${scope.name} · ${fmtMag(scope.mag)} · ${fmtCoord(scope.vp.center.x)} ${fmtCoord(scope.vp.center.y)}`;
    }
  };

  if (import.meta.env.DEV) {
    (window as unknown as { __demo?: unknown }).__demo = {
      desktop,
      growth,
      scopes,
      controls,
      advance,
      relayout,
      reseed,
      newPalette,
      newScope,
      zoomAt,
      baseZoom,
      worldAtCell,
      canvasRect,
      setAnimate: (on: boolean) => {
        animate = on;
      },
      setRate: (v: number) => {
        rate = v;
      },
      repaint: () => props.render(),
    };
  }

  wrap.resize = ({ width, height }: SketchProps) => desktop.resize(width, height);

  wrap.render = () => {
    if (animate) {
      stepAcc += rate;
      let steps = 0;
      while (stepAcc >= 1 && steps < MAX_STEPS_PER_FRAME) {
        stepAcc -= 1;
        steps++;
        growth.step();
        if (growth.state.step % SAMPLE_EVERY === 0) sample();
      }
      // Never bank a backlog: a slow frame must not turn into a burst.
      if (stepAcc >= 1) stepAcc = 0;
    }
    syncTitles();
    desktop.render();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  // No `dimensions`: ssam sizes the canvas to the viewport and calls `wrap.resize`.
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 20_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
