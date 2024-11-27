import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

type Tile = '═' | '║' | '╔' | '╗' | '╚' | '╝' | '█' | '▀' | '▄';
type Cell = {
  collapsed: boolean;
  options: Tile[];
};

const rules = {
  '═': ['═', '╔', '╗', '╚', '╝'],
  '║': ['║', '╔', '╗', '╚', '╝'],
  '╔': ['═', '║', '╝'],
  '╗': ['═', '║', '╚'],
  '╚': ['═', '║', '╗'],
  '╝': ['═', '║', '╔'],
  '█': ['█', '▀', '▄'],
  '▀': ['█', '▀'],
  '▄': ['█', '▄'],
};

function drawTile(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tile: Tile
) {
  const padding = size * 0.1;
  context.fillStyle = '#0066FF';
  context.strokeStyle = '#0066FF';
  context.lineWidth = size * 0.2;

  switch (tile) {
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
      options: ['═', '║', '╔', '╗', '╚', '╝', '█', '▀', '▄'],
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

  function collapseCell(cell: Cell): void {
    cell.collapsed = true;
    const option = Random.pick(cell.options);
    cell.options = [option];
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

    for (let iter = 0; iter < gridSize * gridSize; iter++) {
      const coords = findCellWithLeastEntropy(grid);
      if (!coords) break;

      const [x, y] = coords;
      collapseCell(grid[y][x]);

      const dx = [0, 1, 0, -1];
      const dy = [-1, 0, 1, 0];

      for (let i = 0; i < 4; i++) {
        const newX = x + dx[i];
        const newY = y + dy[i];

        if (newX >= 0 && newX < gridSize && newY >= 0 && newY < gridSize) {
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
  dimensions: [400, 400],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3000,
  playFps: 0.3333333333,
  exportFps: 0.3333333333,
};

ssam(sketch as Sketch<'2d'>, settings);
