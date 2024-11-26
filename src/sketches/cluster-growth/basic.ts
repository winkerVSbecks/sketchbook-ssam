import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { generateColors } from '../../subtractive-color';

interface GridCell {
  value: number;
  color: string;
}

interface Cell {
  x: number;
  y: number;
  color: string;
  char: string;
}

// Configuration
const config = {
  cellSize: 10,
  gap: 0,
  growthProbabilityMin: 0.05,
  growthProbabilityMax: 0.2,
  initialClusterSize: 3,
  duration: 0.05,
};

const growthProbability = Random.range(
  config.growthProbabilityMin,
  config.growthProbabilityMax
);

const colors = Random.chance()
  ? generateColors()
  : Random.pick([...mindfulPalettes, ...autoAlbersPalettes]);

const bg = colors.pop()!;
const base = colors.pop()!;

const CHARS = Random.shuffle('░▒▓'.split(''));

function letterShuffler(letter: string, t: number, start = 0, end = 1) {
  if (t <= start) return '';
  if (t > end) return letter;

  return end - t < Number.EPSILON ? letter : Random.pick(CHARS);
}

// Utility functions for 1D array indexing
const idx = (x: number, y: number, width: number) => y * width + x;
const inBounds = (x: number, y: number, width: number, height: number) =>
  x >= 0 && x < width && y >= 0 && y < height;

function initCluster(
  grid: GridCell[],
  width: number,
  height: number,
  [cx, cy]: Point
): Cell[] {
  const cells = [];

  // Set initial cluster
  for (
    let y = cy - config.initialClusterSize;
    y < cy + config.initialClusterSize;
    y++
  ) {
    for (
      let x = cx - config.initialClusterSize;
      x < cx + config.initialClusterSize;
      x++
    ) {
      if (inBounds(x, y, width, height)) {
        const color = Random.pick(colors);
        grid[idx(x, y, width)] = {
          value: 1,
          color,
        };
        cells.push({
          x,
          y,
          color,
          char: Random.pick(CHARS),
        });
      }
    }
  }

  return cells;
}

function updateGrid(
  grid: GridCell[],
  cells: Cell[],
  gridWidth: number,
  gridHeight: number
) {
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const i = idx(x, y, gridWidth);

      if (grid[i].value === 1) {
        grid[i].value = 1;
      } else {
        const neighbors = countNeighbors(x, y, grid, gridWidth, gridHeight);
        const neighborColors = getNeighborColorCounts(
          x,
          y,
          grid,
          gridWidth,
          gridHeight
        );
        if (neighbors > 0 && Math.random() < growthProbability) {
          const color = Random.weightedSet(neighborColors);
          grid[i] = { value: 1, color };
          cells.push({
            x,
            y,
            color,
            char: Random.pick(CHARS),
          });
        }
      }
    }
  }

  return grid;
}

function countNeighbors(
  x: number,
  y: number,
  grid: GridCell[],
  width: number,
  height: number
): number {
  let sum = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(nx, ny, width, height) && !(dx === 0 && dy === 0)) {
        sum += grid[idx(nx, ny, width)].value;
      }
    }
  }
  return sum;
}

function getNeighborColorCounts(
  x: number,
  y: number,
  grid: GridCell[],
  width: number,
  height: number
) {
  const colorCounts = new Map<string, number>();

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(nx, ny, width, height) && !(dx === 0 && dy === 0)) {
        const color = grid[idx(nx, ny, width)].color;
        if (colorCounts.has(color)) {
          colorCounts.set(color, colorCounts.get(color)! + 1);
        } else {
          colorCounts.set(color, 1);
        }
      }
    }
  }

  const colors = Array.from(colorCounts.entries()).map(([value, weight]) => ({
    value,
    weight,
  }));

  return colors;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const totalOffset = config.cellSize + config.gap;
  const gridWidth = Math.floor(width / totalOffset);
  const gridHeight = Math.floor(height / totalOffset);

  let grid = Array.from({ length: width * height }, () => {
    return { value: 0, color: '' };
  });
  let cells = initCluster(grid, gridWidth, gridHeight, [
    Math.floor(Random.range(gridWidth)),
    Math.floor(Random.range(gridHeight)),
  ]);

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    if (playhead === 0) {
      grid = Array.from({ length: width * height }, () => {
        return { value: 0, color: '' };
      });
      cells = initCluster(grid, gridWidth, gridHeight, [
        Math.floor(gridWidth / 2),
        Math.floor(gridHeight / 2),
      ]);
    }

    // Clear canvas
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Update state
    updateGrid(grid, cells, gridWidth, gridHeight);

    const t = mapRange(playhead, 0, 0.8, 0, 1, true);

    context.font = `${config.cellSize}px jgs7`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Draw grid
    context.fillStyle = base;
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        context.fillText(
          '·',
          Math.round(x * totalOffset) + config.cellSize / 2,
          Math.round(y * totalOffset) + config.cellSize / 2
        );
      }
    }

    // Draw cells
    cells.forEach((cell, cIdx) => {
      const x = Math.round(cell.x * totalOffset) + config.cellSize / 2;
      const y = Math.round(cell.y * totalOffset) + config.cellSize / 2;

      const start = mapRange(
        cIdx,
        0,
        cells.length,
        0,
        1 - config.duration,
        true
      );
      const cT = mapRange(t, start, start + config.duration, 0, 1, true);
      const char = cT === 0 ? '·' : letterShuffler(cell.char, cT);
      const color = cT === 0 ? base : cell.color;

      context.fillStyle = color;
      context.fillText(char, x, y);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 12_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
