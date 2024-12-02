import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { SketchProps } from 'ssam';
import * as tome from 'chromotome';

export interface Point {
  x: number;
  y: number;
}

export interface GridCell {
  value: number;
  color: string;
}

export interface Cell {
  x: number;
  y: number;
  color: string;
  char: string;
}

export interface Cluster {
  grid: GridCell[];
  cells: Cell[];
  colors: string[];
  baseColor: string;
  radius: number;
  state: 'growing' | 'stable';
}

export interface ClusterConfig {
  mode?: 'ascii' | 'pixel';
  clusterCount?: number;
  cellSize: number;
  gap: number;
  growthProbabilityMin: number;
  growthProbabilityMax: number;
  initialClusterSize: number;
  radiusRange?: [number, number];
  width: number;
  height: number;
  colors?: string[];
  background?: string;
  renderBackground?: boolean;
  renderBaseGrid?: boolean;
  chars?: string[];
}

// Utility functions
const idx = (x: number, y: number, width: number) => y * width + x;

const inBounds = (x: number, y: number, width: number, height: number) =>
  x >= 0 && x < width && y >= 0 && y < height;

export function createCluster(
  width: number,
  height: number,
  colors: string[],
  radiusRange: [number, number]
): Cluster {
  return {
    state: 'growing',
    grid: Array.from({ length: width * height }, () => ({
      value: 0,
      color: '',
    })),
    cells: [],
    colors: colors.slice(0, -1),
    baseColor: colors[colors.length - 1],
    radius: Random.range(radiusRange[0], radiusRange[1]),
  };
}

export function initCluster(
  cluster: Cluster,
  width: number,
  height: number,
  center: Point,
  config: ClusterConfig
): Cluster {
  const chars = config.chars || Random.shuffle('░▒▓'.split(''));
  const [cx, cy] = [center.x, center.y];
  const newCluster = { ...cluster, cells: [...cluster.cells] };

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
        newCluster.grid[idx(x, y, width)] = { value: 1, color };
        newCluster.cells.push({
          x,
          y,
          color,
          char: Random.pick(chars),
        });
      }
    }
  }

  return newCluster;
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

export function updateCluster(
  cluster: Cluster,
  gridWidth: number,
  gridHeight: number,
  growthProbability: number,
  config: ClusterConfig
): Cluster {
  const chars = config.chars || Random.shuffle('░▒▓'.split(''));
  const newCluster = { ...cluster, cells: [...cluster.cells] };
  const newGrid = [...cluster.grid];

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const i = idx(x, y, gridWidth);

      if (newGrid[i].value === 1) continue;

      if (newCluster.cells.length > gridWidth * gridHeight * cluster.radius) {
        newCluster.state = 'stable';
        continue;
      }

      const neighbors = countNeighbors(x, y, newGrid, gridWidth, gridHeight);
      const neighborColors = getNeighborColorCounts(
        x,
        y,
        newGrid,
        gridWidth,
        gridHeight
      );

      if (neighbors > 0 && Math.random() < growthProbability) {
        const color = Random.weightedSet(neighborColors);
        newGrid[i] = { value: 1, color };
        newCluster.cells.push({
          x,
          y,
          color,
          char: Random.pick(chars),
        });
      }
    }
  }

  newCluster.grid = newGrid;
  return newCluster;
}

export function drawCluster(
  cluster: Cluster,
  context: CanvasRenderingContext2D,
  gridWidth: number,
  gridHeight: number,
  playhead: number,
  config: ClusterConfig
): void {
  const totalOffset = config.cellSize + config.gap;
  const t = mapRange(playhead, 0, 0.8, 0, 1, true);

  if (config.renderBaseGrid) {
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
  }

  const offset = config.cellSize / 2;

  // Draw active cells
  cluster.cells.forEach((cell) => {
    const x = Math.round(cell.x * totalOffset);
    const y = Math.round(cell.y * totalOffset);

    context.fillStyle = cell.color;

    if (config.mode === 'ascii') {
      context.fillText(cell.char, x + offset, y + offset);
    } else {
      context.fillRect(x, y, config.cellSize, config.cellSize);
    }
  });
}

export function createClusterSystem(
  config: ClusterConfig = {
    cellSize: 10,
    gap: 0,
    growthProbabilityMin: 0.05,
    growthProbabilityMax: 0.2,
    initialClusterSize: 8,
    width: 1080,
    height: 1080,
    renderBackground: true,
    renderBaseGrid: true,
  }
) {
  config.mode ??= 'ascii';
  config.chars ??= '░▒▓'.split('');
  config.clusterCount ??= 6;
  config.radiusRange ??= [0.2, 0.5];
  const fallbackPalette = tome.get();
  const colors = config.colors || fallbackPalette.colors;
  const background = config.background || fallbackPalette.background;

  const totalOffset = config.cellSize + config.gap;
  const gridWidth = Math.floor(config.width / totalOffset);
  const gridHeight = Math.floor(config.height / totalOffset);

  const growthProbability = Random.range(
    config.growthProbabilityMin,
    config.growthProbabilityMax
  );

  // Create multiple clusters
  let clusters = Array.from({ length: config.clusterCount }, () =>
    createCluster(gridWidth, gridHeight, colors, config.radiusRange!)
  );

  // Initialize each cluster at different positions
  clusters = clusters.map((cluster) => {
    const x = Random.rangeFloor(gridWidth);
    const y = Random.rangeFloor(gridHeight);
    return initCluster(cluster, gridWidth, gridHeight, { x, y }, config);
  });

  return ({ width, height, playhead, context }: SketchProps) => {
    // Reset on loop
    if (playhead === 0) {
      clusters = Array.from({ length: config.clusterCount! }, () =>
        createCluster(gridWidth, gridHeight, colors, config.radiusRange!)
      );

      // Initialize each cluster at different positions
      clusters = clusters.map((cluster) => {
        const x = Random.rangeFloor(gridWidth);
        const y = Random.rangeFloor(gridHeight);
        return initCluster(cluster, gridWidth, gridHeight, { x, y }, config);
      });
    }

    if (config.renderBackground) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }

    // Setup text rendering
    if (config.mode === 'ascii') {
      context.font = `${config.cellSize}px jgs7`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
    }

    clusters = clusters.map((cluster) => {
      if (cluster.state === 'growing') {
        return updateCluster(
          cluster,
          gridWidth,
          gridHeight,
          growthProbability,
          config
        );
      }
      return cluster;
    });

    clusters.forEach((cluster) => {
      drawCluster(cluster, context, gridWidth, gridHeight, playhead, config);
    });
  };
}
