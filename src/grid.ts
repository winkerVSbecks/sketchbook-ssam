export interface GridCell {
  x: number;
  y: number;
  width: number;
  height: number;
  col: number;
  row: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridOptions {
  width: number;
  height: number;
  cols: number;
  rows: number;
  gapX?: number;
  gapY?: number;
}

function cellDimensions({
  width,
  height,
  cols,
  rows,
  gapX = 0,
  gapY = 0,
}: GridOptions) {
  // Calculate total gap space
  const totalGapX = gapX * 2 + gapX * (cols - 1);
  const totalGapY = gapY * 2 + gapY * (rows - 1);

  // Calculate cell dimensions
  const cellWidth = (width - totalGapX) / cols;
  const cellHeight = (height - totalGapY) / rows;

  return { cellWidth, cellHeight };
}

/**
 * Split an area into a grid with specified columns, rows, and gaps
 * @param options - Grid configuration options
 * @returns Array of grid cells with position and dimensions
 */
export function makeGrid(options: GridOptions): GridCell[] {
  const { cols, rows, gapX = 0, gapY = 0 } = options;

  const { cellWidth, cellHeight } = cellDimensions(options);

  const cells: GridCell[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        x: gapX + col * (cellWidth + gapX),
        y: gapY + row * (cellHeight + gapY),
        width: cellWidth,
        height: cellHeight,
        col,
        row,
      });
    }
  }

  return cells;
}

// Get a rectangle's position and dimensions
export function getRect(options: GridOptions, { x, y, w, h }: Rect): Rect {
  const { gapX = 0, gapY = 0 } = options;

  const { cellWidth, cellHeight } = cellDimensions(options);

  return {
    x: gapX + x * (cellWidth + gapX),
    y: gapY + y * (cellHeight + gapY),
    w: w * cellWidth + (w - 1) * gapX,
    h: h * cellHeight + (h - 1) * gapY,
  };
}

export function getRectInGap(
  options: GridOptions,
  { x, y, w, h }: Rect,
  type: 'horizontal' | 'vertical'
): Rect {
  const { gapX = 0, gapY = 0 } = options;
  const { cellWidth, cellHeight } = cellDimensions(options);

  return {
    x: gapX + x * (cellWidth + gapX) + (type === 'vertical' ? cellWidth : 0),
    y:
      gapY + y * (cellHeight + gapY) + (type === 'horizontal' ? cellHeight : 0),
    w: type === 'horizontal' ? w * cellWidth + (w - 1) * gapX : gapX,
    h: type === 'vertical' ? h * cellHeight + (h - 1) * gapY : gapY,
  };
}
