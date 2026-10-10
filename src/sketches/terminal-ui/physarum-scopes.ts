/**
 * physarum-scopes — one slime field, several instruments.
 *
 * physarum/basic's 16k agents (sense the trail ahead-left, ahead, ahead-right;
 * turn toward the strongest; step; deposit) run on a toroidal trail map in
 * world coordinates that diffuses and decays every step. Nothing is drawn to
 * the canvas directly: the field is only seen through terminal windows, the
 * way terminal-ui/differential-growth watches its curve.
 *
 * `field` fits the whole map and reads it as density shades. Every other
 * window is a scope locked onto a single junction — a local maximum of the
 * trail, where strands meet — at a magnification where individual agents
 * resolve as heading arrows. Scopes re-aim at the nearest junction as the
 * network rewires (`track`), and their fields of view are drawn inside the
 * overview as tagged boxes, so the windows read as one subject.
 *
 * Drag a scope's body to pan it, wheel to zoom, `+ new` to open a scope on the
 * next unwatched junction. The readout charts the junction count and the
 * share of the map the network covers over the live parameters.
 *
 * `src/tui/` and ./viewport are libraries here and are not modified.
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
  type TuiTheme,
  type TuiWindow,
} from '../../tui';
import { cellAspectFromMetrics, createViewport, type Viewport } from './viewport';

// ─── Constants ───────────────────────────────────────────────────────────────

/** The trail map, in world units (one unit = one trail cell). */
const WORLD_W = 384;
const WORLD_H = 240;
/** physarum/basic's count. */
const AGENTS = 4000 * 4;
/** Steps run before the first frame, so the network has formed when it opens. */
const WARMUP = 420;
/** Junction search works on blocks of this many trail cells. */
const BLOCK = 6;
/** Two junctions are never closer than this, in world units. */
const JUNCTION_SPACING = 22;
/** Radius of the ring that counts a junction's arms, in world units. */
const ARM_RADIUS = 13;
/** Steps between junction searches. */
const JUNCTION_EVERY = 12;
/** Magnification (world units per column) of a scope. */
const SCOPE_UNITS_PER_COL = 1.25;
/** Below this many world units per column, agents are drawn one by one. */
const AGENT_DETAIL = 2.2;
const HISTORY = 480;
const MAX_STEPS_PER_FRAME = 4;
const WHEEL_ZOOM_SPEED = 0.004;
/** Shade ramp, from faint trail to saturated strand. */
const RAMP = ['·', '░', '▒', '▓', '█'] as const;
/** Trail level (relative to the field's 98th percentile) for each ramp step. */
const RAMP_LEVELS = [0.04, 0.14, 0.32, 0.58, 0.85] as const;
/** Heading arrows, east first, clockwise in screen space (y down). */
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'] as const;
const BARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrapX = (x: number) => ((x % WORLD_W) + WORLD_W) % WORLD_W;
const wrapY = (y: number) => ((y % WORLD_H) + WORLD_H) % WORLD_H;
const fmt1 = (v: number): string => `${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(0).padStart(3, '0')}`;

/** mulberry32: the same seed always grows the same network. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randomSeed = (): number => Math.floor(Math.random() * 0xffffff) + 1;

// ─── The field ───────────────────────────────────────────────────────────────

interface PhysarumParams {
  sensorAngle: number;
  sensorDist: number;
  rotation: number;
  speed: number;
  deposit: number;
  /** Fraction of trail kept per step. */
  decay: number;
}

interface Junction {
  x: number;
  y: number;
  v: number;
  /** Strands crossing a ring around the peak. */
  arms: number;
}

function createField(seed: number) {
  const params: PhysarumParams = {
    sensorAngle: Math.PI / 8,
    sensorDist: 9,
    rotation: Math.PI / 4,
    speed: 1,
    deposit: 5,
    decay: 0.9,
  };
  const ax = new Float32Array(AGENTS);
  const ay = new Float32Array(AGENTS);
  const ah = new Float32Array(AGENTS);
  let trail = new Float32Array(WORLD_W * WORLD_H);
  let scratch = new Float32Array(WORLD_W * WORLD_H);
  let rand = prng(seed);
  let step = 0;
  /** Normalisation for the shade ramp, refreshed with the junctions. */
  let ref = 1;
  let junctions: Junction[] = [];

  const reseed = (s: number) => {
    rand = prng(s);
    trail.fill(0);
    step = 0;
    // Scattered uniformly with random headings, as physarum/basic starts.
    for (let i = 0; i < AGENTS; i++) {
      ax[i] = rand() * WORLD_W;
      ay[i] = rand() * WORLD_H;
      ah[i] = rand() * TAU;
    }
  };

  const sense = (x: number, y: number, h: number) => {
    const sx = wrapX(Math.floor(x + Math.cos(h) * params.sensorDist));
    const sy = wrapY(Math.floor(y + Math.sin(h) * params.sensorDist));
    return trail[sy * WORLD_W + sx];
  };

  const advance = () => {
    const { sensorAngle: sa, rotation: rot, speed, deposit } = params;
    for (let i = 0; i < AGENTS; i++) {
      const x = ax[i];
      const y = ay[i];
      let h = ah[i];
      const f = sense(x, y, h);
      const l = sense(x, y, h - sa);
      const r = sense(x, y, h + sa);
      if (f > l && f > r) {
        // keep heading
      } else if (f < l && f < r) h += rand() < 0.5 ? rot : -rot;
      else if (l > r) h -= rot;
      else if (r > l) h += rot;
      const nx = wrapX(x + Math.cos(h) * speed);
      const ny = wrapY(y + Math.sin(h) * speed);
      ax[i] = nx;
      ay[i] = ny;
      ah[i] = h;
      trail[Math.floor(ny) * WORLD_W + Math.floor(nx)] += deposit;
    }
    // 3×3 box blur with wrap, then decay.
    const k = params.decay / 9;
    for (let y = 0; y < WORLD_H; y++) {
      const y0 = ((y + WORLD_H - 1) % WORLD_H) * WORLD_W;
      const y1 = y * WORLD_W;
      const y2 = ((y + 1) % WORLD_H) * WORLD_W;
      for (let x = 0; x < WORLD_W; x++) {
        const x0 = (x + WORLD_W - 1) % WORLD_W;
        const x2 = (x + 1) % WORLD_W;
        scratch[y1 + x] =
          (trail[y0 + x0] + trail[y0 + x] + trail[y0 + x2] +
            trail[y1 + x0] + trail[y1 + x] + trail[y1 + x2] +
            trail[y2 + x0] + trail[y2 + x] + trail[y2 + x2]) * k;
      }
    }
    const t = trail;
    trail = scratch;
    scratch = t;
    step++;
    if (step % JUNCTION_EVERY === 0) findJunctions();
  };

  /**
   * Junctions: blocks whose summed trail beats all eight neighbours, strongest
   * first, thinned so no two sit closer than `JUNCTION_SPACING`. A block
   * maximum on a network is where strands pile into each other.
   */
  const findJunctions = () => {
    const bw = Math.floor(WORLD_W / BLOCK);
    const bh = Math.floor(WORLD_H / BLOCK);
    const sums = new Float32Array(bw * bh);
    const samples: number[] = [];
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        let s = 0;
        for (let y = by * BLOCK; y < (by + 1) * BLOCK; y++) {
          for (let x = bx * BLOCK; x < (bx + 1) * BLOCK; x++) s += trail[y * WORLD_W + x];
        }
        sums[by * bw + bx] = s;
      }
    }
    for (let i = 0; i < trail.length; i += 97) samples.push(trail[i]);
    samples.sort((a, b) => a - b);
    ref = Math.max(1e-3, samples[Math.floor(samples.length * 0.98)]);

    const peaks: Junction[] = [];
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const v = sums[by * bw + bx];
        let max = true;
        for (let dy = -1; dy <= 1 && max; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const n = sums[((by + dy + bh) % bh) * bw + ((bx + dx + bw) % bw)];
            if (n > v) {
              max = false;
              break;
            }
          }
        }
        if (max && v > 0) peaks.push({ x: (bx + 0.5) * BLOCK, y: (by + 0.5) * BLOCK, v, arms: 0 });
      }
    }
    // Rank by arms first: a peak on a plain strand has two, a junction three or more.
    for (const p of peaks) p.arms = arms(p.x, p.y);
    peaks.sort((a, b) => Math.min(b.arms, 4) - Math.min(a.arms, 4) || b.v - a.v);
    const kept: Junction[] = [];
    for (const p of peaks) {
      if (kept.every((q) => Math.hypot(torusDx(p.x, q.x), torusDy(p.y, q.y)) >= JUNCTION_SPACING)) {
        kept.push(p);
      }
    }
    junctions = kept;
  };

  /**
   * Count the strands leaving a point: walk a ring of `ARM_RADIUS` and count
   * runs of trail above a threshold. Two runs is a strand passing through;
   * three or more is a junction.
   */
  const arms = (x: number, y: number): number => {
    const t = 0.3 * ref;
    const n = 64;
    const on: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      on.push(at(x + Math.cos(a) * ARM_RADIUS, y + Math.sin(a) * ARM_RADIUS) >= t);
    }
    let runs = 0;
    for (let i = 0; i < n; i++) if (on[i] && !on[(i + n - 1) % n]) runs++;
    return runs;
  };

  /** Trail at a world point (wrapped, nearest cell). */
  const at = (x: number, y: number): number =>
    trail[wrapY(Math.floor(y)) * WORLD_W + wrapX(Math.floor(x))];

  reseed(seed);
  return {
    params,
    ax,
    ay,
    ah,
    at,
    advance,
    reseed,
    findJunctions,
    get step() {
      return step;
    },
    get ref() {
      return ref;
    },
    get junctions() {
      return junctions;
    },
    /** Share of the map the network covers: cells above the ramp's second step. */
    coverage(): number {
      const t = RAMP_LEVELS[1] * ref;
      let n = 0;
      let m = 0;
      for (let i = 0; i < trail.length; i += 5, m++) if (trail[i] >= t) n++;
      return n / m;
    },
  };
}

/** Shortest signed separations on the torus. */
const torusDx = (a: number, b: number) => {
  const d = wrapX(a - b);
  return d > WORLD_W / 2 ? d - WORLD_W : d;
};
const torusDy = (a: number, b: number) => {
  const d = wrapY(a - b);
  return d > WORLD_H / 2 ? d - WORLD_H : d;
};

type Field = ReturnType<typeof createField>;

// ─── Sketch ──────────────────────────────────────────────────────────────────

interface Sample {
  junctions: number;
  coverage: number;
}

interface Scope {
  win: TuiWindow;
  name: string;
  tag: string;
  vp: Viewport;
  /** The field-wide view fits the map instead of holding a fixed zoom. */
  overview: boolean;
  drag: Cell | null;
}

export const sketch = ({ wrap, context, canvas, width, height, ...props }: SketchProps) => {
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

  let seed = randomSeed();
  const field: Field = createField(seed);
  const history: Sample[] = [];
  const sample = () => {
    history.push({ junctions: field.junctions.length, coverage: field.coverage() });
    if (history.length > HISTORY) history.shift();
  };
  const warm = () => {
    for (let i = 0; i < WARMUP; i++) {
      field.advance();
      if (field.step % JUNCTION_EVERY === 0) sample();
    }
  };
  warm();

  let animate = true;
  let track = true;
  let showFrames = true;
  let rate = 1;
  let stepAcc = 0;
  let rawPalette = randomPalette();
  const scopes = new Map<TuiWindow, Scope>();

  const aspect = () => cellAspectFromMetrics(desktop.metrics);

  // ─── Drawing the field through a viewport ─────────────────────────────────

  /**
   * One glyph per cell: the trail sampled on a 3×3 lattice over the cell's
   * world footprint, mapped through the shade ramp. When a column spans only a
   * couple of world units the agents are drawn on top as heading arrows.
   */
  const drawField = (buf: GlyphBuffer, rect: CellRect, vp: Viewport, theme: TuiTheme) => {
    const { worldPerCol: wc, worldPerRow: wr } = vp;
    const ref = field.ref;
    buf.clip(rect, () => {
      for (let r = 0; r < rect.rows; r++) {
        for (let c = 0; c < rect.cols; c++) {
          const p = vp.cellToWorld({ row: rect.row + r, col: rect.col + c }, rect);
          let s = 0;
          for (let j = 0; j < 3; j++) {
            for (let i = 0; i < 3; i++) s += field.at(p.x + ((i + 0.5) / 3) * wc, p.y + ((j + 0.5) / 3) * wr);
          }
          const v = s / 9 / ref;
          let step = -1;
          for (let k = 0; k < RAMP_LEVELS.length; k++) if (v >= RAMP_LEVELS[k]) step = k;
          if (step >= 0) buf.put(rect.row + r, rect.col + c, RAMP[step], step === 0 ? theme.dim : theme.fg);
        }
      }
      if (wc > AGENT_DETAIL) return;
      // Agents: wrapped into the view's neighbourhood so a scope near the seam still sees them.
      const vis = vp.visibleRect(rect);
      for (let i = 0; i < AGENTS; i++) {
        const x = vis.x + wrapX(field.ax[i] - vis.x);
        const y = vis.y + wrapY(field.ay[i] - vis.y);
        if (x > vis.x + vis.w || y > vis.y + vis.h) continue;
        const cell = vp.worldToCell({ x, y }, rect);
        const h = ((field.ah[i] % TAU) + TAU) % TAU;
        buf.put(Math.floor(cell.row), Math.floor(cell.col), ARROWS[Math.round(h / (TAU / 8)) % 8], theme.accent);
      }
    });
  };

  /** A deeper scope's field of view, as a dashed box with its tag. */
  const frameBox = (buf: GlyphBuffer, rect: CellRect, me: Scope, other: Scope, theme: TuiTheme) => {
    const oRect = other.win.inner;
    if (isEmptyCellRect(oRect)) return;
    const w = other.vp.visibleRect(oRect);
    // Draw the copy of the box nearest this view's centre (the map is a torus).
    const cx = me.vp.center.x + torusDx(w.x + w.w / 2, me.vp.center.x);
    const cy = me.vp.center.y + torusDy(w.y + w.h / 2, me.vp.center.y);
    const a = me.vp.worldToCell({ x: cx - w.w / 2, y: cy - w.h / 2 }, rect);
    const b = me.vp.worldToCell({ x: cx + w.w / 2, y: cy + w.h / 2 }, rect);
    const row0 = Math.round(a.row);
    const col0 = Math.round(a.col);
    const row1 = Math.max(row0 + 2, Math.round(b.row));
    const col1 = Math.max(col0 + 3, Math.round(b.col));
    const fg = theme.accent;
    buf.clip(rect, () => {
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
      buf.text(row0, col0 + 1, ` ${other.tag} `, theme.bg, fg);
    });
  };

  const fitOverview = (scope: Scope) => {
    scope.vp.fit({ x: 0, y: 0, w: WORLD_W, h: WORLD_H }, scope.win.inner, 0);
  };

  const drawScope = (buf: GlyphBuffer, inner: CellRect, win: TuiWindow) => {
    const scope = scopes.get(win);
    if (!scope || isEmptyCellRect(inner)) return;
    const theme = desktop.theme;
    if (scope.overview) fitOverview(scope);
    drawField(buf, inner, scope.vp, theme);
    if (!showFrames) return;
    for (const other of scopes.values()) {
      if (other === scope || other.overview || !other.win.visible || other.win.minimized) continue;
      if (other.vp.worldPerCol * 1.8 > scope.vp.worldPerCol) continue;
      frameBox(buf, inner, scope, other, theme);
    }
  };

  // ─── Readout ──────────────────────────────────────────────────────────────

  const chart = (buf: GlyphBuffer, rect: CellRect, values: number[], fg: string) => {
    if (isEmptyCellRect(rect) || values.length === 0) return;
    const n = Math.min(rect.cols, values.length);
    const slice = values.slice(values.length - n);
    const max = Math.max(...slice);
    if (max <= 0) return;
    for (let i = 0; i < n; i++) {
      const eighths = Math.round((Math.max(0, slice[i]) / max) * rect.rows * 8);
      const full = Math.floor(eighths / 8);
      const rem = eighths % 8;
      const col = rect.col + rect.cols - n + i;
      for (let r = 0; r < full && r < rect.rows; r++) buf.put(rect.row + rect.rows - 1 - r, col, '█', fg);
      if (full < rect.rows && rem > 0) buf.put(rect.row + rect.rows - 1 - full, col, BARS[rem - 1], fg);
    }
  };

  const series = (
    buf: GlyphBuffer,
    rect: CellRect,
    label: string,
    values: number[],
    fg: string,
    f: (v: number) => string,
  ) => {
    if (isEmptyCellRect(rect)) return;
    const theme = desktop.theme;
    const now = values[values.length - 1] ?? 0;
    buf.text(rect.row, rect.col, label, theme.dim, undefined, rect.cols);
    const readout = `${f(now)} now`;
    buf.text(rect.row, rect.col + Math.max(0, rect.cols - readout.length), readout, theme.dim);
    chart(buf, cellRect(rect.row + 1, rect.col, rect.rows - 1, rect.cols), values, fg);
  };

  const drawReadout = (buf: GlyphBuffer, inner: CellRect) => {
    if (isEmptyCellRect(inner)) return;
    const theme = desktop.theme;
    const p = field.params;
    const head =
      `step ${String(field.step).padStart(6)}   agents ${AGENTS}   junctions ${String(field.junctions.length).padStart(3)}`;
    buf.text(inner.row, inner.col, head, theme.fg, undefined, inner.cols);
    const params =
      `sensor ${((p.sensorAngle * 180) / Math.PI).toFixed(0)}° @ ${p.sensorDist.toFixed(1)}   ` +
      `turn ${((p.rotation * 180) / Math.PI).toFixed(0)}°   decay ${p.decay.toFixed(3)}   steps/frame ${rate.toFixed(2)}`;
    buf.text(inner.row + inner.rows - 1, inner.col, params, theme.dim, undefined, inner.cols);
    const top = inner.row + 2;
    const rows = inner.rows - 4;
    if (rows < 2 || inner.cols < 24) return;
    const gap = 3;
    const w = Math.floor((inner.cols - gap) / 2);
    series(buf, cellRect(top, inner.col, rows, w), 'junctions', history.map((h) => h.junctions), theme.accent, (v) => v.toFixed(0));
    series(
      buf,
      cellRect(top, inner.col + w + gap, rows, inner.cols - w - gap),
      'network coverage',
      history.map((h) => h.coverage),
      theme.fg,
      (v) => `${(v * 100).toFixed(1)}%`,
    );
  };

  // ─── Scopes ───────────────────────────────────────────────────────────────

  /** The strongest junction no scope is already watching. */
  const freeJunction = (): Junction | null => {
    const watched = [...scopes.values()].filter((s) => !s.overview);
    for (const j of field.junctions) {
      const taken = watched.some(
        (s) => Math.hypot(torusDx(j.x, s.vp.center.x), torusDy(j.y, s.vp.center.y)) < JUNCTION_SPACING,
      );
      if (!taken) return j;
    }
    return field.junctions[0] ?? null;
  };

  /** Ease each tracking scope toward the junction nearest its centre. */
  const trackJunctions = () => {
    for (const s of scopes.values()) {
      if (s.overview || s.drag) continue;
      let best: Junction | null = null;
      let bestD = JUNCTION_SPACING * 1.5;
      for (const j of field.junctions) {
        const d = Math.hypot(torusDx(j.x, s.vp.center.x), torusDy(j.y, s.vp.center.y));
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (!best) continue;
      const dx = torusDx(best.x, s.vp.center.x);
      const dy = torusDy(best.y, s.vp.center.y);
      s.vp.setCenter(wrapX(s.vp.center.x + dx * 0.08), wrapY(s.vp.center.y + dy * 0.08));
    }
  };

  const addScope = (name: string, rect: CellRect, overview: boolean): TuiWindow => {
    const tag = /\d+/.exec(name)?.[0] ?? String(scopes.size + 1);
    const j = overview ? null : freeJunction();
    const vp = createViewport({
      center: j ? { x: j.x, y: j.y } : { x: WORLD_W / 2, y: WORLD_H / 2 },
      zoom: 1 / SCOPE_UNITS_PER_COL,
      cellAspect: aspect(),
      minZoom: 0.02,
      maxZoom: 4,
    });
    let scope: Scope | undefined;
    const content: TuiContent = {
      pointerDown(cell) {
        if (!scope || scope.overview) return false;
        scope.drag = { row: cell.row, col: cell.col };
        return true;
      },
      pointerMove(cell) {
        if (!scope?.drag) return false;
        const dCol = cell.col - scope.drag.col;
        const dRow = cell.row - scope.drag.row;
        if (!dCol && !dRow) return false;
        scope.drag = { row: cell.row, col: cell.col };
        scope.vp.pan(-dCol, -dRow);
        scope.vp.setCenter(wrapX(scope.vp.center.x), wrapY(scope.vp.center.y));
        return true;
      },
      pointerUp() {
        if (!scope) return false;
        const was = scope.drag !== null;
        scope.drag = null;
        return was;
      },
      cursorAt() {
        if (!scope || scope.overview) return null;
        return scope.drag ? 'grabbing' : 'grab';
      },
    };
    const win = desktop.addWindow({
      title: name,
      rect,
      minRows: 4,
      minCols: 14,
      draw: drawScope,
      content,
      onClose: (w) => {
        scopes.delete(w);
        desktop.removeWindow(w);
      },
    });
    scope = { win, name, tag, vp, overview, drag: null };
    scopes.set(win, scope);
    return win;
  };

  const addReadout = (rect: CellRect) =>
    desktop.addWindow({
      title: 'readout',
      rect,
      minRows: 5,
      minCols: 24,
      draw: (buf, inner) => drawReadout(buf, inner),
      onClose: (w) => desktop.removeWindow(w),
    });

  /** Field top-left, readout under it, three junction scopes stacked on the right. */
  const relayout = () => {
    for (const win of [...desktop.windows]) desktop.removeWindow(win);
    scopes.clear();
    const area = desktop.area;
    const splitCol = clamp(Math.round(area.cols * 0.62), 30, Math.max(30, area.cols - 20));
    const splitRow = clamp(Math.round(area.rows * 0.72), 8, Math.max(8, area.rows - 7));
    addReadout(cellRect(area.row + splitRow, area.col, area.rows - splitRow, splitCol));
    const n = 3;
    const h = Math.floor(area.rows / n);
    for (let i = 0; i < n; i++) {
      const row = area.row + i * h;
      const rows = i === n - 1 ? area.rows - i * h : h;
      addScope(`scope ${String(i + 2).padStart(2, '0')}`, cellRect(row, area.col + splitCol, rows, area.cols - splitCol), false);
    }
    addScope('field 01', cellRect(area.row, area.col, splitRow, splitCol), true);
  };

  const newScope = () => {
    const area = desktop.area;
    let max = 0;
    for (const s of scopes.values()) max = Math.max(max, Number(s.tag));
    const rows = clamp(Math.round(area.rows * 0.36), 6, area.rows);
    const cols = clamp(Math.round(area.cols * 0.26), 18, area.cols);
    const front = desktop.windows[desktop.windows.length - 1];
    const row = clamp(front ? front.rect.row + 2 : area.row, area.row, Math.max(area.row, area.row + area.rows - rows));
    const col = clamp(front ? front.rect.col + 4 : area.col, area.col, Math.max(area.col, area.col + area.cols - cols));
    addScope(`scope ${String(max + 1).padStart(2, '0')}`, cellRect(row, col, rows, cols), false);
    props.render();
  };

  const reseed = () => {
    seed = randomSeed();
    field.reseed(seed);
    history.length = 0;
    warm();
    for (const s of scopes.values()) {
      if (s.overview) continue;
      const j = freeJunction();
      if (j) s.vp.setCenter(j.x, j.y);
    }
    props.render();
  };

  const newPalette = () => {
    const previous = rawPalette;
    for (let tries = 0; tries < 8 && rawPalette === previous; tries++) rawPalette = randomPalette();
    desktop.setTheme(rawPalette);
    props.render();
  };

  const param = (id: keyof PhysarumParams, label: string, min: number, max: number, step: number): TuiControl =>
    createRange({
      id,
      label,
      min,
      max,
      step,
      value: field.params[id],
      inline: true,
      onChange: (v) => {
        field.params[id] = v;
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
    param('sensorAngle', 'sensor angle', 0.1, 1.5, 0.05),
    param('sensorDist', 'sensor dist', 2, 24, 0.5),
    param('rotation', 'turn', 0.1, 1.5, 0.05),
    param('decay', 'decay', 0.7, 0.98, 0.005),
    param('deposit', 'deposit', 1, 12, 0.5),
    createToggleGroup({
      active: ['animate', 'track', 'frames'],
      items: [
        { id: 'animate', label: 'animate' },
        { id: 'track', label: 'track' },
        { id: 'frames', label: 'frames' },
      ],
      onChange: (active) => {
        animate = active.includes('animate');
        track = active.includes('track');
        showFrames = active.includes('frames');
        props.render();
      },
    }),
    createButton({ id: 'reseed', label: 'reseed', onPress: reseed }),
    createButton({ id: 'palette', label: 'new palette', onPress: newPalette }),
  ];

  const desktop: Desktop = createDesktop({
    ctx: context,
    canvas,
    width,
    height,
    palette: rawPalette,
    settings: { controls, cols: 34 },
    status: () => `seed ${seed} · step ${field.step} · ${AGENTS} agents · ${field.junctions.length} junctions`,
    onNewWindow: newScope,
    onChange: () => props.render(),
  });

  relayout();

  const onWheel = (e: WheelEvent) => {
    if (desktop.settings?.visible) return;
    const pt = clientToLogical(canvas, e, () => [desktop.width, desktop.height]);
    const windows = desktop.windows;
    for (let i = windows.length - 1; i >= 0; i--) {
      const win = windows[i];
      if (!win.visible || !win.contains(pt)) continue;
      const scope = scopes.get(win);
      if (!scope || scope.overview) return;
      const cell = desktop.metrics.toCell(pt);
      if (!cellRectContains(win.inner, cell.row, cell.col)) return;
      e.preventDefault();
      scope.vp.zoomBy(Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED), { row: cell.row + 0.5, col: cell.col + 0.5 }, win.inner);
      props.render();
      return;
    }
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const dispose = () => {
    canvas.removeEventListener('wheel', onWheel);
    desktop.dispose();
  };

  const syncTitles = () => {
    for (const s of scopes.values()) {
      const mag = s.vp.worldPerCol;
      s.win.title = s.overview
        ? `${s.name} · ${WORLD_W}×${WORLD_H}`
        : `${s.name} · ${mag.toFixed(1)}u/col · ${fmt1(s.vp.center.x)} ${fmt1(s.vp.center.y)}`;
    }
  };

  wrap.resize = ({ width, height }: SketchProps) => desktop.resize(width, height);

  wrap.render = () => {
    if (animate) {
      stepAcc += rate;
      let steps = 0;
      while (stepAcc >= 1 && steps < MAX_STEPS_PER_FRAME) {
        stepAcc -= 1;
        steps++;
        field.advance();
        if (field.step % JUNCTION_EVERY === 0) sample();
      }
      if (stepAcc >= 1) stepAcc = 0;
    }
    if (track) trackJunctions();
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
