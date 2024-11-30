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
type Cell = {
  collapsed: boolean;
  options: Tile[];
  color: string;
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
  padding: 0, //0.1,
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

const sketch = ({ wrap, context, width, height }: SketchProps) => {
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
      collapseCell(grid[y][x]);

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

ssam(sketch as Sketch<'2d'>, settings);
