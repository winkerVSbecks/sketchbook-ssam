import Random from 'canvas-sketch-util/random';

export type GridPatternConfig = {
  gridSize: number;
  colors: string[];
  stairCount: number;
  chequerboardCount: number;
  backgroundColor?: string;
};

export function createGrid(size: number) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => Random.value() > 0.5)
  );
}

export function drawGridPattern(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: GridPatternConfig
) {
  const cellSize = width / config.gridSize;
  const backgroundColor = config.backgroundColor || '#F0F0F0';

  function drawPixel(x: number, y: number, filled: boolean) {
    if (filled) {
      context.fillStyle = Random.pick(config.colors);
      context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  function createStairs(startX: number, startY: number, length: number) {
    for (let i = 0; i < length; i++) {
      drawPixel(startX + i, startY + i, true);
    }
  }

  // Clear background
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, width, height);

  // Draw base grid
  const grid = createGrid(config.gridSize);
  for (let y = 0; y < config.gridSize; y++) {
    for (let x = 0; x < config.gridSize; x++) {
      drawPixel(x, y, grid[y][x]);
    }
  }

  // Draw stairs
  for (let i = 0; i < config.stairCount; i++) {
    const startX = Math.floor(Random.value() * (config.gridSize - 8));
    const startY = Math.floor(Random.value() * (config.gridSize - 8));
    createStairs(startX, startY, 8);
  }

  // Draw chequerboards
  for (let i = 0; i < config.chequerboardCount; i++) {
    const startX = Math.floor(Random.value() * (config.gridSize - 5));
    const startY = Math.floor(Random.value() * (config.gridSize - 5));
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if ((x + y) % 2 === 0) {
          drawPixel(startX + x, startY + y, true);
        }
      }
    }
  }
}
