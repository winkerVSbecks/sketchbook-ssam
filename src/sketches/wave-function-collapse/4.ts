import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { generateColors } from '../../subtractive-color';
import { clrs } from '../../colors/clrs';

const colors = Random.chance()
  ? generateColors()
  : Random.pick([...mindfulPalettes, ...autoAlbersPalettes, ...clrs]);
const bg = colors.pop();

type Tile = '═' | '║' | '╔' | '╗' | '╚' | '╝';
type Connection = 'top' | 'right' | 'bottom' | 'left';
type Cell = {
  collapsed: boolean;
  options: Tile[];
  color: string;
  connections: Connection[];
};

// Define which sides each tile connects to
const connectionPoints: Record<Tile, Connection[]> = {
  '═': ['left', 'right'],
  '║': ['top', 'bottom'],
  '╔': ['right', 'bottom'],
  '╗': ['left', 'bottom'],
  '╚': ['right', 'top'],
  '╝': ['left', 'top'],
};

const rules = {
  '═': ['═', '╔', '╗', '╚', '╝'],
  '║': ['║', '╔', '╗', '╚', '╝'],
  '╔': ['═', '║', '╝'],
  '╗': ['═', '║', '╚'],
  '╚': ['═', '║', '╗'],
  '╝': ['═', '║', '╔'],
};

const config = {
  gridSize: 24,
  padding: 0,
};

function drawTile(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tile: Tile,
  color: string = '#0066FF'
) {
  const padding = size * config.padding;
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = size * 0.2;

  switch (tile) {
    case '═':
      context.beginPath();
      context.moveTo(x * size + padding, y * size + size / 2);
      context.lineTo(x * size + size - padding, y * size + size / 2);
      context.stroke();
      break;
    case '║':
      context.beginPath();
      context.moveTo(x * size + size / 2, y * size + padding);
      context.lineTo(x * size + size / 2, y * size + size - padding);
      context.stroke();
      break;
    case '╔':
      context.beginPath();
      context.moveTo(x * size + size - padding, y * size + size / 2);
      context.lineTo(x * size + size / 2, y * size + size / 2);
      context.lineTo(x * size + size / 2, y * size + size - padding);
      context.stroke();
      break;
    case '╗':
      context.beginPath();
      context.moveTo(x * size + padding, y * size + size / 2);
      context.lineTo(x * size + size / 2, y * size + size / 2);
      context.lineTo(x * size + size / 2, y * size + size - padding);
      context.stroke();
      break;
    case '╚':
      context.beginPath();
      context.moveTo(x * size + size / 2, y * size + padding);
      context.lineTo(x * size + size / 2, y * size + size / 2);
      context.lineTo(x * size + size - padding, y * size + size / 2);
      context.stroke();
      break;
    case '╝':
      context.beginPath();
      context.moveTo(x * size + size / 2, y * size + padding);
      context.lineTo(x * size + size / 2, y * size + size / 2);
      context.lineTo(x * size + padding, y * size + size / 2);
      context.stroke();
      break;
  }
}

function getConnectingColor(
  grid: Cell[][],
  x: number,
  y: number,
  tile: Tile
): string | null {
  const connections = connectionPoints[tile];
  const neighbors: Array<{ dir: Connection; color: string | null }> = [];

  // Check each neighboring cell
  if (y > 0 && grid[y - 1][x].collapsed) {
    const topTile = grid[y - 1][x].options[0];
    if (connectionPoints[topTile].includes('bottom')) {
      neighbors.push({ dir: 'top', color: grid[y - 1][x].color });
    }
  }
  if (x < grid[0].length - 1 && grid[y][x + 1].collapsed) {
    const rightTile = grid[y][x + 1].options[0];
    if (connectionPoints[rightTile].includes('left')) {
      neighbors.push({ dir: 'right', color: grid[y][x + 1].color });
    }
  }
  if (y < grid.length - 1 && grid[y + 1][x].collapsed) {
    const bottomTile = grid[y + 1][x].options[0];
    if (connectionPoints[bottomTile].includes('top')) {
      neighbors.push({ dir: 'bottom', color: grid[y + 1][x].color });
    }
  }
  if (x > 0 && grid[y][x - 1].collapsed) {
    const leftTile = grid[y][x - 1].options[0];
    if (connectionPoints[leftTile].includes('right')) {
      neighbors.push({ dir: 'left', color: grid[y][x - 1].color });
    }
  }

  // Find matching connections
  for (const connection of connections) {
    const matchingNeighbor = neighbors.find((n) => n.dir === connection);
    if (matchingNeighbor) {
      return matchingNeighbor.color;
    }
  }

  return null;
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

    // Check for connecting neighbors and update color
    const connectingColor = getConnectingColor(grid, x, y, option);
    if (connectingColor) {
      cell.color = connectingColor;
    }

    cell.connections = connectionPoints[option];
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
