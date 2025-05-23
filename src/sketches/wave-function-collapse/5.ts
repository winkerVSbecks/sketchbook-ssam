import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { clrs } from '../../colors/clrs';

const config = {
  gridSize: 24,
  padding: 0,
  branchProbability: 0.3,
  curveVariation: 0.3,
  thicknessVariation: 0.4,
};

const colors = Random.pick([
  ...mindfulPalettes,
  ...autoAlbersPalettes,
  ...clrs,
]);
const bg = colors.pop();

type Tile = 'stem' | 'branch' | 'leaf' | 'curve' | 'split';
type Connection = 'top' | 'right' | 'bottom' | 'left';
type Cell = {
  collapsed: boolean;
  options: Tile[];
  color: string;
  connections: Connection[];
  thickness: number;
  rotation: number;
  curve: number;
};

const connectionPoints: Record<Tile, Connection[]> = {
  stem: ['top', 'bottom'],
  branch: ['bottom', 'right'],
  leaf: ['bottom'],
  curve: ['bottom', 'right'],
  split: ['bottom', 'right', 'left'],
};

// Define opposite directions for connection checking
const oppositeDirection: Record<Connection, Connection> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
};

const rules = {
  stem: ['stem', 'leaf', 'split', 'branch'],
  branch: ['stem', 'leaf', 'curve'],
  leaf: ['stem', 'branch', 'split'],
  curve: ['stem', 'leaf'],
  split: ['stem', 'leaf'],
};

function drawTile(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tile: Tile,
  cell: Cell
) {
  const padding = size * config.padding;
  context.strokeStyle = cell.color;
  context.fillStyle = cell.color;
  context.lineWidth = size * 0.15 * cell.thickness;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const center = {
    x: x * size + size / 2,
    y: y * size + size / 2,
  };

  // Save context state for rotation
  context.save();
  context.translate(center.x, center.y);
  context.rotate(cell.rotation);
  context.translate(-center.x, -center.y);

  switch (tile) {
    case 'stem':
      context.beginPath();
      context.moveTo(center.x, y * size + padding);
      // Add some curve variation
      const cp1x = center.x + size * cell.curve;
      const cp1y = center.y - size * 0.25;
      const cp2x = center.x - size * cell.curve;
      const cp2y = center.y + size * 0.25;
      context.bezierCurveTo(
        cp1x,
        cp1y,
        cp2x,
        cp2y,
        center.x,
        (y + 1) * size - padding
      );
      context.stroke();
      break;

    case 'branch':
      context.beginPath();
      context.moveTo(center.x, y * size + padding);
      // Main stem
      const branchCp1x = center.x + size * cell.curve * 0.5;
      const branchCp1y = center.y;
      context.quadraticCurveTo(
        branchCp1x,
        branchCp1y,
        center.x,
        (y + 1) * size - padding
      );
      // Branch
      context.moveTo(center.x, center.y);
      const branchCp2x = center.x + size * 0.3;
      const branchCp2y = center.y - size * cell.curve * 0.5;
      context.quadraticCurveTo(
        branchCp2x,
        branchCp2y,
        (x + 1) * size - padding,
        center.y
      );
      context.stroke();
      break;

    case 'leaf':
      // Stem
      context.beginPath();
      context.moveTo(center.x, y * size + padding);
      context.lineTo(center.x, center.y);
      context.stroke();
      // Leaf shape
      context.beginPath();
      context.moveTo(center.x, center.y);
      context.bezierCurveTo(
        center.x + size * 0.3,
        center.y - size * 0.2,
        center.x + size * 0.2,
        center.y - size * 0.4,
        center.x,
        center.y - size * 0.3
      );
      context.bezierCurveTo(
        center.x - size * 0.2,
        center.y - size * 0.4,
        center.x - size * 0.3,
        center.y - size * 0.2,
        center.x,
        center.y
      );
      context.fill();
      break;

    case 'curve':
      context.beginPath();
      context.moveTo(center.x, y * size + padding);
      context.quadraticCurveTo(
        center.x + size * cell.curve,
        center.y,
        (x + 1) * size - padding,
        center.y
      );
      context.stroke();
      break;

    case 'split':
      context.beginPath();
      // Main stem
      context.moveTo(center.x, y * size + padding);
      context.lineTo(center.x, center.y);
      // Left branch
      context.moveTo(center.x, center.y);
      const splitCp1x = center.x - size * 0.3;
      const splitCp1y = center.y - size * cell.curve * 0.5;
      context.quadraticCurveTo(
        splitCp1x,
        splitCp1y,
        x * size + padding,
        center.y
      );
      // Right branch
      context.moveTo(center.x, center.y);
      const splitCp2x = center.x + size * 0.3;
      const splitCp2y = center.y - size * cell.curve * 0.5;
      context.quadraticCurveTo(
        splitCp2x,
        splitCp2y,
        (x + 1) * size - padding,
        center.y
      );
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
      options: ['stem', 'branch', 'leaf', 'curve', 'split'],
      color: Random.pick(colors),
      connections: [],
      thickness:
        1 + Random.range(-config.thicknessVariation, config.thicknessVariation),
      rotation: Random.range(-0.1, 0.1),
      curve: Random.range(-config.curveVariation, config.curveVariation),
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

    // If there are any existing colors in the connected group, use one of them
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
          drawTile(context, x, y, cellSize, cell.options[0], cell);
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
