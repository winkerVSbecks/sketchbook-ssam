import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { clrs } from '../../colors/clrs';

const config = {
  gridSize: 32,
  padding: 0,
  arrowSize: 0.5,
  lineWidth: 0.2,
};

const colors = Random.pick([
  ...mindfulPalettes,
  ...autoAlbersPalettes,
  ...clrs,
]);
const bg = colors.pop();

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

function drawArrowhead(
  context: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  arrowSize: number
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);

  context.beginPath();
  context.moveTo(toX, toY);
  context.lineTo(
    toX - arrowSize * Math.cos(angle - Math.PI / 6),
    toY - arrowSize * Math.sin(angle - Math.PI / 6)
  );
  context.lineTo(
    toX - arrowSize * Math.cos(angle + Math.PI / 6),
    toY - arrowSize * Math.sin(angle + Math.PI / 6)
  );
  context.closePath();
  context.fill();
}

function drawArrowedLine(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  arrowSize: number
) {
  const angle = Math.atan2(endY - startY, endX - startX);
  const length = Math.sqrt(
    Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)
  );

  // Draw main line
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(
    endX - arrowSize * Math.cos(angle),
    endY - arrowSize * Math.sin(angle)
  );
  context.stroke();

  // Draw arrowhead
  drawArrowhead(context, startX, startY, endX, endY, arrowSize);
}

function drawTile(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tile: Tile,
  color: string = '#0066FF'
) {
  const padding = size * config.padding;
  const arrowSize = size * config.arrowSize;

  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = size * config.lineWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const center = {
    x: x * size + size / 2,
    y: y * size + size / 2,
  };

  switch (tile) {
    case '═':
      drawArrowedLine(
        context,
        x * size + padding,
        center.y,
        x * size + size - padding,
        center.y,
        arrowSize
      );
      break;
    case '║':
      drawArrowedLine(
        context,
        center.x,
        y * size + padding,
        center.x,
        y * size + size - padding,
        arrowSize
      );
      break;
    case '╔':
      context.beginPath();
      context.moveTo(x * size + size - padding, center.y);
      context.lineTo(center.x, center.y);
      context.lineTo(center.x, y * size + size - padding);
      context.stroke();
      drawArrowhead(
        context,
        center.x,
        center.y,
        center.x,
        y * size + size - padding,
        arrowSize
      );
      break;
    case '╗':
      context.beginPath();
      context.moveTo(x * size + padding, center.y);
      context.lineTo(center.x, center.y);
      context.lineTo(center.x, y * size + size - padding);
      context.stroke();
      drawArrowhead(
        context,
        center.x,
        center.y,
        center.x,
        y * size + size - padding,
        arrowSize
      );
      break;
    case '╚':
      context.beginPath();
      context.moveTo(center.x, y * size + padding);
      context.lineTo(center.x, center.y);
      context.lineTo(x * size + size - padding, center.y);
      context.stroke();
      drawArrowhead(
        context,
        center.x,
        center.y,
        x * size + size - padding,
        center.y,
        arrowSize
      );
      break;
    case '╝':
      context.beginPath();
      context.moveTo(center.x, y * size + padding);
      context.lineTo(center.x, center.y);
      context.lineTo(x * size + padding, center.y);
      context.stroke();
      drawArrowhead(
        context,
        center.x,
        center.y,
        x * size + padding,
        center.y,
        arrowSize
      );
      break;
  }
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

  function createCell(): Cell {
    return {
      collapsed: false,
      options: ['═', '║', '╔', '╗', '╚', '╝'],
      color: Random.pick(colors),
      connections: [],
    };
  }

  function findCellWithLeastEntropy(grid: Cell[][]): [number, number] | null {
    let minEntropy = Infinity;
    let cellCoords: [number, number] | null = null;

    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        const cell = grid[y][x];
        if (
          !cell.collapsed &&
          cell.options.length < minEntropy &&
          cell.options.length > 0
        ) {
          minEntropy = cell.options.length;
          cellCoords = [x, y];
        }
      }
    }

    return cellCoords;
  }

  function collapseCell(grid: Cell[][], x: number, y: number): void {
    const cell = grid[y][x];
    cell.collapsed = true;
    const option: Tile = Random.pick(cell.options);
    cell.options = [option];
    cell.connections = connectionPoints[option];

    // Find all connected cells and update their colors
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

  wrap.render = () => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    let grid: Cell[][] = Array(config.gridSize)
      .fill(0)
      .map(() =>
        Array(config.gridSize)
          .fill(0)
          .map(() => createCell())
      );

    for (let iter = 0; iter < config.gridSize * config.gridSize; iter++) {
      const coords = findCellWithLeastEntropy(grid);
      if (!coords) break;

      const [x, y] = coords;
      collapseCell(grid, x, y);

      const dx = [0, 1, 0, -1];
      const dy = [-1, 0, 1, 0];

      for (let i = 0; i < 4; i++) {
        const newX = x + dx[i];
        const newY = y + dy[i];

        if (
          newX >= 0 &&
          newX < config.gridSize &&
          newY >= 0 &&
          newY < config.gridSize
        ) {
          const neighbor = grid[newY][newX];
          if (!neighbor.collapsed) {
            const currentTile = grid[y][x].options[0];
            neighbor.options = neighbor.options.filter((option) =>
              rules[currentTile].includes(option)
            );
          }
        }
      }
    }

    for (let y = 0; y < config.gridSize; y++) {
      for (let x = 0; x < config.gridSize; x++) {
        const cell = grid[y][x];
        if (cell.collapsed) {
          drawTile(context, x, y, cellSize, cell.options[0], cell.color);
        }
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 3000,
  playFps: 0.3333333333,
  exportFps: 0.3333333333,
};

ssam(sketch, settings);
