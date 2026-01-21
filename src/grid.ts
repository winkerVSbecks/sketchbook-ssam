export interface GridCell {
  x: number;
  y: number;
  width: number;
  height: number;
  col: number;
  row: number;
}

export interface Rect {
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
  type: 'horizontal' | 'vertical',
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

export const createToggleButton = (onToggle: () => void) => {
  const button = document.createElement('button');
  button.textContent = 'Toggle Grid';
  button.style.position = 'fixed';
  button.style.top = '20px';
  button.style.right = '20px';
  button.style.padding = '10px 20px';
  button.style.cursor = 'pointer';
  button.style.zIndex = '1000';
  button.style.fontFamily = 'sans-serif';
  button.style.fontSize = '14px';
  button.style.border = '2px solid #212121';
  button.style.background = '#fff';
  button.style.color = '#212121';
  button.style.borderRadius = '4px';
  button.addEventListener('click', onToggle);
  document.body.appendChild(button);
  return button;
};

export function drawGrid(
  context: CanvasRenderingContext2D,
  grid: GridCell[],
  showGrid: boolean,
  color: string = 'rgba(0, 0, 0, 0.5)',
) {
  if (showGrid) {
    context.lineWidth = 1;
    context.strokeStyle = color;
    grid.forEach((cell) => {
      context.strokeRect(cell.x, cell.y, cell.width, cell.height);
    });
  }
}
