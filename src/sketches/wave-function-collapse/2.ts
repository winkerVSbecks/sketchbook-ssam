import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import Color from 'canvas-sketch-util/color';

type Edge = 'connect' | 'empty';
type Tile = {
  shape: '═' | '║' | '╔' | '╗' | '╚' | '╝' | '█' | '▀' | '▄';
  edges: [Edge, Edge, Edge, Edge]; // [top, right, bottom, left]
  colorGroup: number;
};

type Cell = {
  collapsed: boolean;
  options: Tile[];
};

const palette = [
  ['#0066FF', '#003399'], // blue family
  ['#66FF00', '#339900'], // green family
  ['#FF6600', '#993300'], // orange family
];

const tiles: Tile[] = [
  {
    shape: '═',
    edges: ['empty', 'connect', 'empty', 'connect'],
    colorGroup: 0,
  },
  {
    shape: '║',
    edges: ['connect', 'empty', 'connect', 'empty'],
    colorGroup: 0,
  },
  {
    shape: '╔',
    edges: ['empty', 'connect', 'connect', 'empty'],
    colorGroup: 0,
  },
  {
    shape: '╗',
    edges: ['empty', 'empty', 'connect', 'connect'],
    colorGroup: 0,
  },
  {
    shape: '╚',
    edges: ['connect', 'connect', 'empty', 'empty'],
    colorGroup: 0,
  },
  {
    shape: '╝',
    edges: ['connect', 'empty', 'empty', 'connect'],
    colorGroup: 0,
  },
  { shape: '█', edges: ['empty', 'empty', 'empty', 'empty'], colorGroup: 1 },
  { shape: '▀', edges: ['empty', 'empty', 'connect', 'empty'], colorGroup: 2 },
  { shape: '▄', edges: ['connect', 'empty', 'empty', 'empty'], colorGroup: 2 },
];

function drawTile(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tile: Tile
) {
  const padding = size * 0.1;
  const colors = palette[tile.colorGroup];
  context.fillStyle = colors[0];
  context.strokeStyle = colors[0];
  context.lineWidth = size * 0.2;

  switch (tile.shape) {
    case '█':
      context.fillRect(
        x * size + padding,
        y * size + padding,
        size - 2 * padding,
        size - 2 * padding
      );
      break;
    case '▀':
      context.fillRect(
        x * size + padding,
        y * size + padding,
        size - 2 * padding,
        (size - 2 * padding) / 2
      );
      break;
    case '▄':
      context.fillRect(
        x * size + padding,
        y * size + size / 2,
        size - 2 * padding,
        (size - 2 * padding) / 2
      );
      break;
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

function checkCompatible(
  tile1: Tile,
  tile2: Tile,
  direction: 'top' | 'right' | 'bottom' | 'left'
): boolean {
  const edgeMap = {
    top: [0, 2], // tile1's top vs tile2's bottom
    right: [1, 3], // tile1's right vs tile2's left
    bottom: [2, 0], // tile1's bottom vs tile2's top
    left: [3, 1], // tile1's left vs tile2's right
  };

  const [edge1, edge2] = edgeMap[direction];
  return (
    (tile1.edges[edge1] === 'connect' && tile2.edges[edge2] === 'connect') ||
    (tile1.edges[edge1] === 'empty' && tile2.edges[edge2] === 'empty')
  );
}

const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const gridSize = 12;
  const cellSize = width / gridSize;

  function createCell(): Cell {
    return {
      collapsed: false,
      options: [...tiles],
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

  function updateCell(grid: Cell[][], x: number, y: number) {
    const cell = grid[y][x];
    const neighbors = [
      { pos: [x, y - 1], dir: 'top' as const },
      { pos: [x + 1, y], dir: 'right' as const },
      { pos: [x, y + 1], dir: 'bottom' as const },
      { pos: [x - 1, y], dir: 'left' as const },
    ];

    for (const {
      pos: [nx, ny],
      dir,
    } of neighbors) {
      if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
        const neighbor = grid[ny][nx];
        if (!neighbor.collapsed) {
          neighbor.options = neighbor.options.filter((option1) =>
            cell.options.some((option2) =>
              checkCompatible(option2, option1, dir)
            )
          );
        }
      }
    }
  }

  wrap.render = () => {
    context.fillStyle = '#F0F0F0';
    context.fillRect(0, 0, width, height);

    let grid: Cell[][] = Array(gridSize)
      .fill(0)
      .map(() =>
        Array(gridSize)
          .fill(0)
          .map(() => createCell())
      );

    // Collapse wave function
    for (let iter = 0; iter < gridSize * gridSize; iter++) {
      const coords = findCellWithLeastEntropy(grid);
      if (!coords) break;

      const [x, y] = coords;
      const cell = grid[y][x];
      cell.collapsed = true;
      cell.options = [Random.pick(cell.options)];
      updateCell(grid, x, y);
    }

    // Draw the result
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const cell = grid[y][x];
        if (cell.collapsed) {
          drawTile(context, x, y, cellSize, cell.options[0]);
        }
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3000,
  playFps: 0.3333333333,
  exportFps: 0.3333333333,
};

ssam(sketch as Sketch<'2d'>, settings);
