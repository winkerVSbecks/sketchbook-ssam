import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
// import { palettes } from '../colors/mindful-palettes';
import { palettes } from '../colors/auto-albers';

const colors = Random.shuffle(Random.pick(palettes));
const bg = colors.pop()!;
// const fg = colors.pop()!;

interface Cell {
  state: number;
  age: number;
}

const config = {
  cellSize: 10,
};

const createGrid = (width: number, height: number): Cell[][] => {
  const grid: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      grid[y][x] = {
        state: 0,
        age: 0,
      };
    }
  }
  // Set initial state in center
  const centerX = Random.rangeFloor(0, width); //Math.floor(width / 2);
  const centerY = Random.rangeFloor(0, height); //Math.floor(height / 2);
  grid[centerY][centerX].state = 1;
  return grid;
};

const updateGrid = (grid: Cell[][]): Cell[][] => {
  const height = grid.length;
  const width = grid[0].length;
  const newGrid = createGrid(width, height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const cell = grid[y][x];
      const neighbors = [
        grid[y - 1][x].state,
        grid[y + 1][x].state,
        grid[y][x - 1].state,
        grid[y][x + 1].state,
      ];
      const activeNeighbors = neighbors.filter((n) => n === 1).length;

      // Growth rules
      if (cell.state === 0 && activeNeighbors === 1) {
        newGrid[y][x].state = 1;
      } else if (cell.state === 1) {
        newGrid[y][x].state = activeNeighbors > 0 ? 1 : 0;
      }

      // Update age
      newGrid[y][x].age = cell.state === 1 ? cell.age + 1 : 0;
    }
  }
  return newGrid;
};

const getColor = (cell: Cell, playhead: number): string => {
  if (cell.state === 0) return bg;
  return colors[Math.floor(playhead * colors.length)];
};

const sketch = ({ context, wrap, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Initialize grid with proper dimensions
  const gridWidth = Math.floor(width / config.cellSize);
  const gridHeight = Math.floor(height / config.cellSize);
  let grid = createGrid(gridWidth, gridHeight);

  wrap.render = ({ width, height, frame, playhead }: SketchProps) => {
    // Clear background
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    if (frame === 0) {
      // Reset grid
      grid = createGrid(gridWidth, gridHeight);
    }

    // Update grid state
    grid = updateGrid(grid);

    // Draw cells
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        const cell = grid[y][x];
        context.fillStyle = getColor(cell, playhead);
        context.fillRect(
          x * config.cellSize,
          y * config.cellSize,
          config.cellSize,
          config.cellSize
        );
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8_000,
  playFps: 8,
  exportFps: 8,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
