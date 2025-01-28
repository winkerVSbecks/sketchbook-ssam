import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import * as tome from 'chromotome';
// import { palettes } from '../../colors/auto-albers';
import { palettes } from '../../colors/mindful-palettes';

const config = {
  gridSize: 16, //32, // 64
  padding: 0,
  scrollSpeed: 0.0625, // Cells per second
};

// const { colors, background: bg, stroke } = tome.get();
const colors = Random.pick(palettes);
const bg = colors.shift();

type Tile = '═' | '║' | '╔' | '╗' | '╚' | '╝';
type Connection = 'top' | 'right' | 'bottom' | 'left';
type Cell = {
  collapsed: boolean;
  options: Tile[];
  color: string;
  connections: Connection[];
};

const connectionPoints: Record<Tile, Connection[]> = {
  '═': ['left', 'right'],
  '║': ['top', 'bottom'],
  '╔': ['right', 'bottom'],
  '╗': ['left', 'bottom'],
  '╚': ['right', 'top'],
  '╝': ['left', 'top'],
};

const oppositeDirection: Record<Connection, Connection> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
};

const rules = {
  '═': ['═', '╔', '╗', '╚', '╝'],
  '║': ['║', '╔', '╗', '╚', '╝'],
  '╔': ['═', '║', '╝'],
  '╗': ['═', '║', '╚'],
  '╚': ['═', '║', '╗'],
  '╝': ['═', '║', '╔'],
};

function drawTile(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tile: Tile,
  color: string
) {
  const padding = size * config.padding;

  context.save();
  context.translate(x * size, y * size);

  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = size * 0.2;

  switch (tile) {
    case '═':
      context.beginPath();
      context.moveTo(padding, size / 2);
      context.lineTo(size - padding, size / 2);
      context.strokeStyle = color;
      context.lineWidth = size * 0.3;
      context.stroke();
      context.strokeStyle = bg;
      context.lineWidth = size * 0.1;
      context.stroke();
      break;
    case '║':
      context.beginPath();
      context.moveTo(size / 2, padding);
      context.lineTo(size / 2, size - padding);
      context.strokeStyle = color;
      context.lineWidth = size * 0.3;
      context.stroke();
      context.strokeStyle = bg;
      context.lineWidth = size * 0.1;
      context.stroke();
      break;
    case '╔':
      context.beginPath();
      context.moveTo(size - padding, size / 2);
      context.lineTo(size / 2, size / 2);
      context.lineTo(size / 2, size - padding);
      context.strokeStyle = color;
      context.lineWidth = size * 0.3;
      context.stroke();
      context.strokeStyle = bg;
      context.lineWidth = size * 0.1;
      context.stroke();
      break;
    case '╗':
      context.beginPath();
      context.moveTo(padding, size / 2);
      context.lineTo(size / 2, size / 2);
      context.lineTo(size / 2, size - padding);
      context.strokeStyle = color;
      context.lineWidth = size * 0.3;
      context.stroke();
      context.strokeStyle = bg;
      context.lineWidth = size * 0.1;
      context.stroke();
      break;
    case '╚':
      context.beginPath();
      context.moveTo(size / 2, padding);
      context.lineTo(size / 2, size / 2);
      context.lineTo(size - padding, size / 2);
      context.strokeStyle = color;
      context.lineWidth = size * 0.3;
      context.stroke();
      context.strokeStyle = bg;
      context.lineWidth = size * 0.1;
      context.stroke();
      break;
    case '╝':
      context.beginPath();
      context.moveTo(size / 2, padding);
      context.lineTo(size / 2, size / 2);
      context.lineTo(padding, size / 2);
      context.strokeStyle = color;
      context.lineWidth = size * 0.3;
      context.stroke();
      context.strokeStyle = bg;
      context.lineWidth = size * 0.1;
      context.stroke();
      break;
  }

  context.restore();
}

function checkConnection(
  tile1: Tile,
  tile2: Tile,
  direction: Connection
): boolean {
  const tile1Connections = connectionPoints[tile1];
  const tile2Connections = connectionPoints[tile2];
  return (
    tile1Connections.includes(direction) &&
    tile2Connections.includes(oppositeDirection[direction])
  );
}

function getAllConnectedCells(
  grid: Cell[][],
  startX: number,
  startY: number,
  visited: Set<string> = new Set()
): Array<{ x: number; y: number }> {
  const key = `${startX},${startY}`;
  if (visited.has(key)) return [];
  visited.add(key);

  const connected: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  const currentTile = grid[startY][startX].options[0];
  const currentConnections = connectionPoints[currentTile];

  const directions = [
    { dx: 0, dy: -1, dir: 'top' as Connection },
    { dx: 1, dy: 0, dir: 'right' as Connection },
    { dx: 0, dy: 1, dir: 'bottom' as Connection },
    { dx: -1, dy: 0, dir: 'left' as Connection },
  ];

  for (const { dx, dy, dir } of directions) {
    const newX = startX + dx;
    const newY = startY + dy;

    if (
      newX >= 0 &&
      newX < grid[0].length &&
      newY >= 0 &&
      newY < grid.length &&
      grid[newY][newX].collapsed &&
      currentConnections.includes(dir) &&
      checkConnection(currentTile, grid[newY][newX].options[0], dir)
    ) {
      const neighborConnected = getAllConnectedCells(grid, newX, newY, visited);
      connected.push(...neighborConnected);
    }
  }

  return connected;
}

function createCell(): Cell {
  return {
    collapsed: false,
    options: ['═', '║', '╔', '╗', '╚', '╝'],
    color: Random.pick(colors),
    connections: [],
  };
}

function generateNewColumn(grid: Cell[][]): Cell[] {
  const newColumn: Cell[] = Array(config.gridSize)
    .fill(0)
    .map(() => createCell());

  // Collapse each cell in the new column
  for (let y = 0; y < config.gridSize; y++) {
    collapseCell(grid, config.gridSize - 1, y, newColumn);
  }

  return newColumn;
}

function collapseCell(
  grid: Cell[][],
  x: number,
  y: number,
  newColumn?: Cell[]
): void {
  const cell = newColumn ? newColumn[y] : grid[y][x];
  cell.collapsed = true;
  const option: Tile = Random.pick(cell.options);
  cell.options = [option];
  cell.connections = connectionPoints[option];

  const connectedCells = getAllConnectedCells(grid, x, y);
  const colors = connectedCells
    .map((pos) => grid[pos.y][pos.x])
    .filter((cell) => cell.collapsed)
    .map((cell) => cell.color);

  const existingColor = colors.length > 0 ? colors[0] : cell.color;
  connectedCells.forEach((pos) => {
    grid[pos.y][pos.x].color = existingColor;
  });
}

const sketch: Sketch<'2d'> = ({
  wrap,
  context,
  width,
  height,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const cellSize = width / config.gridSize;
  const totalColumns = config.gridSize + 1;
  let scrollOffset = 0;

  // Initialize the grid with an extra column
  let grid: Cell[][] = Array(config.gridSize)
    .fill(0)
    .map(() =>
      Array(totalColumns)
        .fill(0)
        .map(() => createCell())
    );

  // Initial collapse of the grid
  for (let y = 0; y < config.gridSize; y++) {
    for (let x = 0; x < totalColumns; x++) {
      if (!grid[y][x].collapsed) {
        collapseCell(grid, x, y);
      }
    }
  }

  wrap.render = ({ deltaTime }) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Update scroll offset
    scrollOffset += config.scrollSpeed * deltaTime;

    // When we've scrolled a full cell width, shift the grid data
    if (scrollOffset >= cellSize) {
      // Shift all columns to the left
      for (let y = 0; y < config.gridSize; y++) {
        for (let x = 0; x < totalColumns - 1; x++) {
          grid[y][x] = grid[y][x + 1];
        }
      }

      // Generate and add new column
      const newColumn = generateNewColumn(grid);
      for (let y = 0; y < config.gridSize; y++) {
        grid[y][totalColumns - 1] = newColumn[y];
      }

      // Reset scroll offset
      scrollOffset -= cellSize;
    }

    // Draw the grid with smooth scrolling
    for (let y = 0; y < config.gridSize; y++) {
      for (let x = 0; x < totalColumns; x++) {
        const cell = grid[y][x];
        if (cell.collapsed) {
          drawTile(
            context,
            x - scrollOffset / cellSize,
            y,
            cellSize,
            cell.options[0],
            cell.color
          );
        }
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: 1, // window.devicePixelRatio,
  animate: true,
  duration: 20_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch, settings);
