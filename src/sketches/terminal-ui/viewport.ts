/**
 * A glyph viewport onto the growth organism.
 *
 * One `GrowthState` lives in continuous world coordinates; a `Viewport` is one
 * window's eye on it — a centre, a zoom and the cell aspect ratio of the
 * character grid — plus the transform between world points and (fractional)
 * cell coordinates inside a given `CellRect`. `drawGrowth` renders the state
 * through that transform: at low zoom many segments land in one cell and the
 * cell reads as a density shade; at high zoom the curve is drawn with line
 * glyphs and individual nodes are marked.
 *
 * Pure and dependency-free: it imports the TUI grid types only, never the
 * simulation, so the two halves of the sketch can be built in parallel.
 */
import {
  SHADES,
  isEmptyCellRect,
  type CellRect,
  type GlyphBuffer,
  type TuiMetrics,
  type TuiTheme,
} from '../../tui';

// ─── Shared contract (Phase 4 spec) ──────────────────────────────────────────

export type GrowthNode = { x: number; y: number };
export type GrowthState = { nodes: GrowthNode[]; closed: boolean; step: number };
export type WorldRect = { x: number; y: number; w: number; h: number };

/** A point in cell space; whole numbers land on a cell's top-left corner. */
export interface CellPoint {
  col: number;
  row: number;
}

// ─── Viewport ────────────────────────────────────────────────────────────────

/**
 * Cells are taller than they are wide, so a world circle only stays round if a
 * row spans `lineH / charW` times the world a column spans. 14 px Menlo on the
 * 20 px line grid measures ≈ 2.38; sketches should pass the measured ratio
 * (`cellAspectFromMetrics`) rather than rely on this.
 */
export const DEFAULT_CELL_ASPECT = 20 / 8.4;

/** The cell aspect (`lineH / charW`) of a live desktop's metrics. */
export const cellAspectFromMetrics = (m: TuiMetrics): number => m.lineH / m.charW;

export interface ViewportOptions {
  /** World point shown at the centre of the rect. Default the origin. */
  center?: GrowthNode;
  /** Magnification: one column spans `unitsPerCell / zoom` world units. Default 1. */
  zoom?: number;
  /** World units one column spans at `zoom === 1`. Default 1. */
  unitsPerCell?: number;
  /** `lineH / charW`. Default `DEFAULT_CELL_ASPECT`. */
  cellAspect?: number;
  minZoom?: number;
  maxZoom?: number;
}

export interface Viewport {
  /** Live centre (mutated in place by `pan` / `zoomBy` / `setCenter`). */
  readonly center: GrowthNode;
  readonly zoom: number;
  readonly unitsPerCell: number;
  readonly cellAspect: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** World units spanned by one cell column at the current zoom. */
  readonly worldPerCol: number;
  /** World units spanned by one cell row at the current zoom (`worldPerCol × cellAspect`). */
  readonly worldPerRow: number;
  setCenter(x: number, y: number): void;
  /** Clamped to `[minZoom, maxZoom]`. */
  setZoom(zoom: number): void;
  /**
   * Move the view by (fractional) cells: positive `dCellX` slides the view
   * right, so the organism appears to move left. A drag that carries the
   * organism with the pointer passes the negated pointer delta.
   */
  pan(dCellX: number, dCellY: number): void;
  /**
   * Multiply the zoom, keeping the world point under `aboutCell` fixed.
   * `aboutCell` is absolute (buffer) cell space and is only meaningful
   * relative to `rect`, so both are passed; omit them to zoom about the centre.
   */
  zoomBy(factor: number, aboutCell?: CellPoint, rect?: CellRect): void;
  /** World point → fractional cell coordinates inside `rect`. */
  worldToCell(p: GrowthNode, rect: CellRect): CellPoint;
  /** Fractional cell coordinates inside `rect` → world point. */
  cellToWorld(c: CellPoint, rect: CellRect): GrowthNode;
  /** World point at the centre of the cell containing `(row, col)`. */
  cellCenterToWorld(row: number, col: number, rect: CellRect): GrowthNode;
  /** The world region `rect` currently shows. */
  visibleRect(rect: CellRect): WorldRect;
  /** Centre on `world` and set the zoom that fits it in `rect`, inset by `pad` cells. */
  fit(world: WorldRect, rect: CellRect, pad?: number): void;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function createViewport(opts: ViewportOptions = {}): Viewport {
  const unitsPerCell = opts.unitsPerCell ?? 1;
  const cellAspect = opts.cellAspect ?? DEFAULT_CELL_ASPECT;
  const minZoom = opts.minZoom ?? 0.01;
  const maxZoom = opts.maxZoom ?? 1000;
  if (!(unitsPerCell > 0)) throw new Error(`createViewport: invalid unitsPerCell ${unitsPerCell}`);
  if (!(cellAspect > 0)) throw new Error(`createViewport: invalid cellAspect ${cellAspect}`);
  if (!(minZoom > 0) || !(maxZoom >= minZoom)) {
    throw new Error(`createViewport: invalid zoom range ${minZoom}..${maxZoom}`);
  }

  const center: GrowthNode = { x: opts.center?.x ?? 0, y: opts.center?.y ?? 0 };
  let zoom = clamp(opts.zoom ?? 1, minZoom, maxZoom);

  const perCol = () => unitsPerCell / zoom;
  const perRow = () => (unitsPerCell / zoom) * cellAspect;
  const midCol = (rect: CellRect) => rect.col + rect.cols / 2;
  const midRow = (rect: CellRect) => rect.row + rect.rows / 2;

  const worldToCell = (p: GrowthNode, rect: CellRect): CellPoint => ({
    col: midCol(rect) + (p.x - center.x) / perCol(),
    row: midRow(rect) + (p.y - center.y) / perRow(),
  });

  const cellToWorld = (c: CellPoint, rect: CellRect): GrowthNode => ({
    x: center.x + (c.col - midCol(rect)) * perCol(),
    y: center.y + (c.row - midRow(rect)) * perRow(),
  });

  const vp: Viewport = {
    center,
    get zoom() {
      return zoom;
    },
    unitsPerCell,
    cellAspect,
    minZoom,
    maxZoom,
    get worldPerCol() {
      return perCol();
    },
    get worldPerRow() {
      return perRow();
    },

    setCenter(x, y) {
      center.x = x;
      center.y = y;
    },

    setZoom(next) {
      zoom = clamp(next, minZoom, maxZoom);
    },

    pan(dCellX, dCellY) {
      center.x += dCellX * perCol();
      center.y += dCellY * perRow();
    },

    zoomBy(factor, aboutCell, rect) {
      if (!(factor > 0)) return;
      if (aboutCell && rect) {
        const before = cellToWorld(aboutCell, rect);
        zoom = clamp(zoom * factor, minZoom, maxZoom);
        const after = cellToWorld(aboutCell, rect);
        center.x += before.x - after.x;
        center.y += before.y - after.y;
        return;
      }
      zoom = clamp(zoom * factor, minZoom, maxZoom);
    },

    worldToCell,
    cellToWorld,

    cellCenterToWorld: (row, col, rect) => cellToWorld({ row: row + 0.5, col: col + 0.5 }, rect),

    visibleRect: (rect) => ({
      x: center.x - (rect.cols / 2) * perCol(),
      y: center.y - (rect.rows / 2) * perRow(),
      w: rect.cols * perCol(),
      h: rect.rows * perRow(),
    }),

    fit(world, rect, pad = 0) {
      const cols = Math.max(1, rect.cols - 2 * pad);
      const rows = Math.max(1, rect.rows - 2 * pad);
      const needCol = Math.max(
        world.w > 0 ? world.w / cols : 0,
        world.h > 0 ? world.h / (rows * cellAspect) : 0,
      );
      center.x = world.x + world.w / 2;
      center.y = world.y + world.h / 2;
      if (needCol > 0) zoom = clamp(unitsPerCell / needCol, minZoom, maxZoom);
    },
  };

  return vp;
}

// ─── Cell walking ────────────────────────────────────────────────────────────

/**
 * Bresenham walk from the cell containing `a` to the cell containing `b`,
 * calling `visit` for every cell on the way. Consecutive cells are always
 * 8-adjacent, so a diagonal run leaves no gap in the glyph line.
 */
export function walkCellLine(
  a: CellPoint,
  b: CellPoint,
  visit: (row: number, col: number) => void,
): void {
  if (!Number.isFinite(a.col) || !Number.isFinite(a.row)) return;
  if (!Number.isFinite(b.col) || !Number.isFinite(b.row)) return;
  let col = Math.floor(a.col);
  let row = Math.floor(a.row);
  const col1 = Math.floor(b.col);
  const row1 = Math.floor(b.row);
  const dCol = Math.abs(col1 - col);
  const dRow = -Math.abs(row1 - row);
  const stepCol = col < col1 ? 1 : -1;
  const stepRow = row < row1 ? 1 : -1;
  let err = dCol + dRow;
  for (;;) {
    visit(row, col);
    if (col === col1 && row === row1) return;
    const e2 = 2 * err;
    if (e2 >= dRow) {
      err += dRow;
      col += stepCol;
    }
    if (e2 <= dCol) {
      err += dCol;
      row += stepRow;
    }
  }
}

/** Liang–Barsky clip of a cell-space segment to a box; `null` when fully outside. */
function clipSegment(
  a: CellPoint,
  b: CellPoint,
  minCol: number,
  minRow: number,
  maxCol: number,
  maxRow: number,
): [CellPoint, CellPoint] | null {
  const dCol = b.col - a.col;
  const dRow = b.row - a.row;
  const p = [-dCol, dCol, -dRow, dRow];
  const q = [a.col - minCol, maxCol - a.col, a.row - minRow, maxRow - a.row];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [
    { col: a.col + t0 * dCol, row: a.row + t0 * dRow },
    { col: a.col + t1 * dCol, row: a.row + t1 * dRow },
  ];
}

// ─── Density and line glyphs ─────────────────────────────────────────────────

/** Hit counts at which a cell moves up to the next `SHADES` step. */
export const DENSITY_LEVELS: readonly number[] = [1, 2, 4, 8];

/** The `SHADES` glyph for a cell hit `count` times; `''` when it was never hit. */
export function shadeForCount(count: number, levels: readonly number[] = DENSITY_LEVELS): string {
  if (count <= 0) return '';
  let passed = 0;
  for (const level of levels) if (count >= level) passed++;
  return SHADES[Math.min(SHADES.length, Math.max(1, passed)) - 1];
}

const DIR_H = 1;
const DIR_V = 2;
/** Down-right / up-left: `╲`. */
const DIR_DOWN = 4;
/** Up-right / down-left: `╱`. */
const DIR_UP = 8;
const DIR_POINT = 16;

const DIR_GLYPH: Record<number, string> = {
  [DIR_H]: '─',
  [DIR_V]: '│',
  [DIR_DOWN]: '╲',
  [DIR_UP]: '╱',
  [DIR_POINT]: '·',
};

/** Which direction bucket a segment falls in, from its cell-space delta. */
function dirBit(dCol: number, dRow: number): number {
  const adx = Math.abs(dCol);
  const ady = Math.abs(dRow);
  if (adx === 0 && ady === 0) return DIR_POINT;
  if (adx >= ady * 2) return DIR_H;
  if (ady >= adx * 2) return DIR_V;
  return dCol > 0 === dRow > 0 ? DIR_DOWN : DIR_UP;
}

/** The line glyph for a cell's accumulated direction mask; crossings get `┼`. */
export function lineGlyphForMask(mask: number): string {
  const lines = mask & ~DIR_POINT;
  const m = lines === 0 ? mask : lines;
  const single = DIR_GLYPH[m];
  return single ?? '┼';
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

export type GrowthDrawMode = 'auto' | 'density' | 'detail';

export interface GrowthDrawOptions {
  /** `auto` (default) picks `detail` once the curve is resolved cell by cell. */
  mode?: GrowthDrawMode;
  /** `auto` switches to `detail` at this mean segment length in cells. Default 1.5. */
  detailCells?: number;
  /** Hit counts for the shade steps. Default `DENSITY_LEVELS`. */
  densityLevels?: readonly number[];
  /** Curve colour. Default `theme.fg`. */
  color?: string;
  /** Node marks in `detail` mode. Default `theme.accent`. */
  nodeColor?: string;
  /** Node mark glyph. Default `●`. */
  nodeChar?: string;
  /** Per-cell background behind the curve. Default none. */
  bg?: string;
}

export interface GrowthDrawResult {
  /** The mode actually used (`auto` resolved). */
  mode: 'density' | 'detail';
  /** Cells that took at least one hit. */
  cellsDrawn: number;
  /** Node marks written (0 in `density` mode). */
  nodesDrawn: number;
  /** Highest hit count in one cell. */
  maxCount: number;
  /** Mean segment length in cells, over every segment of the organism. */
  segmentCells: number;
}

const EMPTY_RESULT = (mode: 'density' | 'detail'): GrowthDrawResult => ({
  mode,
  cellsDrawn: 0,
  nodesDrawn: 0,
  maxCount: 0,
  segmentCells: 0,
});

/**
 * Draw `state` into `rect` through `vp`. Every write goes through
 * `buf.clip(rect, …)`, so nothing lands outside the rect the window gave us.
 *
 * Segments are accumulated per cell first: in `density` mode the count picks a
 * `SHADES` glyph, in `detail` mode the cell gets the line glyph of the
 * direction(s) that crossed it and every node inside the rect is marked.
 */
export function drawGrowth(
  buf: GlyphBuffer,
  rect: CellRect,
  state: GrowthState,
  vp: Viewport,
  theme: TuiTheme,
  opts: GrowthDrawOptions = {},
): GrowthDrawResult {
  const nodes = state.nodes;
  const n = nodes.length;
  const requested = opts.mode ?? 'auto';
  if (isEmptyCellRect(rect) || n === 0) {
    return EMPTY_RESULT(requested === 'detail' ? 'detail' : 'density');
  }

  const { rows, cols } = rect;
  const counts = new Int32Array(rows * cols);
  const masks = new Int32Array(rows * cols);
  const cells: CellPoint[] = new Array(n);
  for (let i = 0; i < n; i++) cells[i] = vp.worldToCell(nodes[i], rect);

  const segments = state.closed ? n : n - 1;
  let lengthSum = 0;
  let cellsDrawn = 0;
  let maxCount = 0;

  const hit = (row: number, col: number, bit: number) => {
    if (row < rect.row || row >= rect.row + rows) return;
    if (col < rect.col || col >= rect.col + cols) return;
    const idx = (row - rect.row) * cols + (col - rect.col);
    if (counts[idx] === 0) cellsDrawn++;
    counts[idx]++;
    masks[idx] |= bit;
    if (counts[idx] > maxCount) maxCount = counts[idx];
  };

  for (let i = 0; i < segments; i++) {
    const a = cells[i];
    const b = cells[(i + 1) % n];
    const dCol = b.col - a.col;
    const dRow = b.row - a.row;
    if (!Number.isFinite(dCol) || !Number.isFinite(dRow)) continue;
    lengthSum += Math.hypot(dCol, dRow);
    // Clip before walking: an off-screen segment at high zoom can span
    // millions of cells, and only the part over `rect` can be drawn anyway.
    const seg = clipSegment(
      a,
      b,
      rect.col - 1,
      rect.row - 1,
      rect.col + cols + 1,
      rect.row + rows + 1,
    );
    if (!seg) continue;
    const bit = dirBit(dCol, dRow);
    walkCellLine(seg[0], seg[1], (row, col) => hit(row, col, bit));
  }
  // A lone node still marks its cell.
  if (segments <= 0) {
    const a = cells[0];
    if (Number.isFinite(a.col) && Number.isFinite(a.row)) {
      hit(Math.floor(a.row), Math.floor(a.col), DIR_POINT);
    }
  }

  const segmentCells = segments > 0 ? lengthSum / segments : 0;
  const detailCells = opts.detailCells ?? 1.5;
  const mode: 'density' | 'detail' =
    requested === 'auto' ? (segmentCells >= detailCells ? 'detail' : 'density') : requested;

  const color = opts.color ?? theme.fg;
  const nodeColor = opts.nodeColor ?? theme.accent;
  const nodeChar = opts.nodeChar ?? '●';
  const levels = opts.densityLevels ?? DENSITY_LEVELS;
  let nodesDrawn = 0;

  buf.clip(rect, () => {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        const count = counts[idx];
        if (count === 0) continue;
        const ch = mode === 'density' ? shadeForCount(count, levels) : lineGlyphForMask(masks[idx]);
        if (ch === '') continue;
        buf.put(rect.row + row, rect.col + col, ch, color, opts.bg);
      }
    }
    if (mode === 'detail') {
      const marked = new Set<number>();
      for (let i = 0; i < n; i++) {
        const c = cells[i];
        if (!Number.isFinite(c.col) || !Number.isFinite(c.row)) continue;
        const row = Math.floor(c.row);
        const col = Math.floor(c.col);
        if (row < rect.row || row >= rect.row + rows) continue;
        if (col < rect.col || col >= rect.col + cols) continue;
        const key = (row - rect.row) * cols + (col - rect.col);
        if (marked.has(key)) continue;
        marked.add(key);
        buf.put(row, col, nodeChar, nodeColor, opts.bg);
        nodesDrawn++;
      }
    }
  });

  return { mode, cellsDrawn, nodesDrawn, maxCount, segmentCells };
}

/** Axis-aligned world bounds of a state; a zero-size rect at the origin when empty. */
export function growthBounds(state: GrowthState): WorldRect {
  const nodes = state.nodes;
  if (nodes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of nodes) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
