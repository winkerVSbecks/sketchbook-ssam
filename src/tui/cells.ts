/**
 * Cell-space primitives shared by every TUI module. A cell is one character
 * slot in the ROWS×COLS glyph buffer; rectangles are measured in whole cells.
 */

export interface Cell {
  row: number;
  col: number;
}

export interface CellRect {
  row: number;
  col: number;
  rows: number;
  cols: number;
}

export const cellRect = (
  row: number,
  col: number,
  rows: number,
  cols: number,
): CellRect => ({ row, col, rows, cols });

export const cellRectContains = (
  r: CellRect,
  row: number,
  col: number,
): boolean =>
  row >= r.row && row < r.row + r.rows && col >= r.col && col < r.col + r.cols;

/** Intersection of two cell rects; empty rects come back with `rows`/`cols` of 0. */
export function intersectCellRect(a: CellRect, b: CellRect): CellRect {
  const row = Math.max(a.row, b.row);
  const col = Math.max(a.col, b.col);
  const bottom = Math.min(a.row + a.rows, b.row + b.rows);
  const right = Math.min(a.col + a.cols, b.col + b.cols);
  return {
    row,
    col,
    rows: Math.max(0, bottom - row),
    cols: Math.max(0, right - col),
  };
}

/** Shrink a rect by `n` cells on every side (clamped to an empty rect). */
export function insetCellRect(r: CellRect, n: number): CellRect {
  return {
    row: r.row + n,
    col: r.col + n,
    rows: Math.max(0, r.rows - 2 * n),
    cols: Math.max(0, r.cols - 2 * n),
  };
}

export const isEmptyCellRect = (r: CellRect): boolean =>
  r.rows <= 0 || r.cols <= 0;
