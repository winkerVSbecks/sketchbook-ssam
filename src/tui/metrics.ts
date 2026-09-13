import type { Pt, Rect } from '../ui/types';
import type { Cell, CellRect } from './cells';

/** Same face as the terminal-charts reference sketch. */
export const TUI_FONT_FAMILY = `'Menlo', 'Monaco', 'DejaVu Sans Mono', monospace`;

/**
 * The slice of `CanvasRenderingContext2D` needed to measure a glyph. Kept
 * structural so node tests can pass a stub (or `null` plus an explicit `charW`).
 * The bounding-box fields are optional: a stub that only reports `width` gets
 * the cap-height heuristic for the baseline instead.
 */
export interface TextMeasurer {
  font: string;
  textBaseline?: CanvasTextBaseline;
  measureText(text: string): {
    width: number;
    actualBoundingBoxAscent?: number;
    actualBoundingBoxDescent?: number;
  };
}

export interface MetricsOptions {
  fontSize?: number;
  lineH?: number;
  family?: string;
  /** Skip measuring and use this advance width (node tests, or a cached value). */
  charW?: number;
  /**
   * Y of the alphabetic baseline inside its line box. Default: the value that
   * centres the cap height of `M` in `lineH` (measured when the context reports
   * `actualBoundingBoxAscent`, otherwise estimated as 0.72 em).
   */
  baselineOffset?: number;
}

export interface TuiMetrics {
  font: string;
  fontSize: number;
  /** Measured advance of 'M' — every cell is this wide. */
  charW: number;
  /** Fixed line pitch — every cell is this tall. */
  lineH: number;
  /** Alphabetic baseline y inside a line box; `blit` draws every glyph at `row * lineH + baselineOffset`. */
  baselineOffset: number;
  cols(widthPx: number): number;
  rows(heightPx: number): number;
  /** Pixel point → containing cell (may fall outside the buffer; callers clamp). */
  toCell(pt: Pt): Cell;
  /** Top-left pixel corner of a cell. */
  toPx(cell: Cell): Pt;
  cellRectToPx(rect: CellRect): Rect;
}

/** Reference glyph: its advance is the cell width and its cap height is what gets centred. */
const REFERENCE_GLYPH = 'M';
/** Cap height of a typical monospace face as a fraction of the font size (Menlo: 0.727). */
const CAP_HEIGHT_EM = 0.72;

/**
 * Character-grid metrics: 14 px monospace on a 20 px line grid by default.
 * `charW` is measured once from the font; `lineH` is fixed, as in the reference.
 * The baseline is placed so the reference glyph's ink is vertically centred in
 * the row — one `measureText` call covers both the advance and the cap height.
 */
export function createMetrics(
  ctx: TextMeasurer | null,
  opts: MetricsOptions = {},
): TuiMetrics {
  const fontSize = opts.fontSize ?? 14;
  const lineH = opts.lineH ?? 20;
  const family = opts.family ?? TUI_FONT_FAMILY;
  const font = `${fontSize}px ${family}`;

  let charW = opts.charW;
  let baselineOffset = opts.baselineOffset;
  if (ctx && (charW === undefined || baselineOffset === undefined)) {
    const prevFont = ctx.font;
    const prevBaseline = ctx.textBaseline;
    ctx.font = font;
    if (prevBaseline !== undefined) ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(REFERENCE_GLYPH);
    ctx.font = prevFont;
    if (prevBaseline !== undefined) ctx.textBaseline = prevBaseline;
    charW ??= m.width;
    if (baselineOffset === undefined && m.actualBoundingBoxAscent !== undefined) {
      const ascent = m.actualBoundingBoxAscent;
      const descent = m.actualBoundingBoxDescent ?? 0;
      baselineOffset = centredBaseline(lineH, ascent, descent);
    }
  }
  if (charW === undefined) {
    throw new Error('createMetrics: pass a context to measure or an explicit charW');
  }
  if (!(charW > 0)) throw new Error(`createMetrics: invalid charW ${charW}`);
  baselineOffset ??= centredBaseline(lineH, CAP_HEIGHT_EM * fontSize, 0);

  const cw = charW;
  // Guard against 4.99999 → 4 when a cell corner is converted straight back.
  const EPS = 1e-6;

  return {
    font,
    fontSize,
    charW: cw,
    lineH,
    baselineOffset,
    cols: (widthPx) => Math.max(0, Math.floor(widthPx / cw + EPS)),
    rows: (heightPx) => Math.max(0, Math.floor(heightPx / lineH + EPS)),
    toCell: (pt) => ({
      row: Math.floor(pt.y / lineH + EPS),
      col: Math.floor(pt.x / cw + EPS),
    }),
    toPx: (cell) => ({ x: cell.col * cw, y: cell.row * lineH }),
    cellRectToPx: (r) => ({
      x: r.col * cw,
      y: r.row * lineH,
      w: r.cols * cw,
      h: r.rows * lineH,
    }),
  };
}

/**
 * Baseline y that centres an ink box (`ascent` above, `descent` below the
 * alphabetic baseline) in a row of `lineH`, snapped to whole pixels so
 * horizontal stems stay crisp.
 */
export function centredBaseline(lineH: number, ascent: number, descent: number): number {
  return Math.round(lineH / 2 + (ascent - descent) / 2);
}
