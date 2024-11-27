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

interface Cluster {
  grid: GridCell[];
  cells: Cell[];
  colors: string[];
  baseColor: string;
  radius: number;
}

// Configuration
const config = {
  cellSize: 10,
  gap: 0,
  growthProbabilityMin: 0.05,
  growthProbabilityMax: 0.2,
  initialClusterSize: 8,
  duration: 0.05,
};

const CHARS = Random.shuffle('░▒▓'.split(''));
// const CHARS = Random.shuffle('▀▁▂▃▆█░▒▓'.split(''));

// Utility functions
const idx = (x: number, y: number, width: number) => y * width + x;
const inBounds = (x: number, y: number, width: number, height: number) =>
  x >= 0 && x < width && y >= 0 && y < height;

function letterShuffler(letter: string, t: number, start = 0, end = 1) {
  if (t <= start) return '';
  if (t > end) return letter;
  return end - t < Number.EPSILON ? letter : Random.pick(CHARS);
}

const colors = Random.chance()
  ? generateColors()
  : Random.pick([...mindfulPalettes, ...autoAlbersPalettes]);

function createCluster(width: number, height: number): Cluster {
  return {
    grid: Array.from({ length: width * height }, () => ({
      value: 0,
      color: '',
    })),
    cells: [],
    colors: colors.slice(0, -1),
    baseColor: colors[colors.length - 1],
    radius: Random.range(0.2, 0.5),
  };
}

function initCluster(
  cluster: Cluster,
  width: number,
  height: number,
  [cx, cy]: Point
): void {
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
        const color = Random.pick(cluster.colors);
        cluster.grid[idx(x, y, width)] = { value: 1, color };
        cluster.cells.push({
          x,
          y,
          color,
          char: Random.pick(CHARS),
        });
      }
    }
  }
}

function updateCluster(
  cluster: Cluster,
  gridWidth: number,
  gridHeight: number,
  growthProbability: number
): void {
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const i = idx(x, y, gridWidth);

      if (cluster.grid[i].value === 1) continue;

      if (cluster.cells.length > gridWidth * gridHeight * cluster.radius)
        continue;

      const neighbors = countNeighbors(
        x,
        y,
        cluster.grid,
        gridWidth,
        gridHeight
      );
      const neighborColors = getNeighborColorCounts(
        x,
        y,
        cluster.grid,
        gridWidth,
        gridHeight
      );

      if (neighbors > 0 && Math.random() < growthProbability) {
        const color = Random.weightedSet(neighborColors);
        cluster.grid[i] = { value: 1, color };
        cluster.cells.push({
          x,
          y,
          color,
          char: Random.pick(CHARS),
        });
      }
    }
  }
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
        const cell = grid[idx(nx, ny, width)];
        if (cell.value === 1) {
          colorCounts.set(cell.color, (colorCounts.get(cell.color) || 0) + 1);
        }
      }
    }
  }

  return Array.from(colorCounts.entries()).map(([value, weight]) => ({
    value,
    weight,
  }));
}

function drawCluster(
  cluster: Cluster,
  context: CanvasRenderingContext2D,
  gridWidth: number,
  gridHeight: number,
  playhead: number
): void {
  const totalOffset = config.cellSize + config.gap;
  const t = mapRange(playhead, 0, 0.8, 0, 1, true);

  // Draw base grid
  context.fillStyle = cluster.baseColor;
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      context.fillText(
        '·',
        Math.round(x * totalOffset) + config.cellSize / 2,
        Math.round(y * totalOffset) + config.cellSize / 2
      );
    }
  }

  // Draw active cells
  cluster.cells.forEach((cell, cIdx) => {
    const x = Math.round(cell.x * totalOffset) + config.cellSize / 2;
    const y = Math.round(cell.y * totalOffset) + config.cellSize / 2;

    const start = mapRange(
      cIdx,
      0,
      cluster.cells.length,
      0,
      1 - config.duration,
      true
    );
    const cT = mapRange(t, start, start + config.duration, 0, 1, true);
    const char = cT === 0 ? '·' : letterShuffler(cell.char, cT);
    const color = cT === 0 ? cluster.baseColor : cell.color;

    context.fillStyle = color;
    context.fillText(char, x, y);
  });
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const totalOffset = config.cellSize + config.gap;
  const gridWidth = Math.floor(width / totalOffset);
  const gridHeight = Math.floor(height / totalOffset);

  const growthProbability = Random.range(
    config.growthProbabilityMin,
    config.growthProbabilityMax
  );

  // Create multiple clusters
  const clusters = Array.from({ length: 6 }, () =>
    createCluster(gridWidth, gridHeight)
  );

  // Initialize each cluster at different positions
  clusters.forEach((cluster, i) => {
    const x = Random.rangeFloor(gridWidth);
    const y = Random.rangeFloor(gridHeight);
    initCluster(cluster, gridWidth, gridHeight, [x, y]);
  });

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    // Reset on loop
    if (playhead === 0) {
      clusters.forEach((cluster, i) => {
        cluster.grid = Array.from({ length: width * height }, () => ({
          value: 0,
          color: '',
        }));
        cluster.cells = [];
        const x = Random.rangeFloor(gridWidth);
        const y = Random.rangeFloor(gridHeight);
        initCluster(cluster, gridWidth, gridHeight, [x, y]);
      });
    }

    // Clear canvas with first cluster's base color
    context.fillStyle = clusters[0].baseColor;
    context.fillRect(0, 0, width, height);

    // Setup text rendering
    context.font = `${config.cellSize}px jgs7`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Update and draw all clusters
    clusters.forEach((cluster) => {
      updateCluster(cluster, gridWidth, gridHeight, growthProbability);
      drawCluster(cluster, context, gridWidth, gridHeight, playhead);
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
