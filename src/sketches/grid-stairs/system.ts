import Random from 'canvas-sketch-util/random';

export type GridPatternConfig = {
  width: number;
  height: number;
  cellSize: number;
  stairCount: number;
  chequerboardCount: number;
};

export function createGrid(gridHeight: number, gridWidth: number) {
  return Array.from({ length: gridHeight }, () =>
    Array.from({ length: gridWidth }, () => Random.value() > 0.5)
  );
}

// function drawPixel(x: number, y: number, cellSize: number, filled?: boolean) {
//   if (filled) {
//     context.fillStyle = '#000';
//     context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
//   }
// }

export function drawGridPattern(
  config: GridPatternConfig,
  drawCell: (x: number, y: number, cellSize: number, filled?: boolean) => void
) {
  const totalOffset = config.cellSize;
  const gridWidth = Math.floor(config.width / totalOffset);
  const gridHeight = Math.floor(config.height / totalOffset);

  function createStairs(startX: number, startY: number, length: number) {
    for (let i = 0; i < length; i++) {
      drawCell(startX + i, startY + i, config.cellSize, true);
    }
  }

  // Draw base grid
  const grid = createGrid(gridHeight, gridWidth);
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      drawCell(x, y, config.cellSize, grid[y][x]);
    }
  }

  // Draw stairs
  for (let i = 0; i < config.stairCount; i++) {
    const startX = Math.floor(Random.value() * (gridWidth - 8));
    const startY = Math.floor(Random.value() * (gridHeight - 8));
    createStairs(startX, startY, 8);
  }

  // Draw chequerboards
  for (let i = 0; i < config.chequerboardCount; i++) {
    const startX = Math.floor(Random.value() * (gridWidth - 5));
    const startY = Math.floor(Random.value() * (gridHeight - 5));
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if ((x + y) % 2 === 0) {
          drawCell(startX + x, startY + y, config.cellSize, true);
        }
      }
    }
  }
}
