import type { Pt, Rect } from '../ui/types';
import type { Cell, CellRect } from './cells';

/** Same face as the terminal-charts reference sketch. */
export const TUI_FONT_FAMILY = `'Menlo', 'Monaco', 'DejaVu Sans Mono', monospace`;

/**
 * The slice of `CanvasRenderingContext2D` needed to measure a glyph. Kept
 * structural so node tests can pass a stub (or `null` plus an explicit `charW`).
 */
export interface TextMeasurer {
  font: string;
  measureText(text: string): { width: number };
}

export interface MetricsOptions {
  fontSize?: number;
  lineH?: number;
  family?: string;
  /** Skip measuring and use this advance width (node tests, or a cached value). */
  charW?: number;
  /** Vertical offset of the glyph (textBaseline 'top') inside its line box. */
  baselineOffset?: number;
}

export interface TuiMetrics {
  font: string;
  fontSize: number;
  /** Measured advance of 'M' — every cell is this wide. */
  charW: number;
  /** Fixed line pitch — every cell is this tall. */
  lineH: number;
  baselineOffset: number;
  cols(widthPx: number): number;
  rows(heightPx: number): number;
  /** Pixel point → containing cell (may fall outside the buffer; callers clamp). */
  toCell(pt: Pt): Cell;
  /** Top-left pixel corner of a cell. */
  toPx(cell: Cell): Pt;
  cellRectToPx(rect: CellRect): Rect;
}

/**
 * Character-grid metrics: 14 px monospace on a 20 px line grid by default.
 * `charW` is measured once from the font; `lineH` is fixed, as in the reference.
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
  if (charW === undefined) {
    if (!ctx) {
      throw new Error('createMetrics: pass a context to measure or an explicit charW');
    }
    const prev = ctx.font;
    ctx.font = font;
    charW = ctx.measureText('M').width;
    ctx.font = prev;
  }
  if (!(charW > 0)) throw new Error(`createMetrics: invalid charW ${charW}`);

  // Reference draws with textBaseline 'top' at r*LINE_H + 2 for 14/20.
  const baselineOffset = opts.baselineOffset ?? (lineH - fontSize) / 2 - 1;
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
