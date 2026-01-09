import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { makeGrid } from '../../grid';

Random.setSeed(Random.getRandomSeed());

const config = {
  cols: 128,
  rows: 128,
  gap: [4, 4],
  initialDensity: 0.3, // Probability of a cell being alive initially
};

const bg = '#000';
const fg = '#fff';

function xor(a: number, b: number) {
  return (a || b) && !(a && b);
}

// Game of Life rules
function countNeighbors(
  grid: number[],
  x: number,
  y: number,
  cols: number,
  rows: number
): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      // Wrap around edges (toroidal)
      const nx = (x + dx + cols) % cols;
      const ny = (y + dy + rows) % rows;
      count += grid[ny * cols + nx];
    }
  }
  return count;
}

function stepGameOfLife(
  current: number[],
  cols: number,
  rows: number
): number[] {
  const next: number[] = new Array(current.length).fill(0);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const neighbors = countNeighbors(current, x, y, cols, rows);
      const alive = current[idx];

      // Conway's Game of Life rules
      if (alive) {
        // Cell survives with 2 or 3 neighbors
        next[idx] = neighbors === 2 || neighbors === 3 ? 1 : 0;
      } else {
        // Cell is born with exactly 3 neighbors
        next[idx] = neighbors === 3 ? 1 : 0;
      }
    }
  }

  return next;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const grid = makeGrid({
    width: width,
    height: height,
    cols: config.cols,
    rows: config.rows,
    gapX: config.gap[0],
    gapY: config.gap[1],
  });

  // Initialize pixels with grid data and XOR display value
  let pixels = grid.map((cell) => ({
    ...cell,
    value: 0, // XOR display value
  }));

  // Initialize Game of Life state randomly
  let gameState: number[] = Array.from(
    { length: config.cols * config.rows },
    () => (Random.chance(config.initialDensity) ? 1 : 0)
  );

  // Previous state for XOR rendering
  let prevState: number[] = new Array(config.cols * config.rows).fill(0);

  wrap.render = ({ frame }) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Reset pixels on first frame
    if (frame === 0) {
      pixels = grid.map((cell) => ({
        ...cell,
        value: 0,
      }));
      gameState = Array.from({ length: config.cols * config.rows }, () =>
        Random.chance(config.initialDensity) ? 1 : 0
      );
      prevState = new Array<number>(config.cols * config.rows).fill(0);
    }

    // XOR the current game state with the display pixels
    // This creates interesting interference patterns
    for (let i = 0; i < gameState.length; i++) {
      // XOR the change between previous and current state onto display
      if (gameState[i] !== prevState[i]) {
        pixels[i].value = xor(pixels[i].value, 1) ? 1 : 0;
      }
    }

    // Render pixels
    pixels.forEach((pixel) => {
      if (pixel.value === 1) {
        context.fillStyle = fg;
        context.fillRect(pixel.x, pixel.y, pixel.width, pixel.height);
      }
    });

    // Store current state and evolve
    prevState = [...gameState];
    gameState = stepGameOfLife(gameState, config.cols, config.rows);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: 1,
  animate: true,
  duration: 30_000,
  playFps: 12,
  exportFps: 12,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
